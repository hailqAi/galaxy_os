"""Một runtime local; manifest riêng ngoài Git, không migrate hoặc seed."""

from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import urllib.request
import uuid

CONFIG_KEYS = {
    "DATABASE_URL",
    "API_PORT",
    "NODE_ENV",
    "FILE_STORAGE_PATH",
    "LOCAL_UPLOAD_PATH",
    "AVATAR_STORAGE_PATH",
    "SESSION_COOKIE_NAME",
    "FEATURE_PROJECT_CHAT",
    "FEATURE_PROJECT_AI",
    "M2_DEPLOYMENT_TARGET",
    "GALAXY_TEST_ISOLATION",
    "FEATURE_MARKETING",
    "ALLOW_DEV_AUTH",
    "APP_PUBLIC_ORIGIN",
    "INTERNAL_API_URL",
    "REDIS_URL",
    "TRUST_PROXY",
    "TRUSTED_PUBLIC_HOSTS",
    "GALAXY_INTERNAL_HTTP_ORIGINS",
    "GALAXY_PUBLIC_ACCESS",
    "GALAXY_EDGE_PROOF",
    "GALAXY_RELEASE_ID",
}

def process_cgroup(pid):
    for line in (Path('/proc') / str(pid) / 'cgroup').read_text().splitlines():
        if line.startswith('0::'):
            return line[3:]
    raise RuntimeError('Không tìm thấy unified systemd cgroup')


def digest(path):
    path = Path(path)
    h = hashlib.sha256()
    files = (
        sorted(p for p in path.rglob("*") if p.is_file()) if path.is_dir() else [path]
    )
    for file in files:
        h.update(str(file.relative_to(path) if path.is_dir() else file.name).encode())
        h.update(file.read_bytes())
    return h.hexdigest()


def identity(pid):
    root = Path("/proc") / str(pid)
    stat = (root / "stat").read_text()
    fields = stat[stat.rindex(")") + 2 :].split()
    return {
        "pid": pid,
        "ppid": int(fields[1]),
        "pgid": int(fields[2]),
        "startTicks": fields[19],
        "uid": root.stat().st_uid,
        "cwd": str((root / "cwd").resolve(strict=True)),
        "exe": str((root / "exe").resolve(strict=True)),
        "command": (root / "cmdline").read_bytes().decode().rstrip("\0").split("\0"),
    }


def process_environment(pid):
    return dict(
        part.split("=", 1)
        for part in (Path("/proc") / str(pid) / "environ")
        .read_bytes()
        .decode()
        .split("\0")
        if "=" in part
    )


def listeners(port):
    result = subprocess.run(
        ["ss", "-H", "-ltnp", f"sport = :{port}"],
        capture_output=True,
        text=True,
        check=True,
    )
    if result.stderr.strip():
        raise RuntimeError("Không đủ quyền kiểm listener: " + result.stderr.strip())
    if not result.stdout.strip():
        return []
    pids = sorted(set(int(x) for x in re.findall(r"pid=(\d+)", result.stdout)))
    # Socket occupied without an inspectable owner is never a free port.
    if any("pid=" not in line for line in result.stdout.splitlines()):
        raise RuntimeError(f"Cổng {port} có listener chưa xác minh được chủ")
    return pids


class ControlPlaneUnavailable(RuntimeError):
    def __init__(self):
        super().__init__('CONTROL_PLANE_UNAVAILABLE: không nối được user manager của UID hiện tại; kiểm owner/session và socket. Không tự phục hồi D-Bus hoặc khởi chạy stack khác.')


class Runtime:
    def __init__(self, config, folder, timeout=40):
        self.config, self.folder, self.timeout = config, Path(folder), timeout
        self.children = {}
        self.folder.mkdir(parents=True, exist_ok=True, mode=0o700)

    def unit(self, spec):
        unit = spec['systemdUnit']
        if not re.fullmatch(r'galaxy-os-(api|web)\.service', unit):
            raise RuntimeError('Chỉ quản lý exact Galaxy Web/API units')
        return unit

    def unit_state(self, spec):
        try:
            output = subprocess.check_output(['systemctl', '--user', 'show', self.unit(spec), '--property=ActiveState,MainPID,ControlGroup', '--no-pager'], text=True, stderr=subprocess.PIPE, timeout=5, env={**os.environ, 'LC_ALL': 'C'})
        except subprocess.TimeoutExpired as error:
            raise ControlPlaneUnavailable() from error
        except subprocess.CalledProcessError as error:
            if 'Failed to connect to bus' in (error.stderr or ''):
                raise ControlPlaneUnavailable() from error
            raise RuntimeError(f'systemctl {self.unit(spec)}: {(error.stderr or str(error)).strip()[:2000]}') from error
        return dict(line.split('=', 1) for line in output.splitlines() if '=' in line)

    def unit_owned(self, pid, spec, state):
        main = int(state.get('MainPID', '0'))
        group = state.get('ControlGroup', '')
        return state.get('ActiveState') == 'active' and main > 0 and group.endswith('/' + self.unit(spec)) and self.matches(main, spec) and process_cgroup(main) == group and process_cgroup(pid) == group

    def stop_unit(self, name, spec):
        state = self.inspect(name, spec)
        unit_state = self.unit_state(spec)
        main_pid = int(unit_state.get('MainPID', '0'))
        if main_pid and not self.unit_owned(main_pid, spec, unit_state):
            raise RuntimeError(f'{name}: unit identity không khớp; không dừng')
        if state['managed'] or state['pid'] is None:
            subprocess.run(['systemctl', '--user', 'stop', self.unit(spec)], check=True)

    def logs(self):
        units = [self.unit(spec) for spec in self.config['services'].values() if spec.get('systemdUnit')]
        if len(units) != len(self.config['services']):
            raise RuntimeError('local:logs cần runtime systemd; log cũ nằm trong local-managed')
        return subprocess.run(['journalctl', '--user', '--follow', '--no-pager', *[argument for unit in units for argument in ['--unit', unit]]], check=True).returncode

    def serve(self, name):
        if name not in self.config['services']:
            raise RuntimeError('Service không có trong manifest')
        spec = self.config['services'][name]
        if not process_cgroup(os.getpid()).endswith('/' + self.unit(spec)):
            raise RuntimeError('serve chỉ chạy trong exact systemd service cgroup')
        self.check_files()
        self.check_database()
        env = self.environment(spec)
        if not env.get('GALAXY_LOCAL_RUNTIME_TOKEN'):
            raise RuntimeError('Thiếu runtime token trong private environment')
        os.chdir(spec['cwd'])
        os.execve(spec['command'][0], spec['command'], {**env, 'PATH': os.environ['PATH']})

    @contextmanager
    def lock(self):
        with (self.folder / "lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def load(self):
        path = self.folder / "processes.json"
        return json.loads(path.read_text()) if path.exists() else {}

    def save(self, records):
        path = self.folder / "processes.tmp"
        path.write_text(json.dumps(records, indent=2))
        path.chmod(0o600)
        path.replace(self.folder / "processes.json")

    def check_files(self):
        for name, spec in self.config["services"].items():
            for path, expected in spec["fingerprints"].items():
                if not Path(path).exists() or digest(path) != expected:
                    raise RuntimeError(
                        f"{name}: source/build/config đã đổi: {path}; cần kiểm tương thích và cập nhật manifest"
                    )

    def check_database(self):
        if "schemaProbe" not in self.config:
            return None
        api = self.config["services"]["api"]
        observed = json.loads(
            subprocess.check_output(
                self.config["schemaProbe"],
                cwd=api["cwd"],
                env={**self.environment(api), "PATH": os.environ["PATH"]},
                text=True,
                timeout=15,
            )
        )
        if observed != self.config["expectedSchema"]:
            raise RuntimeError(
                "Database/schema/migration local khác manifest đã đối soát; không tự khởi chạy/migrate"
            )
        return {
            "name": observed["name"],
            "schema": observed["schema"],
            "applied": len(observed.get("migrations", [])),
            "verified": True,
        }

    def environment_matches(self, pid, spec):
        env, expected = process_environment(pid), self.environment(spec)
        keys = set(expected) | CONFIG_KEYS
        return all(env.get(key) == expected.get(key) for key in spec['identityKeys']) and all(env[key] == expected.get(key) for key in keys if key in env and key != 'PATH')

    def matches(self, pid, spec):
        # Next uses a server child whose process title replaces argv; verify its
        # actual launcher ancestor as well as the listener's cwd and executable.
        current = identity(pid)
        if spec.get('systemdUnit') and current['uid'] == os.getuid() and process_cgroup(pid).endswith('/' + self.unit(spec)):
            name = self.unit(spec).removeprefix('galaxy-os-').removesuffix('.service')
            wrapper = ['/usr/bin/python3', spec.get('controllerPath', str(Path(__file__).resolve())), 'serve', name]
            if current['command'] == wrapper and current['cwd'] == self.config.get('runtimeRoot') and current['exe'] == str(Path('/usr/bin/python3').resolve()):
                return self.environment_matches(pid, spec)
        if (
            current["cwd"] != str(Path(spec["cwd"]).resolve())
            or current["uid"] != os.getuid()
        ):
            return False
        if current["exe"] != str(Path(spec["command"][0]).resolve()):
            return False
        if spec.get('systemdUnit') and spec.get('processTitle') and current['command'] == [spec['processTitle']] and process_cgroup(pid).endswith('/' + self.unit(spec)):
            expected = self.environment(spec)
            return bool(expected.get('GALAXY_LOCAL_RUNTIME_TOKEN')) and self.environment_matches(pid, spec)
        for _ in range(6):
            if current["command"] == spec["command"] and current["cwd"] == spec["cwd"]:
                # Node --env-file preserves inherited values. Check every inherited
                # trust-boundary override, including keys absent from the env file.
                return self.environment_matches(current['pid'], spec)
            if current["ppid"] < 2:
                return False
            current = identity(current["ppid"])
        return False

    def environment(self, spec):
        values = {}
        if spec.get("envFile"):
            output = subprocess.check_output(
                [
                    "/usr/bin/node",
                    "-e",
                    "process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1],'utf8'))))",
                    spec["envFile"],
                ],
                text=True,
            )
            values = json.loads(output)
        return {**values, **spec["environment"]}

    def healthy(self, spec):
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(
                f"http://127.0.0.1:{spec['port']}{spec['health']}", timeout=2
            ) as response:
                body = json.load(response)
                expected = spec.get(
                    "readyBody", {"status": "ok", "service": spec["service"]}
                )
                return response.status == 200 and all(
                    body.get(k) == v for k, v in expected.items()
                )
        except (OSError, ValueError):
            return False

    def inspect(self, name, spec):
        pids = listeners(spec["port"])
        control_error = None
        try:
            unit_state = self.unit_state(spec) if spec.get('systemdUnit') else None
        except ControlPlaneUnavailable as error:
            unit_state, control_error = None, str(error)
        result = {
            "port": spec["port"],
            "pid": None,
            "cwd": spec["cwd"],
            "state": "STOPPED",
            "managed": False,
        }
        if control_error:
            result.update(controlPlane='CONTROL_PLANE_UNAVAILABLE', diagnostic=control_error)
        if not pids:
            if control_error:
                result['state'] = 'APP_DOWN'
            if unit_state and unit_state.get('ActiveState') in ['active', 'activating', 'deactivating']:
                result['state'] = 'NOT_READY'
            return result
        if len(pids) != 1 or not self.matches(pids[0], spec):
            raise RuntimeError(
                f"{name}: cổng {spec['port']} thuộc PID {pids}; identity/config không khớp, không dừng hoặc spawn"
            )
        if control_error:
            result.update(pid=pids[0], state='APP_SERVING' if self.healthy(spec) else 'APP_NOT_READY')
            return result
        record = self.load().get(name, {})
        current = identity(pids[0])
        if unit_state is not None:
            if not self.unit_owned(pids[0], spec, unit_state):
                raise RuntimeError(f'{name}: listener không thuộc exact active systemd unit; không signal hoặc spawn')
            result.update(pid=pids[0], state='READY' if self.healthy(spec) else 'NOT_READY', managed=True, systemdUnit=self.unit(spec))
            return result
        result.update(
            pid=pids[0],
            state="READY" if self.healthy(spec) else "NOT_READY",
            managed=current["pgid"] == record.get("pgid")
            and process_environment(pids[0]).get("GALAXY_LOCAL_RUNTIME_TOKEN")
            == record.get("token")
            and bool(record.get("token")),
        )
        return result

    def status(self):
        self.check_files()
        services = {
            name: self.inspect(name, spec)
            for name, spec in self.config["services"].items()
        }
        return {
            "runtimeRoot": self.config["runtimeRoot"],
            "identity": self.config.get("identity", {}),
            "databaseReadOnlyCheck": self.check_database(),
            "state": "CONTROL_PLANE_UNAVAILABLE"
            if any(s.get('controlPlane') == 'CONTROL_PLANE_UNAVAILABLE' for s in services.values())
            else "READY"
            if all(s["state"] == "READY" for s in services.values())
            else "PARTIAL",
            "services": services,
        }

    def verify_artifacts(self):
        self.check_files()
        bundle = Path(self.config["services"]["web"]["cwd"]) / ".next/static"
        if not bundle.is_dir():
            raise RuntimeError("Selected browser bundle is missing")
        markers = [b"127.0.0.1:3001", b"credentials-file:", b"<TUNNEL_ID>"]
        def scan_error(error):
            raise error
        for folder, _, files in os.walk(bundle, onerror=scan_error):
            for name in files:
                path = Path(folder) / name
                content = path.read_bytes()
                if any(marker in content for marker in markers):
                    raise RuntimeError(
                        f"Server-only deployment data found in the browser bundle: {path.relative_to(bundle)}"
                    )
        return {
            "state": "ARTIFACTS_VERIFIED",
            "message": "Browser bundle contains no internal API or tunnel credential configuration",
        }

    def owned_members(self, record):
        members = []
        if not record.get("token"):
            return members
        for path in Path("/proc").iterdir():
            if not path.name.isdigit():
                continue
            try:
                current = identity(int(path.name))
                if (
                    current["pgid"] == record["pgid"]
                    and current["uid"] == os.getuid()
                    and int(current["startTicks"]) >= int(record["startTicks"])
                    and process_environment(current["pid"]).get(
                        "GALAXY_LOCAL_RUNTIME_TOKEN"
                    )
                    == record["token"]
                ):
                    members.append(current)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
        return members

    def terminate(self, record):
        # Token + process start time + pidfd, never a PID file alone.
        deadline = time.monotonic() + min(8, self.timeout)
        signaled = set()
        while True:
            for child in self.children.values():
                child.poll()
            members = self.owned_members(record)
            if not members:
                return
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    f"Nhóm PID {record['pid']} còn child sống; giữ metadata, không kill cưỡng bức"
                )
            for member in members:
                key = (member["pid"], member["startTicks"])
                if key in signaled:
                    continue
                try:
                    fd = os.pidfd_open(member["pid"])
                    try:
                        if (
                            identity(member["pid"])["startTicks"]
                            == member["startTicks"]
                        ):
                            signal.pidfd_send_signal(fd, signal.SIGTERM)
                            signaled.add(key)
                    finally:
                        os.close(fd)
                except (FileNotFoundError, ProcessLookupError):
                    pass
            time.sleep(0.05)

    def up(self):
        with self.lock():
            self.check_files()
            # Inspect every required port before the first spawn, including partial stacks.
            before = {
                name: self.inspect(name, spec)
                for name, spec in self.config["services"].items()
            }
            if any(s.get('controlPlane') == 'CONTROL_PLANE_UNAVAILABLE' for s in before.values()):
                raise ControlPlaneUnavailable()
            self.check_database()
            if any(s["state"] == "NOT_READY" for s in before.values()):
                raise RuntimeError("Runtime hiện hữu chưa ready; không spawn thêm")
            records, created = self.load(), {}
            for name, record in records.items():
                if before.get(name, {}).get("state") != "READY" and self.owned_members(
                    record
                ):
                    raise RuntimeError(
                        f"{name}: child của lần chạy trước còn sống; dùng local:stop và kiểm lại, không ghi đè ownership"
                    )
            try:
                for name, spec in self.config["services"].items():
                    if before[name]["state"] == "READY":
                        continue
                    if spec.get('systemdUnit'):
                        subprocess.run(['systemctl', '--user', 'start', self.unit(spec)], check=True)
                        created[name] = {'systemdUnit': self.unit(spec)}
                        deadline = time.monotonic() + self.timeout
                        while time.monotonic() < deadline:
                            if self.inspect(name, spec)['state'] == 'READY':
                                break
                            time.sleep(0.1)
                        else:
                            raise RuntimeError(f'{name} hết thời gian chờ systemd readiness')
                        continue
                    token = uuid.uuid4().hex
                    start_floor = str(
                        int(
                            float(Path("/proc/uptime").read_text().split()[0])
                            * os.sysconf("SC_CLK_TCK")
                        )
                    )
                    log_path = self.folder / (name + ".log")
                    with log_path.open("ab") as log:
                        log_path.chmod(0o600)
                        child = subprocess.Popen(
                            spec["command"],
                            cwd=spec["cwd"],
                            env={
                                **self.environment(spec),
                                "PATH": os.environ["PATH"],
                                "GALAXY_LOCAL_RUNTIME_TOKEN": token,
                            },
                            stdin=subprocess.DEVNULL,
                            stdout=log,
                            stderr=subprocess.STDOUT,
                            start_new_session=True,
                        )
                    self.children[child.pid] = child
                    # Register ownership before inspecting /proc: the launcher can
                    # already have exited while its token-bearing child is alive.
                    record = {
                        "pid": child.pid,
                        "pgid": child.pid,
                        "startTicks": start_floor,
                        "token": token,
                    }
                    created[name] = record
                    records[name] = record
                    self.save(records)
                    try:
                        record["startTicks"] = identity(child.pid)["startTicks"]
                    except (FileNotFoundError, ProcessLookupError):
                        pass
                    self.save(records)
                    deadline = time.monotonic() + self.timeout
                    while time.monotonic() < deadline:
                        if child.poll() is not None:
                            raise RuntimeError(
                                f"{name} khởi động lỗi; xem log local {log_path}"
                            )
                        if self.inspect(name, spec)["state"] == "READY":
                            break
                        time.sleep(0.1)
                    else:
                        raise RuntimeError(f"{name} hết thời gian chờ readiness")
                return {
                    **self.status(),
                    "action": "STARTED_READY"
                    if created
                    else "ALREADY_RUNNING_VERIFIED",
                }
            except BaseException:
                for name, record in reversed(list(created.items())):
                    try:
                        if record.get('systemdUnit'):
                            spec = self.config['services'][name]
                            self.stop_unit(name, spec)
                        else:
                            self.terminate(record)
                        records.pop(name, None)
                    except RuntimeError as cleanup_error:
                        print(str(cleanup_error), file=sys.stderr)
                self.save(records)
                raise

    def stop(self):
        with self.lock():
            # Verify every control connection before stopping either service.
            for spec in self.config['services'].values():
                if spec.get('systemdUnit'):
                    self.unit_state(spec)
            for name, spec in reversed(list(self.config['services'].items())):
                if spec.get('systemdUnit'):
                    self.stop_unit(name, spec)
            records = self.load()
            for name, record in reversed(list(records.items())):
                self.terminate(record)
                records.pop(name)
                self.save(records)
            return {
                "state": "MANAGED_STOPPED",
                "note": "Giữ nguyên dịch vụ được tái sử dụng từ trước",
            }


def main():
    root = Path(__file__).resolve().parent.parent
    explicit = os.environ.get('GALAXY_LOCAL_RUNTIME_MANIFEST')
    if explicit:
        config_path = Path(explicit)
        if not config_path.is_absolute(): raise RuntimeError('Manifest path phải absolute')
        base = config_path.parent.parent
    else:
        common = subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=root,
            text=True,
        ).strip()
        base = Path(common).parent
        config_path = base / ".runtime/local-runtime.json"
    if not config_path.exists():
        raise RuntimeError(
            f"Chưa cấu hình runtime local: {config_path}; không tự chạy stack khác"
        )
    config = json.loads(config_path.read_text())
    serving = len(sys.argv) == 3 and sys.argv[1] == 'serve'
    if Path(config["runtimeRoot"]).resolve() != root and not (explicit and serving):
        raise RuntimeError(
            f"Runtime chuẩn là {config['runtimeRoot']}; dùng pnpm --dir {config['runtimeRoot']} local:up"
        )
    ports = {name: service["port"] for name, service in config["services"].items()}
    if ports != {"api": 3001, "web": 3000}:
        raise RuntimeError(
            "Manifest local phải dùng Web3000/API3001; test stack dùng runner riêng"
        )
    if config.get("identity", {}).get("database", {}).get("name") != "galaxy_os":
        raise RuntimeError("Chưa xác minh database người dùng trong manifest")
    if not config.get("schemaProbe") or not config.get("expectedSchema"):
        raise RuntimeError("Thiếu preflight database read-only; không khởi chạy")
    manager = Runtime(config, base / ".runtime/local-managed")
    command = sys.argv[1] if len(sys.argv) == 2 else ""
    if len(sys.argv) == 3 and sys.argv[1] == 'serve':
        manager.serve(sys.argv[2])
        return
    if command not in ["status", "up", "stop", "logs", "verify-artifacts"]:
        raise RuntimeError("Dùng local:status, local:up hoặc local:stop")
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    result = manager.verify_artifacts() if command == "verify-artifacts" else getattr(manager, command)()
    if command != 'logs':
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if command == "status" and result["state"] != "READY" else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Đã hủy; chỉ thu dọn child của lần gọi này", file=sys.stderr)
        sys.exit(130)
