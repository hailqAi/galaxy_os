"""Switch the existing Galaxy runtime; keep the current database and durable work."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import signal
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path('/home/galaxy_os')
MANIFEST = ROOT / '.runtime/local-runtime.json'
EDGE = Path('/etc/systemd/system/galaxy-edge.service.d/20-runtime-release.conf')
UNITS = Path('/home/hailq_glx/.config/systemd/user')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def atomic(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('xb') as stream:
            os.chmod(temporary, 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
        fd = os.open(path.parent, os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally: temporary.unlink(missing_ok=True)

def new_session(folder):
    session = Path(folder) / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex)
    session.mkdir(mode=0o700, parents=True, exist_ok=False)
    return session

def snapshot(session, paths):
    for name, path in paths.items():
        with (session / name).open('xb') as stream:
            os.chmod(session / name, 0o600)
            stream.write(Path(path).read_bytes())
            stream.flush()
            os.fsync(stream.fileno())

def ready_body(value, release, database=False):
    return value.get('status') == 'ok' and value.get('releaseId') == release and (not database or value.get('database') == 'connected')

def verify_receiver_compatibility(current, previous, incompatible_states):
    if current != previous and (incompatible_states or current in {'mcp-data-v2', 'mcp-data-v3'}):
        raise RuntimeError('ROLLBACK_PROTOCOL_STATE_INCOMPATIBLE_KEEP_CURRENT_RUNTIME')

def verify_schema_contract(candidate, metadata, release):
    expected = candidate.get('expectedSchema', {})
    if candidate.get('identity', {}).get('database', {}).get('name') != 'galaxy_os' or expected.get('name') != 'galaxy_os' or expected.get('schema') != 'public' or expected != metadata.get('expectedSchema') or not expected.get('migrations'):
        raise RuntimeError('UNEXPECTED_DATABASE_CONTRACT')
    folder = Path(release) / 'apps/api/prisma/migrations'
    reviewed = {row['migration_name']: row['checksum'] for row in expected['migrations']}
    actual = {path.parent.name: sha(path) for path in folder.glob('*/migration.sql')}
    if len(reviewed) != len(expected['migrations']) or actual != reviewed:
        raise RuntimeError('MIGRATION_CHECKSUM_MISMATCH')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs): return None

def http_json(url, method='GET', body=None):
    direct = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, data=body, method=method, headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'GalaxyOS-MCP-Readiness/1.0'})
    try: response = direct.open(request, timeout=10)
    except urllib.error.HTTPError as error: response = error
    with response:
        data = response.read(65537)
        if len(data) > 65536 or 'application/json' not in response.headers.get('Content-Type', ''):
            raise RuntimeError('PUBLIC_JSON_CONTRACT_FAILED')
        return response.status, dict((k.lower(), v) for k, v in response.headers.items()), json.loads(data)

def activate(operator):
    operator.preflight()
    try:
        for step in ['edge_bootstrap', 'drain', 'switch_apps', 'switch_edge', 'public']:
            operator.step(step)
    except BaseException:
        operator.rollback()
        raise

class Deployment:
    def __init__(self, plan_path, session=None):
        self.plan_path = Path(plan_path).resolve(strict=True)
        if not self.plan_path.is_relative_to(ROOT / '.runtime'):
            raise RuntimeError('PLAN_MUST_BE_PRIVATE_RUNTIME_FILE')
        self.plan = json.loads(self.plan_path.read_text())
        self.stage = self.plan_path.parent
        self.session = Path(session) if session else None
        self.journal = {'steps': [], 'plan': str(self.plan_path), 'state': 'PREFLIGHT'}
        self.gate = Path(self.plan['gate'])
        if self.gate != ROOT / '.runtime/deployment-admission': raise RuntimeError('INVALID_ADMISSION_PATH')
        spec = importlib.util.spec_from_file_location('runtime', Path(self.plan['release']) / 'scripts/local-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.runtime_module = module

    def command(self, *args):
        return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=65).stdout

    def runtime(self, config):
        return self.runtime_module.Runtime(config, ROOT / '.runtime/local-managed')

    def note(self, step):
        self.journal['steps'].append(step)
        atomic(self.session / 'journal.json', json.dumps(self.journal, indent=2).encode())

    def verify_stage(self):
        for relative, expected in self.plan['hashes'].items():
            path = (self.stage / relative).resolve(strict=True)
            if not path.is_relative_to(self.stage) or sha(path) != expected:
                raise RuntimeError('STAGE_CHECKSUM_MISMATCH')
        release = Path(self.plan['release']).resolve(strict=True)
        if not release.is_relative_to(ROOT / '.runtime/releases') or sha(release / 'release.json') != self.plan['releaseMetadataSHA256']:
            raise RuntimeError('RELEASE_CHECKSUM_MISMATCH')
        self.candidate = json.loads((self.stage / 'local-runtime.candidate.json').read_text())
        if self.candidate['identity']['release']['releaseId'] != self.plan['releaseId']:
            raise RuntimeError('RELEASE_ID_MISMATCH')
        metadata = json.loads((release / 'release.json').read_text())
        if self.plan.get('runtimeProtocolRevision', 'mcp-jobs-v1') != metadata.get('runtimeProtocolRevision', 'mcp-jobs-v1'):
            raise RuntimeError('RECEIVER_PROTOCOL_MISMATCH')
        environment = self.runtime(self.candidate).environment(self.candidate['services']['api'])
        if environment.get('GALAXY_DEPLOYMENT_GATE') != str(self.gate): raise RuntimeError('API_ADMISSION_NOT_CONFIGURED')
        verify_schema_contract(self.candidate, json.loads((release / 'release.json').read_text()), release)
        self.runtime(self.candidate).check_files()
        self.runtime(self.candidate).check_database()

    def preflight(self):
        if pwd.getpwuid(os.getuid()).pw_name != 'hailq_glx': raise RuntimeError('RUN_AS_HAILQ_GLX')
        self.verify_stage()
        self.original = json.loads(MANIFEST.read_text())
        if self.original['identity']['release']['releaseId'] != self.plan['fromReleaseId']:
            raise RuntimeError('ACTIVE_RELEASE_CHANGED')
        if self.runtime(self.original).status()['state'] != 'READY': raise RuntimeError('ORIGINAL_RUNTIME_NOT_READY')
        self.command('systemctl', '--user', 'is-active', 'galaxy-os-api.service', 'galaxy-os-web.service')
        self.command('sudo', '-n', '/usr/bin/test', '-w', str(EDGE.parent))
        self.command('sudo', '-n', '/usr/bin/systemctl', 'is-active', 'galaxy-edge.service')
        tables = self.command('sudo', '-n', '/usr/sbin/nft', 'list', 'tables')
        if 'table inet galaxy_e05_deployment' in tables: raise RuntimeError('EXISTING_NETWORK_BARRIER_RECOVER_FIRST')
        self.command('sudo', '-n', '/usr/sbin/nft', '--check', '-f', str(self.stage / 'admission-barrier.nft'))
        self.command('sudo', '-n', '/usr/sbin/nft', '--check', '-f', str(self.stage / 'admission-tracking.nft'))
        if self.gate.exists(): raise RuntimeError('EXISTING_DEPLOYMENT_GATE_RECOVER_FIRST')
        if EDGE.is_symlink() or not EDGE.is_file(): raise RuntimeError('UNEXPECTED_EDGE_CONFIG')
        self.session = new_session(ROOT / '.runtime/e05-deployments')
        snapshot(self.session, {'local-runtime.json': MANIFEST, 'edge.conf': EDGE,
            'galaxy-os-api.service': UNITS / 'galaxy-os-api.service', 'galaxy-os-web.service': UNITS / 'galaxy-os-web.service'})
        self.journal['snapshotHashes'] = {name: sha(self.session / name) for name in ['local-runtime.json', 'edge.conf', 'galaxy-os-api.service', 'galaxy-os-web.service']}
        atomic(self.session / 'network-before.nft', self.command('sudo', '-n', '/usr/sbin/nft', 'list', 'ruleset').encode())
        atomic(self.session / 'plan.json', self.plan_path.read_bytes())
        self.note('snapshot')

    def edge_config(self, source):
        temporary = str(EDGE) + '.' + self.session.name + '.tmp'
        self.command('sudo', '-n', '/usr/bin/install', '-o', 'root', '-g', 'root', '-m', '0644', str(source), temporary)
        self.command('sudo', '-n', '/usr/bin/mv', '-T', temporary, str(EDGE))
        self.command('sudo', '-n', '/usr/bin/systemctl', 'daemon-reload')
        self.command('sudo', '-n', '/usr/bin/systemctl', 'restart', 'galaxy-edge.service')

    def wait(self, check, message, timeout=60):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if check(): return
            except (OSError, ValueError, RuntimeError, subprocess.SubprocessError): pass
            time.sleep(1)
        raise RuntimeError(message)

    def edge_health(self):
        return http_json('http://127.0.0.1:8080/health')[2]

    def network_tracking(self):
        present = 'table inet galaxy_e05_deployment' in self.command('sudo', '-n', '/usr/sbin/nft', 'list', 'tables')
        if present:
            self.barrier_active = 'reject' in self.command('sudo', '-n', '/usr/sbin/nft', 'list', 'table', 'inet', 'galaxy_e05_deployment')
            return
        self.note('network_tracking')
        self.command('sudo', '-n', '/usr/sbin/nft', '-f', str(self.stage / 'admission-tracking.nft'))
        self.barrier_active = False

    def network_barrier(self, enabled):
        present = 'table inet galaxy_e05_deployment' in self.command('sudo', '-n', '/usr/sbin/nft', 'list', 'tables')
        if enabled and not getattr(self, 'barrier_active', False):
            self.note('network_barrier')
            self.command('sudo', '-n', '/usr/sbin/nft', '-f', str(self.stage / 'admission-barrier.nft'))
        elif not enabled and present:
            self.command('sudo', '-n', '/usr/sbin/nft', 'delete', 'table', 'inet', 'galaxy_e05_deployment')
        self.barrier_active = enabled

    def local_json(self, port, path):
        if (port, path) not in [(3001, '/api/v1/ready'), (3000, '/health')]:
            raise RuntimeError('INVALID_LOCAL_HEALTH_PROBE')
        url = f'http://127.0.0.1:{port}{path}'
        if getattr(self, 'barrier_active', 'network_barrier' in self.journal.get('steps', [])):
            data = self.command('sudo', '-n', '/usr/bin/curl', '--fail', '--silent', '--show-error', '--noproxy', '*', '--max-time', '5', '--max-filesize', '65536', '--header', 'Connection: close', url)
            return 200, {}, json.loads(data)
        return http_json(url)

    def work(self, check_protocol=False, native_observed=False):
        config = json.loads(MANIFEST.read_text())
        api = config['services']['api']
        environment = self.runtime(config).environment(api)
        result = subprocess.check_output(['/usr/bin/node', str(self.stage / 'drain-probe.cjs'), *(['--foundation-compatibility'] if check_protocol else []), *(['--native-observed'] if native_observed else [])],
            cwd=api['cwd'], env={**environment, 'PATH': os.environ['PATH']}, text=True, timeout=15)
        return json.loads(result)

    def quiet(self, require_mcp_terminal=False):
        health = self.edge_health()
        status, _, api = self.local_json(3001, '/api/v1/ready')
        api_settled = status == 200 and api.get('inFlight', 0) == 0
        native_observed = 'nativeInFlight' in api
        if native_observed:
            if type(api['nativeInFlight']) is not int or api['nativeInFlight'] < 0: return False
            api_settled = api_settled and api['nativeInFlight'] == 0
        if 'inFlight' not in api:
            # R40 has no controller counter: conservatively require all API/Web transports closed.
            api_settled = api_settled and not self.command('ss', '-H', '-tan', 'state', 'established', '( sport = :3000 or sport = :3001 )').strip()
        work = self.work(native_observed=True) if native_observed else self.work()
        return health.get('admission') in ['drain', 'closed'] and health.get('inFlight') == 0 and api_settled and work['active'] == 0 and (not require_mcp_terminal or work.get('openMcpJobs') == 0)

    def settle(self, message, timeout=120, require_mcp_terminal=False):
        consecutive = 0
        def stable():
            nonlocal consecutive
            consecutive = consecutive + 1 if self.quiet(require_mcp_terminal) else 0
            return consecutive >= 3
        self.wait(stable, message, timeout)

    def ready(self, config):
        release = config['identity']['release']['releaseId']
        for name, spec in config['services'].items():
            status, _, body = self.local_json(spec['port'], spec['health'])
            if status != 200 or not ready_body(body, release, name == 'api'): return False
        manager = self.runtime(config)
        # Keep all process/config/database guards; only the two read probes use root during the fence.
        manager.healthy = lambda spec: self.local_json(spec['port'], spec['health'])[0] == 200
        return manager.status()['state'] == 'READY'

    def public(self):
        origin = self.plan['origin']
        cases = [
            ('/.well-known/oauth-protected-resource/mcp', 'GET', None, 200, lambda v, h: v.get('resource') == origin + '/mcp' and v.get('authorization_servers') == [origin]),
            ('/.well-known/oauth-authorization-server', 'GET', None, 200, lambda v, h: v.get('issuer') == origin and v.get('token_endpoint') == origin + '/mcp/oauth/token'),
            ('/mcp', 'POST', b'{}', 401, lambda v, h: 'oauth-protected-resource/mcp' in h.get('www-authenticate', '')),
            ('/mcp/oauth/register', 'POST', b'{}', 400, lambda v, h: v.get('error') == 'invalid_client_metadata'),
            ('/mcp/oauth/authorize', 'GET', None, 400, lambda v, h: v.get('error') == 'invalid_request' and v.get('iss') == origin),
            ('/mcp/oauth/token', 'POST', b'{"grant_type":"unsupported"}', 400, lambda v, h: v.get('error') == 'unsupported_grant_type'),
        ]
        evidence = []
        for path, method, body, expected, valid in cases:
            status, headers, value = http_json(origin + path, method, body)
            passed = status == expected and valid(value, headers) and headers.get('x-galaxy-edge-release') == self.plan['releaseId'] and headers.get('x-galaxy-release') == self.plan['releaseId']
            evidence.append({'path': path, 'status': status, 'passed': passed})
            if not passed: return False
        atomic(self.session / 'public.json', json.dumps({'at': time.time(), 'checks': evidence}).encode())
        return True

    def step(self, name):
        self.note(name)
        if name == 'edge_bootstrap':
            self.network_tracking()
            self.edge_config(self.stage / 'galaxy-edge-runtime-release.conf')
            self.wait(lambda: self.edge_health().get('releaseId') == self.plan['releaseId'], 'EDGE_BOOTSTRAP_FAILED')
        elif name == 'drain':
            atomic(self.gate, b'drain')
            self.settle('DRAIN_PENDING_WORK_ABORTED_CUTOVER', self.plan.get('drainWaitSeconds', 120))
            atomic(self.gate, b'closed')
            self.network_barrier(True)
            self.settle('ADMITTED_REQUESTS_NOT_SETTLED')
            atomic(self.session / 'drained.json', json.dumps(self.work()).encode())
        elif name == 'switch_apps':
            self.command('systemctl', '--user', 'stop', 'galaxy-os-web.service', 'galaxy-os-api.service')
            for name in ['galaxy-os-api.service', 'galaxy-os-web.service']:
                atomic(UNITS / name, (self.stage / name).read_bytes())
            atomic(MANIFEST, (self.stage / 'local-runtime.candidate.json').read_bytes())
            self.command('systemctl', '--user', 'daemon-reload')
            self.command('systemctl', '--user', 'reset-failed', 'galaxy-os-api.service', 'galaxy-os-web.service')
            self.command('systemctl', '--user', 'start', 'galaxy-os-api.service')
            self.command('systemctl', '--user', 'start', 'galaxy-os-web.service')
            self.wait(lambda: self.ready(self.candidate), 'CANDIDATE_NOT_READY')
        elif name == 'switch_edge':
            self.edge_config(self.stage / 'galaxy-edge-runtime-release.conf')
            self.wait(lambda: self.edge_health().get('releaseId') == self.plan['releaseId'], 'EDGE_NOT_READY')
        elif name == 'public':
            self.network_barrier(False)
            self.gate.unlink()
            self.wait(self.public, 'PUBLIC_MCP_CONTRACT_FAILED')
            self.journal['state'] = 'ACTIVE_PUBLIC_VERIFIED'
            self.note('complete')

    def rollback(self):
        if not self.session or not (self.session / 'journal.json').exists(): raise RuntimeError('NO_VERIFIED_ROLLBACK_SNAPSHOT')
        self.journal = json.loads((self.session / 'journal.json').read_text())
        for name, expected in self.journal['snapshotHashes'].items():
            if sha(self.session / name) != expected: raise RuntimeError('ROLLBACK_SNAPSHOT_CHECKSUM_MISMATCH')
        original = json.loads((self.session / 'local-runtime.json').read_text())
        self.runtime(original).check_files()
        self.runtime(original).check_database()
        if self.journal.get('state') == 'ACTIVE_PUBLIC_VERIFIED' or 'public' in self.journal['steps']:
            self.network_tracking()
            atomic(self.gate, b'drain')
            original_env = self.runtime(original).environment(original.get('services', {}).get('api', {}))
            incompatible = original_env.get('FEATURE_GALAXY_MCP') != 'true'
            try:
                current_protocol = self.plan.get('runtimeProtocolRevision', 'mcp-jobs-v1')
                previous_protocol = 'mcp-jobs-v1'
                if current_protocol != 'mcp-jobs-v1':
                    original_release = Path(original['services']['api']['cwd']).parent.parent
                    previous_protocol = json.loads((original_release / 'release.json').read_text()).get('runtimeProtocolRevision', 'mcp-jobs-v1')
                incompatible = incompatible or current_protocol != previous_protocol
                self.settle('ROLLBACK_PENDING_WORK_KEEP_CURRENT_RUNTIME', self.plan.get('drainWaitSeconds', 120), incompatible)
                atomic(self.gate, b'closed')
                self.network_barrier(True)
                self.settle('ROLLBACK_REQUESTS_NOT_SETTLED_KEEP_CURRENT_RUNTIME', require_mcp_terminal=incompatible)
                if current_protocol != previous_protocol:
                    work = self.work(check_protocol=True)
                    if 'foundationStateCount' not in work:
                        raise RuntimeError('ROLLBACK_PROTOCOL_STATE_UNKNOWN_KEEP_CURRENT_RUNTIME')
                    verify_receiver_compatibility(current_protocol, previous_protocol, work['foundationStateCount'])
            except (RuntimeError, OSError, ValueError, subprocess.SubprocessError):
                # Abort rollback; keep the receiver that still owns unfinished external work.
                try:
                    current = json.loads(MANIFEST.read_text())
                    if self.ready(current) and self.edge_health().get('releaseId') == self.plan['releaseId']:
                        self.network_barrier(False)
                        self.gate.unlink(missing_ok=True)
                except (OSError, ValueError, RuntimeError, subprocess.SubprocessError): pass
                self.journal['state'] = 'ROLLBACK_BLOCKED_CURRENT_RUNTIME_RETAINED'
                self.note('rollback_blocked')
                raise
        else: atomic(self.gate, b'closed')
        if 'switch_apps' in self.journal['steps']:
            self.command('systemctl', '--user', 'stop', 'galaxy-os-web.service', 'galaxy-os-api.service')
            for name in ['galaxy-os-api.service', 'galaxy-os-web.service']:
                atomic(UNITS / name, (self.session / name).read_bytes())
            atomic(MANIFEST, (self.session / 'local-runtime.json').read_bytes())
            self.command('systemctl', '--user', 'daemon-reload')
            self.command('systemctl', '--user', 'reset-failed', 'galaxy-os-api.service', 'galaxy-os-web.service')
            self.command('systemctl', '--user', 'start', 'galaxy-os-api.service')
            self.command('systemctl', '--user', 'start', 'galaxy-os-web.service')
            self.wait(lambda: self.ready(original), 'ROLLBACK_APPS_NOT_READY')
        if 'edge_bootstrap' in self.journal['steps']:
            self.edge_config(self.session / 'edge.conf')
            self.network_barrier(False)
            self.wait(lambda: self.edge_health().get('ready') is True, 'ROLLBACK_EDGE_NOT_READY')
        elif 'network_barrier' in self.journal['steps']: self.network_barrier(False)
        self.gate.unlink(missing_ok=True)
        self.journal['state'] = 'ROLLED_BACK_CURRENT_DATABASE_RETAINED'
        self.note('rollback_complete')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'activate', 'rollback'])
    parser.add_argument('--plan', required=True)
    parser.add_argument('--session')
    parser.add_argument('--authenticate-sudo', action='store_true')
    args = parser.parse_args()
    if os.getuid() == 0: raise RuntimeError('DO_NOT_RUN_THIS_PROGRAM_AS_ROOT')
    if args.authenticate_sudo: subprocess.run(['sudo', '-v'], check=True)
    operator = Deployment(args.plan, args.session)
    if args.action == 'check':
        operator.verify_stage()
        print(json.dumps({'state': 'STAGE_AND_CURRENT_SCHEMA_VERIFIED', 'releaseId': operator.plan['releaseId']}))
        return
    with (ROOT / '.runtime/local-managed/lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        if args.action == 'activate': activate(operator)
        else:
            if not args.session: raise RuntimeError('ROLLBACK_REQUIRES_EXACT_SESSION')
            operator.verify_stage()
            operator.command('sudo', '-n', '/usr/bin/test', '-w', str(EDGE.parent))
            operator.rollback()
        print(json.dumps({'state': operator.journal['state'], 'session': str(operator.session)}))

if __name__ == '__main__':
    try: main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError, KeyboardInterrupt) as error:
        # Command stderr can contain credentials; expose only the safe exception category.
        print(json.dumps({'state': 'FAILED', 'code': str(error) if isinstance(error, RuntimeError) else type(error).__name__}))
        raise SystemExit(1)
