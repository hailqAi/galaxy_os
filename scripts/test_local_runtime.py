"""Process thật, cổng ephemeral; không dùng DB, Chrome hoặc cổng người dùng."""

import importlib.util
import multiprocessing
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest

SPEC = importlib.util.spec_from_file_location(
    "runtime", Path(__file__).with_name("local-runtime.py")
)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)

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


if __name__ == "__main__":
    unittest.main()
