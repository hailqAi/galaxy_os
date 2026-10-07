"""Process thật, cổng ephemeral; không dùng DB, Chrome hoặc cổng người dùng."""

import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "runtime", Path(__file__).with_name("local-runtime.py")
)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)

class SystemdTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='galaxy-unit-test-')
        self.spec = {'systemdUnit': 'galaxy-os-api.service', 'port': 3001, 'cwd': self.temp.name}
        self.manager = runtime.Runtime({'services': {'api': self.spec}}, self.temp.name)
    def tearDown(self):
        self.temp.cleanup()
    def test_bus_unavailable_preserves_serving_evidence_without_claiming_management(self):
        self.manager.config['runtimeRoot'] = self.temp.name
        self.spec['fingerprints'] = {}
        failure = subprocess.CalledProcessError(1, ['systemctl'], stderr='Failed to connect to bus: No such file or directory')
        with patch.object(runtime, 'listeners', return_value=[124]), patch.object(self.manager, 'matches', return_value=True), patch.object(runtime.subprocess, 'check_output', side_effect=failure), patch.object(self.manager, 'healthy', return_value=True):
            result = self.manager.status()
            self.assertEqual('CONTROL_PLANE_UNAVAILABLE', result['state'])
            self.assertEqual('APP_SERVING', result['services']['api']['state'])
            self.assertFalse(result['services']['api']['managed'])
            self.assertEqual(124, result['services']['api']['pid'])
    def test_bus_unavailable_without_listener_reports_down_and_blocks_mutations(self):
        self.manager.config['runtimeRoot'] = self.temp.name
        self.spec['fingerprints'] = {}
        failure = subprocess.CalledProcessError(1, ['systemctl'], stderr='Failed to connect to bus: No such file or directory')
        with patch.object(runtime, 'listeners', return_value=[]), patch.object(runtime.subprocess, 'check_output', side_effect=failure), patch.object(runtime.subprocess, 'run') as run:
            result = self.manager.status()
            self.assertEqual('CONTROL_PLANE_UNAVAILABLE', result['state'])
            self.assertEqual('APP_DOWN', result['services']['api']['state'])
            for command in [self.manager.up, self.manager.stop]:
                with self.assertRaisesRegex(RuntimeError, 'CONTROL_PLANE_UNAVAILABLE'):
                    command()
            run.assert_not_called()
    def test_bus_failure_does_not_mask_unrelated_listener(self):
        failure = subprocess.CalledProcessError(1, ['systemctl'], stderr='Failed to connect to bus: No such file or directory')
        with patch.object(runtime, 'listeners', return_value=[124]), patch.object(self.manager, 'matches', return_value=False), patch.object(runtime.subprocess, 'check_output', side_effect=failure):
            with self.assertRaisesRegex(RuntimeError, 'identity/config'):
                self.manager.inspect('api', self.spec)
    def test_non_bus_systemctl_failure_keeps_actionable_diagnostic(self):
        failure = subprocess.CalledProcessError(1, ['systemctl'], stderr='Unit galaxy-os-api.service could not be found.')
        with patch.object(runtime.subprocess, 'check_output', side_effect=failure):
            with self.assertRaisesRegex(RuntimeError, 'could not be found'):
                self.manager.unit_state(self.spec)
    def test_active_unit_without_listener_is_not_ready(self):
        with patch.object(runtime, 'listeners', return_value=[]), patch.object(runtime.subprocess, 'check_output', return_value='ActiveState=active\nMainPID=123\nControlGroup=/user.slice/galaxy-os-api.service\n'):
            self.assertEqual('NOT_READY', self.manager.inspect('api', self.spec)['state'])
    def test_listener_requires_main_pid_and_matching_cgroup(self):
        with patch.object(runtime, 'listeners', return_value=[124]), patch.object(self.manager, 'matches', return_value=True), patch.object(runtime, 'identity', return_value={'pid': 124}), patch.object(runtime.subprocess, 'check_output', return_value='ActiveState=active\nMainPID=123\nControlGroup=/user.slice/galaxy-os-api.service\n'), patch.object(runtime, 'process_cgroup', return_value='/unrelated.slice'):
            with self.assertRaises(RuntimeError): self.manager.inspect('api', self.spec)
    def test_ready_requires_exact_unit_owner_and_health(self):
        with patch.object(runtime, 'listeners', return_value=[124]), patch.object(self.manager, 'matches', return_value=True), patch.object(runtime, 'identity', return_value={'pid': 124}), patch.object(runtime.subprocess, 'check_output', return_value='ActiveState=active\nMainPID=123\nControlGroup=/user.slice/galaxy-os-api.service\n'), patch.object(runtime, 'process_cgroup', return_value='/user.slice/galaxy-os-api.service'), patch.object(self.manager, 'healthy', return_value=False):
            result = self.manager.inspect('api', self.spec)
            self.assertTrue(result['managed'])
            self.assertEqual('NOT_READY', result['state'])
    def test_logs_follow_has_no_start_or_stop_side_effect(self):
        with patch.object(runtime.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            self.manager.logs()
            self.assertEqual(['journalctl', '--user', '--follow', '--no-pager', '--unit', 'galaxy-os-api.service'], run.call_args.args[0])
    def test_next_title_change_requires_matching_unit_token_and_environment(self):
        spec = {**self.spec, 'systemdUnit': 'galaxy-os-web.service', 'command': ['/usr/bin/node', '/release/web/server.js'], 'processTitle': 'next-server (v16.2.10)', 'environment': {'GALAXY_LOCAL_RUNTIME_TOKEN': 'synthetic-token'}, 'identityKeys': ['GALAXY_LOCAL_RUNTIME_TOKEN']}
        current = {'pid': 123, 'ppid': 1, 'cwd': self.temp.name, 'uid': os.getuid(), 'exe': str(Path('/usr/bin/node').resolve()), 'command': ['next-server (v16.2.10)']}
        with patch.object(runtime, 'identity', return_value=current), patch.object(runtime, 'process_cgroup', return_value='/user.slice/galaxy-os-web.service'), patch.object(runtime, 'process_environment', return_value={'GALAXY_LOCAL_RUNTIME_TOKEN': 'synthetic-token'}):
            self.assertTrue(self.manager.matches(123, spec))
        with patch.object(runtime, 'identity', return_value=current), patch.object(runtime, 'process_cgroup', return_value='/user.slice/galaxy-os-web.service'), patch.object(runtime, 'process_environment', return_value={'GALAXY_LOCAL_RUNTIME_TOKEN': 'forged'}):
            self.assertFalse(self.manager.matches(123, spec))
    def test_foreground_serve_refuses_direct_execution_outside_unit(self):
        with patch.object(runtime, 'process_cgroup', return_value='/'), patch.object(self.manager, 'check_files'), patch.object(self.manager, 'check_database'), patch.object(runtime.os, 'execve') as execute:
            with self.assertRaises(RuntimeError): self.manager.serve('api')
            execute.assert_not_called()
    def test_stop_can_identify_the_frozen_controller_during_preflight(self):
        self.manager.config['runtimeRoot'] = self.temp.name
        spec = {**self.spec, 'cwd': '/artifact/apps/api', 'controllerPath': '/artifact/scripts/local-runtime.py', 'command': ['/usr/bin/node', '/artifact/apps/api/dist/main.js'], 'environment': {'GALAXY_LOCAL_RUNTIME_TOKEN': 'synthetic-token'}, 'identityKeys': ['GALAXY_LOCAL_RUNTIME_TOKEN']}
        current = {'pid': 123, 'ppid': 1, 'cwd': self.temp.name, 'uid': os.getuid(), 'exe': str(Path('/usr/bin/python3').resolve()), 'command': ['/usr/bin/python3', '/artifact/scripts/local-runtime.py', 'serve', 'api']}
        with patch.object(runtime, 'identity', return_value=current), patch.object(runtime, 'process_cgroup', return_value='/user.slice/galaxy-os-api.service'), patch.object(runtime, 'process_environment', return_value={'GALAXY_LOCAL_RUNTIME_TOKEN': 'synthetic-token'}):
            self.assertTrue(self.manager.matches(123, spec))
    def test_failed_start_does_not_stop_unrelated_main_pid_without_listener(self):
        self.manager.timeout = 0
        stopped = {'state': 'STOPPED', 'pid': None, 'managed': False}
        not_ready = {**stopped, 'state': 'NOT_READY'}
        with patch.object(self.manager, 'check_files'), patch.object(self.manager, 'check_database'), patch.object(self.manager, 'inspect', side_effect=[stopped, not_ready, not_ready]), patch.object(self.manager, 'unit_state', return_value={'ActiveState': 'active', 'MainPID': '123', 'ControlGroup': '/user.slice/galaxy-os-api.service'}), patch.object(self.manager, 'matches', return_value=False), patch.object(runtime.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            with self.assertRaises(RuntimeError): self.manager.up()
            self.assertEqual([['systemctl', '--user', 'start', 'galaxy-os-api.service']], [call.args[0] for call in run.call_args_list])

SERVER = """import http.server,json,os
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200); self.end_headers()
  self.wfile.write(json.dumps({'status':'ok','service':os.environ['SERVICE']}).encode())
 def log_message(self,*args):pass
http.server.HTTPServer(('127.0.0.1',int(os.environ['PORT'])),Handler).serve_forever()
"""


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def invoke_up(config, folder, started, release):
    manager = runtime.Runtime(config, Path(folder))
    manager.up()
    started.set()
    release.wait(10)
    for child in manager.children.values():
        child.wait(timeout=3)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="galaxy-launch-test-")
        self.root = Path(self.temp.name)
        self.server = self.root / "server.py"
        self.server.write_text(SERVER)
        self.config = {"runtimeRoot": str(self.root), "services": {}}
        for name in ["api", "web"]:
            self.config["services"][name] = {
                "cwd": str(self.root),
                "command": [sys.executable, str(self.server)],
                "port": free_port(),
                "health": "/health",
                "service": name,
                "environment": {"SERVICE": name},
                "identityKeys": ["SERVICE", "PORT"],
                "fingerprints": {str(self.server): runtime.digest(self.server)},
            }
            self.config["services"][name]["environment"]["PORT"] = str(
                self.config["services"][name]["port"]
            )
        self.manager = runtime.Runtime(self.config, self.root / "state", timeout=2)
        self.external = []

    def tearDown(self):
        self.manager.stop()
        for child in self.external:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
        self.temp.cleanup()

    def external_service(self, name):
        spec = self.config["services"][name]
        child = subprocess.Popen(
            spec["command"],
            cwd=spec["cwd"],
            env=spec["environment"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.external.append(child)
        end = time.monotonic() + 3
        while time.monotonic() < end:
            if runtime.listeners(spec["port"]):
                return child
            time.sleep(0.03)
        self.fail("Fixture chưa listen")

    def test_cold_start_and_repeated_up_keep_same_processes(self):
        self.manager.up()
        first = [x["pid"] for x in self.manager.status()["services"].values()]
        self.manager.up()
        self.assertEqual(
            first, [x["pid"] for x in self.manager.status()["services"].values()]
        )
        self.assertEqual("READY", self.manager.status()["state"])

    def test_systemd_start_reuses_owner_and_stop_only_managed_units(self):
        units = {}
        calls = []
        original_run = runtime.subprocess.run
        for name, spec in self.config['services'].items():
            spec['systemdUnit'] = f'galaxy-os-{name}.service'
        def invoke(args, **kwargs):
            if args[0] != 'systemctl': return original_run(args, **kwargs)
            action, unit = args[2:4]
            calls.append((action, unit))
            name = unit.removeprefix('galaxy-os-').removesuffix('.service')
            if action == 'start': units[unit] = self.external_service(name)
            elif action == 'stop' and unit in units:
                units[unit].terminate()
                units[unit].wait(3)
            return subprocess.CompletedProcess(args, 0)
        def state(spec):
            child = units.get(spec['systemdUnit'])
            active = child and child.poll() is None
            return {'ActiveState': 'active' if active else 'inactive', 'MainPID': str(child.pid if active else 0), 'ControlGroup': '/user.slice/' + spec['systemdUnit'] if active else ''}
        def group(pid):
            return '/user.slice/' + next(unit for unit, child in units.items() if child.pid == pid)
        with patch.object(runtime.subprocess, 'run', side_effect=invoke), patch.object(self.manager, 'unit_state', side_effect=state), patch.object(runtime, 'process_cgroup', side_effect=group):
            self.assertEqual('STARTED_READY', self.manager.up()['action'])
            first = {unit: child.pid for unit, child in units.items()}
            self.assertEqual('ALREADY_RUNNING_VERIFIED', self.manager.up()['action'])
            self.assertEqual(first, {unit: child.pid for unit, child in units.items()})
            self.manager.stop()
            self.assertTrue(all(child.poll() is not None for child in units.values()))
            self.assertEqual([('start', 'galaxy-os-api.service'), ('start', 'galaxy-os-web.service'), ('stop', 'galaxy-os-web.service'), ('stop', 'galaxy-os-api.service')], calls)
        for spec in self.config['services'].values(): del spec['systemdUnit']

    def test_concurrent_up_creates_one_stack(self):
        release = multiprocessing.Event()
        started = [multiprocessing.Event() for _ in range(2)]
        children = [
            multiprocessing.Process(
                target=invoke_up,
                args=(self.config, str(self.root / "state"), event, release),
            )
            for event in started
        ]
        for child in children:
            child.start()
        try:
            for event in started:
                self.assertTrue(event.wait(8))
            self.assertEqual("READY", self.manager.status()["state"])
            for spec in self.config["services"].values():
                self.assertEqual(1, len(runtime.listeners(spec["port"])))
        finally:
            self.manager.stop()
            release.set()
            for child in children:
                child.join(10)
                self.assertEqual(0, child.exitcode)

    def test_foreign_web_port_prevents_api_spawn(self):
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", self.config["services"]["web"]["port"]))
            occupied.listen()
            with self.assertRaises(RuntimeError):
                self.manager.up()
            self.assertFalse(runtime.listeners(self.config["services"]["api"]["port"]))

    def test_child_failure_cleans_only_new_children(self):
        self.config["services"]["web"]["command"] = [
            sys.executable,
            "-c",
            "raise SystemExit(7)",
        ]
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertFalse(runtime.listeners(self.config["services"]["api"]["port"]))

    def test_stop_and_failed_up_preserve_reused_api(self):
        existing = self.external_service("api")
        self.config["services"]["web"]["command"] = [
            sys.executable,
            "-c",
            "raise SystemExit(7)",
        ]
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.manager.stop()
        self.assertIsNone(existing.poll())

    def test_partial_wrong_environment_prevents_second_service(self):
        existing = self.external_service("api")
        self.config["services"]["api"]["environment"]["SERVICE"] = "wrong"
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertIsNone(existing.poll())
        self.assertFalse(runtime.listeners(self.config["services"]["web"]["port"]))

    def test_stale_pid_record_does_not_kill_unowned_process(self):
        existing = self.external_service("api")
        record = runtime.identity(existing.pid)
        record["startTicks"] = "0"
        self.manager.save({"api": record})
        self.manager.stop()
        self.assertIsNone(existing.poll())

    def test_source_drift_fails_before_any_spawn(self):
        self.server.write_text(SERVER + "\n# changed\n")
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertFalse(runtime.listeners(self.config["services"]["api"]["port"]))

    def test_database_probe_mismatch_prevents_all_spawns(self):
        self.config["schemaProbe"] = [
            sys.executable,
            "-c",
            'print(\'{"name":"wrong_database","schema":"public"}\')',
        ]
        self.config["expectedSchema"] = {"name": "galaxy_os", "schema": "public"}
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertFalse(runtime.listeners(self.config["services"]["api"]["port"]))

    def test_inherited_database_override_is_not_reused(self):
        spec = self.config["services"]["api"]
        spec["environment"]["DATABASE_URL"] = "postgresql://synthetic/other"
        existing = self.external_service("api")
        del spec["environment"]["DATABASE_URL"]
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertIsNone(existing.poll())
        self.assertFalse(runtime.listeners(self.config["services"]["web"]["port"]))

    def test_inherited_ai_override_is_not_reused(self):
        spec = self.config["services"]["api"]
        spec["environment"]["FEATURE_PROJECT_AI"] = "true"
        existing = self.external_service("api")
        del spec["environment"]["FEATURE_PROJECT_AI"]
        with self.assertRaises(RuntimeError):
            self.manager.up()
        self.assertIsNone(existing.poll())
        self.assertFalse(runtime.listeners(self.config["services"]["web"]["port"]))

    def test_surviving_owned_descendant_retains_stop_record(self):
        import signal

        script = self.root / "descendant.py"
        script.write_text(
            "import os,signal,time,pathlib\nif os.fork()==0:\n signal.signal(signal.SIGTERM,signal.SIG_IGN)\n signal.signal(signal.SIGUSR1,lambda *_: exit(0))\n pathlib.Path('child.pid').write_text(str(os.getpid()))\nwhile True: time.sleep(.1)\n"
        )
        child = subprocess.Popen(
            [sys.executable, str(script)],
            cwd=self.root,
            env={"GALAXY_LOCAL_RUNTIME_TOKEN": "fixture-token"},
            start_new_session=True,
        )
        self.external.append(child)
        deadline = time.monotonic() + 3
        while not (self.root / "child.pid").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        descendant = int((self.root / "child.pid").read_text())
        record = {**runtime.identity(child.pid), "token": "fixture-token"}
        self.manager.save({"api": record})
        try:
            with self.assertRaises(RuntimeError):
                self.manager.stop()
            self.assertIn("api", self.manager.load())
            with self.assertRaises(RuntimeError):
                self.manager.up()
            self.assertEqual(child.pid, self.manager.load()["api"]["pid"])
        finally:
            os.kill(descendant, signal.SIGUSR1)
            child.wait(timeout=3)
            time.sleep(0.1)

    def test_launcher_exit_before_identity_does_not_orphan_listener(self):
        from unittest.mock import patch

        script = self.root / "fork_server.py"
        script.write_text(
            "import os,pathlib\nif os.fork(): os._exit(7)\npathlib.Path('fork.pid').write_text(str(os.getpid()))\n"
            + SERVER
        )
        self.config["services"]["api"]["command"] = [sys.executable, str(script)]
        original = runtime.identity

        def delayed_identity(pid):
            value = original(pid)
            if (
                value["command"] == [sys.executable, str(script)]
                and value["pid"] == value["pgid"]
            ):
                time.sleep(0.15)
            return original(pid)

        try:
            with patch.object(runtime, "identity", delayed_identity):
                with self.assertRaises((RuntimeError, FileNotFoundError)):
                    self.manager.up()
            self.assertFalse(runtime.listeners(self.config["services"]["api"]["port"]))
        finally:
            if (self.root / "fork.pid").exists():
                import signal

                try:
                    os.kill(int((self.root / "fork.pid").read_text()), signal.SIGTERM)
                except ProcessLookupError:
                    pass
                time.sleep(0.1)


SCRIPTS = Path(__file__).resolve().parent


class RuntimeCliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="galaxy-runtime-cli-")
        self.root = Path(self.temp.name)
        self.source_static = self.root / "apps/web/.next/static"
        self.selected_static = self.root / "release/apps/web/.next/static"
        for folder in [self.source_static, self.selected_static]:
            folder.mkdir(parents=True)
            (folder / "client.js").write_text("public browser code")
        self.manifest = self.root / ".runtime/local-runtime.json"
        self.manifest.parent.mkdir()
        self.manifest.write_text(json.dumps({
            "runtimeRoot": str(SCRIPTS.parent),
            "identity": {"database": {"name": "galaxy_os"}},
            "schemaProbe": ["unused-fixture-probe"],
            "expectedSchema": {"fixture": True},
            "services": {
                "api": {"port": 3001, "fingerprints": {}},
                "web": {"port": 3000, "cwd": str(self.selected_static.parent.parent), "fingerprints": {}},
            },
        }))
        self.env = {**os.environ, "GALAXY_LOCAL_RUNTIME_MANIFEST": str(self.manifest)}

    def tearDown(self):
        self.temp.cleanup()

    def verify_bundle(self):
        return subprocess.run(
            ["bash", str(SCRIPTS / "verify-production-artifacts.sh")],
            cwd=self.root, env=self.env, capture_output=True, text=True,
        )

    def test_selected_bundle_leak_is_rejected_even_when_source_is_clean(self):
        for marker in ["127.0.0.1:3001", "credentials-file:", "<TUNNEL_ID>"]:
            with self.subTest(marker=marker):
                (self.selected_static / "client.js").write_text(marker)
                result = self.verify_bundle()
                self.assertNotEqual(0, result.returncode, result.stdout)
                self.assertIn("Server-only deployment data", result.stderr)
                self.assertNotIn(marker, result.stderr)

    def test_clean_selected_bundle_passes_even_when_mutable_source_has_leak(self):
        (self.source_static / "client.js").write_text("credentials-file: stale-source")
        result = self.verify_bundle()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("no internal API or tunnel credential configuration", result.stdout)

    def test_missing_selected_bundle_fails_closed(self):
        (self.selected_static / "client.js").unlink()
        self.selected_static.rmdir()
        result = self.verify_bundle()
        self.assertNotEqual(0, result.returncode, result.stdout)

    def test_fingerprint_failure_propagates_through_shell_helper(self):
        config = json.loads(self.manifest.read_text())
        config["services"]["web"]["fingerprints"] = {str(self.selected_static / "client.js"): "wrong-digest"}
        self.manifest.write_text(json.dumps(config))
        result = self.verify_bundle()
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIn("source/build/config đã đổi", result.stderr)

    def test_unreadable_selected_bundle_is_not_reported_as_verified(self):
        manager = runtime.Runtime(json.loads(self.manifest.read_text()), self.root / "state")
        with patch.object(Path, "read_bytes", side_effect=PermissionError("fixture unreadable")):
            with self.assertRaises(PermissionError):
                manager.verify_artifacts()

    @unittest.skipIf(os.geteuid() == 0, "Root bypasses directory permissions")
    def test_unreadable_bundle_directory_fails_through_shell_helper(self):
        nested = self.selected_static / "restricted"
        nested.mkdir()
        (nested / "client.js").write_text("credentials-file: fixture")
        nested.chmod(0)
        try:
            result = self.verify_bundle()
        finally:
            nested.chmod(0o700)
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIn("Permission denied", result.stderr)

    def test_status_cli_exit_reflects_verified_ready_state(self):
        # Exercise main's real manifest validation, output and process exit, while
        # replacing only status's OS/DB checks with a fixture result.
        program = """import importlib.util,json,sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('runtime',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
state=sys.argv[2];sys.argv=[sys.argv[1],'status']
with patch.object(module.Runtime,'status',return_value={'state':state}):
 sys.exit(module.main())
"""
        for state, expected_exit in [("PARTIAL", 1), ("READY", 0)]:
            with self.subTest(state=state):
                result = subprocess.run(
                    [sys.executable, "-c", program, str(SCRIPTS / "local-runtime.py"), state],
                    cwd=self.root, env=self.env, capture_output=True, text=True,
                )
                self.assertEqual(expected_exit, result.returncode, result.stderr)
                self.assertEqual(state, json.loads(result.stdout)["state"])

    def test_health_shell_entrypoint_exits_nonzero_when_services_are_stopped(self):
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ["local-runtime.py", "production-health.sh"]:
            (scripts / name).write_bytes((SCRIPTS / name).read_bytes())
        tools = self.root / "bin"
        tools.mkdir()
        ss = tools / "ss"
        ss.write_text("#!/bin/sh\nexit 0\n")
        ss.chmod(0o700)
        config = json.loads(self.manifest.read_text())
        config["runtimeRoot"] = str(self.root)
        config["expectedSchema"] = {"name": "galaxy_os", "schema": "public", "migrations": []}
        config["schemaProbe"] = [sys.executable, "-c", "print(" + repr(json.dumps(config["expectedSchema"])) + ")"]
        config["services"]["api"].update(cwd=str(self.root), environment={})
        self.manifest.write_text(json.dumps(config))
        result = subprocess.run(
            ["bash", str(scripts / "production-health.sh")],
            cwd=self.root.parent,
            env={**self.env, "PATH": str(tools) + os.pathsep + os.environ["PATH"]},
            capture_output=True, text=True,
        )
        self.assertEqual(1, result.returncode, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual("PARTIAL", output["state"])
        self.assertTrue(output["databaseReadOnlyCheck"]["verified"])


if __name__ == "__main__":
    unittest.main()
