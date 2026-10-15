import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy-mcp-release.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class DeployTests(unittest.TestCase):
    def test_native_claim_waiting_on_database_blocks_quiet_even_with_zero_execution_rows(self):
        fake = object.__new__(deploy.Deployment)
        fake.journal = {}
        fake.edge_health = lambda: {'admission':'drain','inFlight':0}
        fake.work = lambda *args, **kwargs: {'active':0,'openMcpJobs':0}
        with patch.object(deploy, 'http_json', return_value=(200, {}, {'inFlight':0,'nativeInFlight':1})):
            self.assertFalse(fake.quiet())
    def test_receiver_protocol_downgrade_preserves_incompatible_persisted_state(self):
        deploy.verify_receiver_compatibility('mcp-data-v1', 'mcp-jobs-v1', 0)
        deploy.verify_receiver_compatibility('mcp-data-v1', 'mcp-data-v1', 10)
        with self.assertRaisesRegex(RuntimeError, 'ROLLBACK_PROTOCOL_STATE_INCOMPATIBLE'):
            deploy.verify_receiver_compatibility('mcp-data-v1', 'mcp-jobs-v1', 1)

    def test_v2_downgrade_stays_blocked_after_completed_context_grants_expire(self):
        deploy.verify_receiver_compatibility('mcp-data-v2', 'mcp-data-v2', 0)
        with self.assertRaisesRegex(RuntimeError, 'PROTOCOL_STATE_INCOMPATIBLE'):
            deploy.verify_receiver_compatibility('mcp-data-v2', 'mcp-data-v1', 0)

    def test_v3_file_refresh_envelope_cannot_downgrade_after_public_admission(self):
        deploy.verify_receiver_compatibility('mcp-data-v3', 'mcp-data-v3', 0)
        with self.assertRaisesRegex(RuntimeError, 'PROTOCOL_STATE_INCOMPATIBLE'):
            deploy.verify_receiver_compatibility('mcp-data-v3', 'mcp-data-v2', 0)

    def test_protocol_probe_failure_reopens_only_ready_current_runtime(self):
        for failure in [deploy.subprocess.TimeoutExpired('probe', 15), ValueError('invalid JSON')]:
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as folder:
                session = Path(folder)
                release = session / 'old-release'
                release.mkdir()
                (release / 'release.json').write_text('{}')
                original = {'services': {'api': {'cwd': str(release / 'apps/api')}}}
                (session / 'local-runtime.json').write_text(json.dumps(original))
                (session / 'journal.json').write_text(json.dumps({'steps': ['switch_apps','public'], 'snapshotHashes': {'local-runtime.json': deploy.sha(session / 'local-runtime.json')}}))
                class Fake(deploy.Deployment):
                    def __init__(self):
                        self.session, self.gate = session, session / 'gate'
                        self.plan = {'runtimeProtocolRevision':'mcp-data-v1','releaseId':'new'}
                        self.calls=[]
                    def runtime(self, _config):
                        return SimpleNamespace(check_files=lambda:None, check_database=lambda:None, environment=lambda _api:{'FEATURE_GALAXY_MCP':'true'})
                    def network_tracking(self): pass
                    def settle(self, *args, **kwargs): pass
                    def network_barrier(self, enabled): self.calls.append(('barrier',enabled))
                    def work(self, check_protocol=False): raise failure
                    def ready(self, _config): return True
                    def edge_health(self): return {'releaseId':'new'}
                    def command(self,*args): self.calls.append(args)
                fake=Fake()
                with patch.object(deploy,'MANIFEST',session/'local-runtime.json'):
                    with self.assertRaises(type(failure)): fake.rollback()
                self.assertEqual(fake.calls,[('barrier',True),('barrier',False)])
                self.assertFalse(fake.gate.exists())
                self.assertEqual(fake.journal['state'],'ROLLBACK_BLOCKED_CURRENT_RUNTIME_RETAINED')

    def test_schema_contract_uses_the_reviewed_release_and_sql_not_a_hardcoded_count(self):
        with tempfile.TemporaryDirectory() as folder:
            release = Path(folder)
            sql = release / 'apps/api/prisma/migrations/20261013202819_e05_direct_data_receipts/migration.sql'
            sql.parent.mkdir(parents=True)
            sql.write_text('SELECT 1;')
            schema = {'name':'galaxy_os','schema':'public','fingerprint':'measured','migrations':[{'migration_name':sql.parent.name,'checksum':deploy.sha(sql)}]}
            candidate = {'identity':{'database':{'name':'galaxy_os'}},'expectedSchema':schema}
            deploy.verify_schema_contract(candidate, {'expectedSchema':schema}, release)
            with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_DATABASE_CONTRACT'):
                deploy.verify_schema_contract(candidate, {'expectedSchema':{**schema,'fingerprint':'other'}}, release)
            sql.write_text('SELECT 2;')
            with self.assertRaisesRegex(RuntimeError,'MIGRATION_CHECKSUM_MISMATCH'):
                deploy.verify_schema_contract(candidate, {'expectedSchema':schema}, release)
    def test_atomic_replacement_and_unique_backups_preserve_original(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'unit'
            target.write_text('original')
            session = deploy.new_session(Path(folder))
            deploy.snapshot(session, {'unit': target})
            deploy.atomic(target, b'new')
            second = deploy.new_session(Path(folder))
            deploy.snapshot(second, {'unit': target})
            self.assertNotEqual(session, second)
            self.assertEqual((session / 'unit').read_text(), 'original')
            self.assertEqual((second / 'unit').read_text(), 'new')
            with self.assertRaises(FileExistsError): deploy.snapshot(session, {'unit': target})

    def test_each_partial_cutover_failure_calls_rollback(self):
        for failure in ['edge_bootstrap', 'drain', 'switch_apps', 'switch_edge', 'public']:
            class Fake:
                def __init__(self): self.calls = []
                def step(self, name):
                    self.calls.append(name)
                    if name == failure: raise RuntimeError(name)
                def preflight(self): self.calls.append('preflight')
                def rollback(self): self.calls.append('rollback')
            fake = Fake()
            with self.assertRaises(RuntimeError): deploy.activate(fake)
            self.assertEqual(fake.calls[-1], 'rollback')

    def test_permission_preflight_fails_before_mutations(self):
        class Fake:
            calls = []
            def preflight(self): raise PermissionError('sudo unavailable')
            def step(self, name): self.calls.append(name)
            def rollback(self): self.calls.append('rollback')
        fake = Fake()
        with self.assertRaises(PermissionError): deploy.activate(fake)
        self.assertEqual(fake.calls, [])

    def test_readiness_requires_identity_and_database(self):
        self.assertTrue(deploy.ready_body({'status': 'ok', 'releaseId': 'new', 'database': 'connected'}, 'new', True))
        self.assertFalse(deploy.ready_body({'status': 'ok', 'releaseId': 'old', 'database': 'connected'}, 'new', True))
        self.assertFalse(deploy.ready_body({'status': 'ok', 'releaseId': 'new'}, 'new', True))

    def test_public_probe_identifies_galaxy_instead_of_the_cloudflare_blocked_python_agent(self):
        response = MagicMock()
        response.status, response.headers = 200, {'Content-Type': 'application/json'}
        response.read.return_value = b'{}'
        response.__enter__.return_value = response
        direct = MagicMock()
        direct.open.return_value = response
        with patch.object(deploy.urllib.request, 'build_opener', return_value=direct):
            deploy.http_json('https://os.galaxycentre.vn/.well-known/oauth-authorization-server')
        request = direct.open.call_args.args[0]
        self.assertEqual(request.get_header('User-agent'), 'GalaxyOS-MCP-Readiness/1.0')

    def test_network_barrier_precedes_the_last_quiet_sample_and_keeps_existing_work_draining(self):
        with tempfile.TemporaryDirectory() as folder:
            class Fake(deploy.Deployment):
                def __init__(self):
                    self.session = Path(folder)
                    self.gate, self.plan, self.calls = self.session / 'gate', {}, []
                def note(self, name): self.calls.append(name)
                def settle(self, _message, timeout=120, require_mcp_terminal=False): self.calls.append(('settle', self.gate.read_text()))
                def network_barrier(self, enabled): self.calls.append(('barrier', enabled, self.gate.read_text()))
                def work(self): return {'active': 0}
            fake = Fake()
            fake.step('drain')
            self.assertEqual(fake.calls, ['drain', ('settle', 'drain'), ('barrier', True, 'closed'), ('settle', 'closed')])

    def test_tracking_is_enabled_without_rejecting_connections_before_drain(self):
        with tempfile.TemporaryDirectory() as folder:
            fake = object.__new__(deploy.Deployment)
            fake.stage, fake.calls = Path(folder), []
            fake.note = lambda step: fake.calls.append(step)
            fake.command = lambda *args: fake.calls.append(args) or ''
            fake.network_tracking()
            self.assertEqual(fake.calls[1], 'network_tracking')
            self.assertEqual(fake.calls[-1][-1], str(Path(folder) / 'admission-tracking.nft'))
            self.assertFalse(fake.barrier_active)

    def test_barrier_health_uses_only_fixed_root_get_probes(self):
        with tempfile.TemporaryDirectory() as folder:
            fake = object.__new__(deploy.Deployment)
            fake.session = Path(folder)
            fake.journal = {'steps': ['network_barrier']}
            commands = []
            fake.command = lambda *args: commands.append(args) or '{"status":"ok"}'
            self.assertEqual(fake.local_json(3001, '/api/v1/ready')[2]['status'], 'ok')
            self.assertIn('sudo', commands[0])
            self.assertEqual(commands[0][-1], 'http://127.0.0.1:3001/api/v1/ready')
            with self.assertRaisesRegex(RuntimeError, 'INVALID_LOCAL_HEALTH_PROBE'): fake.local_json(3001, '/api/v1/auth/login')

    def test_rollback_after_public_waits_and_keeps_candidate_when_work_does_not_settle(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Path(folder)
            (session / 'local-runtime.json').write_text('{}')
            journal = {'steps': ['switch_apps', 'public'], 'snapshotHashes': {'local-runtime.json': deploy.sha(session / 'local-runtime.json')}}
            (session / 'journal.json').write_text(json.dumps(journal))
            class Fake(deploy.Deployment):
                def __init__(self): self.session, self.gate, self.plan, self.commands = session, session / 'gate', {}, []
                def runtime(self, _config):
                    class Guard:
                        def check_files(self): pass
                        def check_database(self): pass
                        def environment(self, _api): return {}
                    return Guard()
                def settle(self, message, timeout=120, require_mcp_terminal=False):
                    self.commands.append(('settle', require_mcp_terminal))
                    raise RuntimeError(message)
                def ready(self, _config): return False
                def network_tracking(self): pass
                def command(self, *args): self.commands.append(args)
            fake = Fake()
            with self.assertRaisesRegex(RuntimeError, 'KEEP_CURRENT_RUNTIME'): fake.rollback()
            self.assertEqual(fake.commands, [('settle', True)])
            self.assertEqual(fake.gate.read_text(), 'drain')

    def test_incompatible_receiver_requires_terminal_mcp_jobs_but_forward_restart_does_not(self):
        fake = object.__new__(deploy.Deployment)
        fake.journal = {}
        fake.edge_health = lambda: {'admission': 'drain', 'inFlight': 0}
        fake.work = lambda: {'active': 0, 'openMcpJobs': 1}
        with patch.object(deploy, 'http_json', return_value=(200, {}, {'inFlight': 0})):
            self.assertTrue(fake.quiet())
            self.assertFalse(fake.quiet(require_mcp_terminal=True))
            fake.work = lambda: {'active': 0, 'openMcpJobs': 0}
            self.assertTrue(fake.quiet(require_mcp_terminal=True))

    def test_blocked_rollback_reopens_only_a_ready_current_receiver_without_stopping_services(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Path(folder)
            original = {'services': {'api': {}}}
            (session / 'local-runtime.json').write_text(json.dumps(original))
            (session / 'journal.json').write_text(json.dumps({'steps': ['switch_apps', 'public'], 'snapshotHashes': {'local-runtime.json': deploy.sha(session / 'local-runtime.json')}}))
            class Fake(deploy.Deployment):
                def __init__(self):
                    self.session, self.gate, self.plan, self.commands = session, session / 'gate', {'releaseId': 'new'}, []
                def runtime(self, _config):
                    return SimpleNamespace(check_files=lambda: None, check_database=lambda: None, environment=lambda _api: {})
                def settle(self, message, timeout=120, require_mcp_terminal=False):
                    self.commands.append(('settle', require_mcp_terminal))
                    raise RuntimeError(message)
                def ready(self, _config): return True
                def network_tracking(self): pass
                def edge_health(self): return {'releaseId': 'new', 'ready': True}
                def network_barrier(self, enabled): self.commands.append(('barrier', enabled))
                def command(self, *args): self.commands.append(args)
            fake = Fake()
            with patch.object(deploy, 'MANIFEST', session / 'local-runtime.json'):
                with self.assertRaisesRegex(RuntimeError, 'KEEP_CURRENT_RUNTIME'): fake.rollback()
            self.assertEqual(fake.commands, [('settle', True), ('barrier', False)])
            self.assertFalse(fake.gate.exists())
            self.assertEqual(fake.journal['state'], 'ROLLBACK_BLOCKED_CURRENT_RUNTIME_RETAINED')

    def test_real_partial_config_replacement_restores_compatible_units_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            manifest, edge, units = folder / 'manifest', folder / 'edge.conf', folder / 'units'
            units.mkdir()
            original = {'identity': {'release': {'releaseId': 'old'}}}
            manifest.write_text(json.dumps(original))
            edge.write_text('old edge')
            for name in ['galaxy-os-api.service', 'galaxy-os-web.service']: (units / name).write_text('old ' + name)
            stage, session = folder / 'stage', deploy.new_session(folder)
            stage.mkdir()
            (stage / 'local-runtime.candidate.json').write_text('{"new":true}')
            for name in ['galaxy-os-api.service', 'galaxy-os-web.service']: (stage / name).write_text('new ' + name)
            deploy.snapshot(session, {'local-runtime.json': manifest, 'edge.conf': edge,
                'galaxy-os-api.service': units / 'galaxy-os-api.service', 'galaxy-os-web.service': units / 'galaxy-os-web.service'})
            class Fake(deploy.Deployment):
                def __init__(self):
                    self.session, self.stage, self.gate = session, stage, folder / 'gate'
                    self.plan, self.candidate = {}, {}
                    self.journal = {'steps': ['edge_bootstrap'], 'snapshotHashes': {name: deploy.sha(session / name) for name in ['local-runtime.json', 'edge.conf', 'galaxy-os-api.service', 'galaxy-os-web.service']}}
                    self.commands = []
                def command(self, *args):
                    self.commands.append(args)
                    if args == ('systemctl', '--user', 'start', 'galaxy-os-web.service') and manifest.read_text() == '{"new":true}':
                        raise RuntimeError('new Web failed')
                def runtime(self, _config):
                    class Guard:
                        def check_files(self): pass
                        def check_database(self): pass
                    return Guard()
                def ready(self, _config): return True
                def edge_health(self): return {'ready': True}
                def edge_config(self, source): deploy.atomic(edge, source.read_bytes())
                def network_barrier(self, enabled): self.commands.append(('barrier', enabled))
            fake = Fake()
            with patch.object(deploy, 'MANIFEST', manifest), patch.object(deploy, 'UNITS', units):
                with self.assertRaises(RuntimeError): fake.step('switch_apps')
                self.assertEqual((units / 'galaxy-os-api.service').read_text(), 'new galaxy-os-api.service')
                fake.rollback()
            self.assertEqual(json.loads(manifest.read_text()), original)
            self.assertEqual(edge.read_text(), 'old edge')
            self.assertEqual((units / 'galaxy-os-api.service').read_text(), 'old galaxy-os-api.service')
            self.assertEqual((units / 'galaxy-os-web.service').read_text(), 'old galaxy-os-web.service')
            self.assertFalse(fake.gate.exists())
            self.assertEqual(fake.journal['state'], 'ROLLED_BACK_CURRENT_DATABASE_RETAINED')

if __name__ == '__main__': unittest.main()
