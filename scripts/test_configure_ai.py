import importlib.util
import json
import hashlib
import uuid
import os
import pty
import select
import time
from pathlib import Path
import tempfile
import unittest
import warnings
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('configure_ai', Path(__file__).with_name('configure-ai.py'))
config = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(config)

class SecretConfigTest(unittest.TestCase):
    def test_project_policy_keeps_tenant_scope_audit_and_revocation(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.update(path, lambda providers: providers.update(openrouter=dict(revision='r1', costMode='FREE_ONLY', enabled=True, dataPolicy='SYNTHETIC_PUBLIC_APPROVED')))
            organization = str(uuid.uuid4())
            policy = dict(organizationId=organization, revision='owner-20261006', decisionReference='docs/galaxy-os/milestones/M3/UNIFIED-CHAT.md', approvedAt='2026-10-06T00:00:00Z')
            config.record_project_policy(path, hashlib.sha256(path.read_bytes()).hexdigest(), policy)
            state = config.read_private(path)['providers']['openrouter']
            self.assertEqual(state['dataPolicy'], 'PROJECT_AUTHORIZED')
            self.assertEqual(state['projectPolicy'], policy)
            event = dict(id=str(uuid.uuid4()), actorId=str(uuid.uuid4()), organizationId=organization, projectId=str(uuid.uuid4()), at='2026-10-06T01:00:00Z', kind='SOURCE', action='REVOKE', target=str(uuid.uuid4()), version='1:hash')
            config.record_policy(path, 'openrouter', hashlib.sha256(path.read_bytes()).hexdigest(), event)
            self.assertEqual(config.read_private(path)['providers']['openrouter']['policyAudit'][-1], event)
            event['organizationId'] = str(uuid.uuid4())
            with self.assertRaises(ValueError):
                config.record_policy(path, 'openrouter', hashlib.sha256(path.read_bytes()).hexdigest(), event)
    def test_new_credentials_are_env_only_and_document_connection_is_not_chat(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path = Path(root) / 'providers.json', Path(root) / 'providers.env'
            config.save_provider(path, 'kira', 'synthetic-old', 'kiraai.vn')
            for phase in ['stage', 'activate', 'finalize']:
                config.migrate_env(path, env_path, Path(root) / 'backup', phase)
            previous = config.read_private(path)['providers']['kira']
            config.save_provider(path, 'openrouter', 'synthetic-router', 'openrouter.ai')
            config.save_provider(path, 'llama_cloud', 'synthetic-llama', 'api.cloud.llamaindex.ai')
            data = config.read_private(path)
            self.assertEqual(data['providers']['kira'], previous)
            self.assertNotIn('llama_cloud', data['providers'])
            self.assertEqual(data['providers']['openrouter']['costMode'], 'FREE_ONLY')
            self.assertEqual(data['connections']['llama_cloud']['category'], 'DOCUMENT_KNOWLEDGE')
            self.assertNotIn('synthetic-', path.read_text())
            self.assertEqual(config.env_credentials(data['credentialSource'])['keys'], {'KIRA_API_KEY': 'synthetic-old', 'OPENROUTER_API_KEY': 'synthetic-router', 'LLAMA_CLOUD_API_KEY': 'synthetic-llama'})
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(env_path.stat().st_uid, os.getuid())
            for provider in ['openrouter', 'llama_cloud']:
                command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', provider, '--file', str(path)]
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(json.loads(result.stdout)['credentialConfigured'])
                self.assertNotIn('synthetic-', result.stdout + result.stderr)

    def test_new_provider_without_env_fails_closed_and_pause_preserves_revision(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            with self.assertRaisesRegex(ValueError, 'ENV_REQUIRED'):
                config.save_provider(path, 'openrouter', 'synthetic-router', 'openrouter.ai')
            config.save_provider(path, 'mistral', 'synthetic-old', 'api.mistral.ai')
            before = config.read_private(path)['providers']['mistral']
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'pause', '--provider', 'mistral', '--file', str(path)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(config.read_private(path)['providers']['mistral'], {**before, 'paused': True})
            for provider in ['openrouter', 'llama_cloud']:
                result = subprocess.run([sys.executable, '-B', str(Path(config.__file__).resolve()), 'key', '--provider', provider, '--file', str(path)], input='synthetic-do-not-read', capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('synthetic-do-not-read', result.stdout + result.stderr)

    def test_new_key_cli_uses_hidden_terminal_input_without_echo(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path = Path(root) / 'providers.json', Path(root) / 'providers.env'
            config.save_provider(path, 'kira', 'synthetic-old', 'kiraai.vn')
            for phase in ['stage', 'activate', 'finalize']:
                config.migrate_env(path, env_path, Path(root) / 'backup', phase)
            for provider, secret in [('openrouter', 'fake-hidden-router'), ('llama_cloud', 'fake-hidden-llama')]:
                pid, fd = pty.fork()
                if pid == 0:
                    os.execv(sys.executable, [sys.executable, '-B', str(Path(config.__file__).resolve()), 'key', '--provider', provider, '--file', str(path)])
                output = b''
                sent_host = sent_key = False
                deadline = time.monotonic() + 5
                try:
                    while time.monotonic() < deadline:
                        ready, _, _ = select.select([fd], [], [], 0.1)
                        if not ready:
                            continue
                        try:
                            part = os.read(fd, 4096)
                        except OSError:
                            break
                        if not part:
                            break
                        output += part
                        text = output.decode(errors='replace')
                        if 'Nhập lại host' in text and not sent_host:
                            os.write(fd, (config.PROVIDERS[provider][1] + '\n').encode())
                            sent_host = True
                        if '(ẩn):' in text and not sent_key:
                            os.write(fd, (secret + '\n').encode())
                            sent_key = True
                    if not sent_key:
                        os.kill(pid, 9)
                    _, status = os.waitpid(pid, 0)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0, output.decode(errors='replace'))
                    self.assertNotIn(secret, output.decode(errors='replace'))
                    self.assertEqual(config.env_credentials(config.read_private(path)['credentialSource'])['keys'][config.PROVIDERS[provider][0]], secret)
                finally:
                    os.close(fd)

    def test_register_document_connection_is_metadata_only_and_idempotent(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'register', '--provider', 'llama_cloud', '--file', str(path)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            data = config.read_private(path)
            self.assertEqual(data['providers'], {})
            self.assertFalse(data['connections']['llama_cloud']['replacementConfirmed'])
            before = path.read_bytes()
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(path.read_bytes(), before)

    def test_openrouter_missing_entry_is_distinct_from_invalid_present_configuration(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.save_provider(path, 'mistral', 'synthetic-only', 'api.mistral.ai')
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', 'openrouter', '--file', str(path)]
            before = path.read_bytes()
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)['credentialState'], 'PROVIDER_ENTRY_MISSING')
            self.assertEqual(path.read_bytes(), before)
            config.update(path, lambda providers: providers.update(openrouter={'revision': 'r1', 'costMode': 'PAID'}))
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)['credentialState'], 'INVALID_CONFIG')

    def test_env_migration_preserves_keys_metadata_and_has_no_secret_fallback(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path = Path(root) / 'providers.json', Path(root) / 'providers.env'
            key = 'fake-$#\'"\\-key'
            config.save_provider(path, 'kira', key, 'kiraai.vn')
            before = json.loads(path.read_text())
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'migrate-env', '--file', str(path), '--env-file', str(env_path), '--backup-dir', str(Path(root) / 'backup')]
            result = subprocess.run(command + ['--phase', 'stage'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(path.read_text()), before)
            self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(env_path.read_text().split('=', 1)[1]), key)
            result = subprocess.run(command + ['--phase', 'activate'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            status_cmd = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--file', str(path), '--provider', 'kira']
            status = subprocess.run(status_cmd, capture_output=True, text=True, check=True)
            self.assertTrue(json.loads(status.stdout)['credentialConfigured'])
            self.assertEqual(json.loads(status.stdout)['credentialSource'], 'env')
            self.assertNotIn(key, result.stdout + result.stderr + status.stdout + status.stderr)
            env_path.write_text('KIRA_API_KEY="different"\n')
            current = path.read_bytes()
            conflict = subprocess.run(command + ['--phase', 'stage'], capture_output=True, text=True)
            self.assertNotEqual(conflict.returncode, 0)
            self.assertIn('CONFLICT', conflict.stderr)
            self.assertEqual(path.read_bytes(), current)
            env_path.write_text('KIRA_API_KEY=' + json.dumps(key) + '\n')
            result = subprocess.run(command + ['--phase', 'finalize'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            metadata = json.loads(path.read_text())
            self.assertNotIn('KIRA_API_KEY', metadata['providers']['kira'])
            self.assertEqual(metadata['providers']['kira']['revision'], before['providers']['kira']['revision'])
            self.assertEqual(json.loads((Path(root) / 'backup/ai-providers.before-env.json').read_text()), before)
            config.save_provider(path, 'kira', 'fake-new-key', 'kiraai.vn')
            self.assertNotIn('fake-new-key', path.read_text())
            self.assertEqual(json.loads(env_path.read_text().split('=', 1)[1]), 'fake-new-key')
            self.assertFalse(json.loads(path.read_text())['providers']['kira']['enabled'])
            env_path.unlink()
            status = subprocess.run(status_cmd, capture_output=True, text=True, check=True)
            self.assertFalse(json.loads(status.stdout)['credentialConfigured'])

    def test_env_key_change_never_uses_new_key_under_old_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path = Path(root) / 'providers.json', Path(root) / 'providers.env'
            config.save_provider(path, 'kira', 'old-fake-key', 'kiraai.vn')
            for phase in ['stage', 'activate', 'finalize']:
                config.migrate_env(path, env_path, Path(root) / 'backup', phase)
            config.update(path, lambda providers: providers['kira'].update(enabled=True, textLiveVerified=True))
            previous = config.read_private(path)['providers']['kira']['revision']
            replace = config.os.replace
            def fail_metadata(src, dst):
                if Path(dst) == path:
                    raise OSError('synthetic write failure')
                return replace(src, dst)
            with patch.object(config.os, 'replace', side_effect=fail_metadata):
                with self.assertRaises(OSError):
                    config.save_provider(path, 'kira', 'new-fake-key', 'kiraai.vn')
            self.assertEqual(config.env_credentials({'mode': 'env', 'path': str(env_path)})['keys']['KIRA_API_KEY'], 'old-fake-key')
            with patch.object(config, 'write_env', side_effect=OSError('synthetic env failure')):
                with self.assertRaises(OSError):
                    config.save_provider(path, 'kira', 'new-fake-key', 'kiraai.vn')
            state = config.read_private(path)['providers']['kira']
            self.assertFalse(state['enabled'])
            self.assertFalse(state['textLiveVerified'])
            self.assertNotEqual(state['revision'], previous)

    def test_cli_resolves_environment_override_and_explicit_absolute_path(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.save_provider(path, 'mistral', 'synthetic-only', 'api.mistral.ai')
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', 'mistral']
            env = {**os.environ, 'GALAXY_AI_CONFIG_FILE': str(path)}
            result = subprocess.run(command, cwd='/', env=env, capture_output=True, text=True, check=True)
            status = json.loads(result.stdout)
            self.assertTrue(status['credentialConfigured'])
            self.assertEqual(status['storePath'], str(path))
            self.assertNotIn('synthetic-only', result.stdout + result.stderr)
            for cwd in ['/home/galaxy_os', str(Path(config.__file__).resolve().parent.parent)]:
                result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, check=True)
                self.assertEqual(json.loads(result.stdout)['storePath'], str(path))
            explicit = Path(root) / 'missing.json'
            result = subprocess.run(command + ['--file', str(explicit)], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)['credentialState'], 'CREDENTIAL_NOT_LOADED')
            result = subprocess.run(command + ['--file', 'relative.json'], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('Traceback', result.stderr)

    def test_cli_status_distinguishes_empty_invalid_and_unreadable_without_writes(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', 'mistral', '--file', str(path)]
            for raw, mode, expected in [('[]', 0o600, 'STORE_INVALID_FORMAT'), ('{', 0o600, 'STORE_INVALID_FORMAT'), ('{"providers":{}}', 0o600, 'EMPTY_STORE'), ('{"providers":{}}', 0o644, 'STORE_UNREADABLE'), ('{"providers":{"gemini":{}}}', 0o600, 'STORE_INVALID_FORMAT'), ('{"providers":{"google_gemini":{}}}', 0o600, 'PROVIDER_ENTRY_MISSING'), ('{"providers":{"mistral":{}}}', 0o600, 'CREDENTIAL_EMPTY')]:
                with self.subTest(expected=expected, raw=raw):
                    path.write_text(raw)
                    path.chmod(mode)
                    result = subprocess.run(command, capture_output=True, text=True, check=True)
                    self.assertEqual(json.loads(result.stdout)['credentialState'], expected)
                    self.assertEqual(path.read_text(), raw)
                    self.assertNotIn('Traceback', result.stderr)
            path.write_text('[]')
            path.chmod(0o600)
            with self.assertRaises(ValueError):
                config.save_provider(path, 'mistral', 'synthetic-only', 'api.mistral.ai')
            self.assertEqual(path.read_text(), '[]')

    def test_concurrent_updates_preserve_other_providers(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            with ThreadPoolExecutor(max_workers=3) as pool:
                list(pool.map(lambda p: config.save_provider(path, p, 'synthetic-only', config.PROVIDERS[p][1]), ['google_gemini', 'mistral', 'kira']))
            self.assertEqual(set(config.read_private(path)['providers']), set(['google_gemini', 'mistral', 'kira']))

    def test_status_never_prints_malformed_metadata_and_distinguishes_unconfirmed_key(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.save_provider(path, 'mistral', 'synthetic-only', 'api.mistral.ai')
            data = config.read_private(path)
            data['providers']['mistral']['replacementConfirmed'] = False
            path.write_text(json.dumps(data))
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', 'mistral', '--file', str(path)]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            status = json.loads(result.stdout)
            self.assertTrue(status['credentialPresent'])
            self.assertFalse(status['credentialConfigured'])
            self.assertEqual(status['credentialState'], 'CREDENTIAL_NOT_CONFIRMED')
            compatible = json.loads(json.dumps(data))
            compatible['providers']['mistral'].update(revision='revision-1', lastTest='SYNTHETIC_PRIVATE_VALUE')
            path.write_text(json.dumps(compatible))
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)['credentialState'], 'CREDENTIAL_NOT_CONFIRMED')
            self.assertEqual(json.loads(result.stdout)['revision'], 'revision-1')
            self.assertEqual(json.loads(result.stdout)['lastTest'], 'NOT_RUN')
            self.assertNotIn('SYNTHETIC_PRIVATE_VALUE', result.stdout + result.stderr)
            copied_secret = json.loads(json.dumps(data))
            copied_secret['providers']['mistral'].update(MISTRAL_API_KEY='SECRET_COPIED_INTO_METADATA', lastTest='SECRET_COPIED_INTO_METADATA')
            path.write_text(json.dumps(copied_secret))
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertNotIn('SECRET_COPIED_INTO_METADATA', result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout)['credentialState'], 'INVALID_CONFIG')
            for record in [
                {'MISTRAL_API_KEY': 'synthetic-only', 'replacementConfirmed': True},
                {**data['providers']['mistral'], 'tests': [{'revision': data['providers']['mistral']['revision'], 'result': 'PASS', 'capability': 'text'}]},
                {**data['providers']['mistral'], 'tests': [{'revision': data['providers']['mistral']['revision'], 'provider': 'mistral', 'requestedModel': 'mistral-medium-3-5', 'fixtureVersion': 'galaxy-ai-activation-v1', 'result': 'PASS', 'capability': 'text'}]},
                {**data['providers']['mistral'], 'maxConcurrent': -1},
                {**data['providers']['mistral'], 'unknownField': True},
            ]:
                path.write_text(json.dumps({'providers': {'mistral': record}}))
                result = subprocess.run(command, capture_output=True, text=True, check=True)
                status = json.loads(result.stdout)
                self.assertEqual(status['credentialState'], 'INVALID_CONFIG')
                self.assertFalse(status['modelAccessVerified'])
            for field in ['revision', 'lastTest', 'enabled', 'maxRequestsPerDay', 'tests']:
                with self.subTest(field=field):
                    malformed = json.loads(json.dumps(data))
                    malformed['providers']['mistral'][field] = {'MISTRAL_API_KEY': 'synthetic-do-not-print'}
                    path.write_text(json.dumps(malformed))
                    result = subprocess.run(command, capture_output=True, text=True, check=True)
                    self.assertEqual(json.loads(result.stdout)['credentialState'], 'INVALID_CONFIG')
                    self.assertNotIn('synthetic-do-not-print', result.stdout + result.stderr)
                    self.assertNotIn('Traceback', result.stderr)

    def test_preserves_other_provider_and_writes_private_atomic_replacement(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.save_provider(path, 'mistral', 'synthetic-mistral', 'api.mistral.ai')
            config.save_provider(path, 'google_gemini', 'synthetic-google', 'generativelanguage.googleapis.com')
            data = json.loads(path.read_text())['providers']
            self.assertEqual(data['mistral']['MISTRAL_API_KEY'], 'synthetic-mistral')
            self.assertFalse(data['google_gemini']['enabled'])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertIsNone(data['google_gemini']['maxRequestsPerDay'])
            old = path.read_bytes()
            with self.assertRaises(ValueError):
                config.save_provider(path, 'kira', 'synthetic-kira', 'wrong.example')
            self.assertEqual(path.read_bytes(), old)
    def test_evidence_compare_and_swap_keeps_revision_and_other_provider(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            config.save_provider(path, 'mistral', 'synthetic-mistral', 'api.mistral.ai')
            state = config.read_private(path)['providers']['mistral']
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            evidence = dict(revision=state['revision'], provider='mistral', requestedModel='mistral-medium-3-5', returnedModel=None, capability='text', fixtureVersion='galaxy-ai-activation-v1', testedAt='2026-10-04T00:00:00.000Z', requestId=str(uuid.uuid4()), result='PASS', httpStatus=200, usage=None)
            config.record_test(path, 'mistral', digest, evidence)
            saved = config.read_private(path)['providers']['mistral']
            self.assertEqual(saved['revision'], state['revision'])
            self.assertEqual(saved['tests'], [evidence])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'status', '--provider', 'mistral', '--file', str(path)]
            status = json.loads(subprocess.run(command, capture_output=True, text=True, check=True).stdout)
            self.assertTrue(status['textLiveVerified'])
            before_invalid = path.read_bytes()
            for field, invalid in [('httpStatus', True), ('usage', {'input_tokens': -1, 'output_tokens': 1}), ('usage', {'input_tokens': True, 'output_tokens': 1}), ('returnedModel', 1), ('requestId', 'invalid'), ('testedAt', '2026-02-30T00:00:00Z'), ('capability', 'pdf'), ('result', ['PASS'])]:
                with self.subTest(field=field, invalid=invalid):
                    with self.assertRaisesRegex(ValueError, 'INVALID_EVIDENCE'):
                        config.record_test(path, 'mistral', hashlib.sha256(before_invalid).hexdigest(), {**evidence, field: invalid})
                    self.assertEqual(path.read_bytes(), before_invalid)
            config.save_provider(path, 'kira', 'synthetic-kira', 'kiraai.vn')
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'CONFIG_CHANGED'):
                config.record_test(path, 'mistral', digest, evidence)
            self.assertEqual(path.read_bytes(), before)

    def test_hidden_prompt_fails_before_echo_fallback(self):
        def prompt(_):
            warnings.warn('synthetic echo fallback', config.getpass.GetPassWarning)
            self.fail('Must stop before fallback can read a secret')
        with patch.object(config.getpass, 'getpass', side_effect=prompt):
            with self.assertRaises(ValueError):
                config.hidden_key()

    def test_refuses_symlink_and_unsafe_existing_config(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'providers.json'
            path.write_text('{}')
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                config.save_provider(path, 'kira', 'synthetic-kira', 'kiraai.vn')
            path.chmod(0o600)
            link = Path(root) / 'link.json'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                config.save_provider(link, 'kira', 'synthetic-kira', 'kiraai.vn')

class SetupMissingTest(unittest.TestCase):
    def fixture(self, root):
        path, env_path, backup = Path(root) / 'providers.json', Path(root) / 'providers.env', Path(root) / 'setup-backups'
        for provider in ['google_gemini', 'mistral', 'kira']:
            config.save_provider(path, provider, 'fake-' + provider, config.PROVIDERS[provider][1])
        for phase in ['stage', 'activate', 'finalize']:
            config.migrate_env(path, env_path, Path(root) / 'legacy-backup', phase)
        config.update(path, lambda providers: providers['mistral'].update(paused=True, policyRevision='preserve-policy'))
        return path, env_path, backup

    def terminal(self, path, env_path, backup, answers):
        command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'setup-missing', '--file', str(path), '--env-file', str(env_path), '--backup-dir', str(backup)]
        pid, fd = pty.fork()
        if pid == 0:
            os.execv(sys.executable, command)
        output, sent = b'', 0
        deadline = time.monotonic() + 8
        ended = False
        try:
            while time.monotonic() < deadline:
                ready, _, _ = select.select([fd], [], [], 0.1)
                if not ready:
                    continue
                try:
                    part = os.read(fd, 4096)
                except OSError:
                    ended = True
                    break
                if not part:
                    ended = True
                    break
                output += part
                prompts = output.decode(errors='replace').count('(ẩn):')
                if prompts > sent:
                    if sent >= len(answers):
                        break
                    answer = answers[sent]
                    os.write(fd, b'\x03' if answer is None else (answer + '\n').encode())
                    sent += 1
            if not ended:
                os.kill(pid, 9)
            _, status = os.waitpid(pid, 0)
            return os.waitstatus_to_exitcode(status), output.decode(errors='replace')
        finally:
            os.close(fd)

    def call(self, path, env_path, backup, answers):
        answer_iterator = iter(answers)
        with patch.object(config.sys.stdin, 'isatty', return_value=True), patch.object(config.sys.stderr, 'isatty', return_value=True), patch.object(config, 'hidden_key', side_effect=lambda: (value() if callable(value := next(answer_iterator)) else value)):
            return config.setup_missing(path, env_path, backup)

    def test_terminal_missing_keys_preserves_old_three_backups_and_idempotent_rerun(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            before_json, before_env = path.read_bytes(), env_path.read_bytes()
            sibling = config.read_private(path)['providers']
            router, llama = 'fake-$#\'"\\-router', 'fake-llama'
            rc, output = self.terminal(path, env_path, backup, [router, llama])
            self.assertEqual(rc, 0, output)
            self.assertIn('secretEnvPath=' + str(env_path), output)
            self.assertIn('metadataJsonPath=' + str(path), output)
            self.assertIn('openrouter.ai', output)
            self.assertIn('api.cloud.llamaindex.ai', output)
            self.assertNotIn(router, output)
            self.assertNotIn(llama, output)
            data = config.read_private(path)
            for provider, state in sibling.items():
                self.assertEqual(data['providers'][provider], state)
            self.assertTrue(data['providers']['openrouter']['enabled'])
            self.assertEqual(data['providers']['openrouter']['costMode'], 'FREE_ONLY')
            self.assertEqual(data['providers']['openrouter']['tests'], [])
            self.assertEqual(data['connections']['llama_cloud']['category'], 'DOCUMENT_KNOWLEDGE')
            self.assertFalse(data['connections']['llama_cloud']['enabled'])
            keys = config.env_credentials(data['credentialSource'])['keys']
            self.assertEqual(len(keys), 5)
            self.assertEqual(keys['OPENROUTER_API_KEY'], router)
            self.assertEqual(keys['LLAMA_CLOUD_API_KEY'], llama)
            self.assertNotIn(router, path.read_text())
            self.assertNotIn(llama, path.read_text())
            self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
            snapshots = sorted(backup.iterdir())
            self.assertEqual(len(snapshots), 2)
            self.assertTrue(any((entry / 'ai-providers.json').read_bytes() == before_json and (entry / 'ai-providers.env').read_bytes() == before_env for entry in snapshots))
            for entry in snapshots:
                self.assertEqual(entry.stat().st_mode & 0o777, 0o700)
                for file in entry.iterdir():
                    self.assertEqual(file.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(file.stat().st_uid, os.getuid())
            after = path.read_bytes(), env_path.read_bytes()
            rc, output = self.terminal(path, env_path, backup, [])
            self.assertEqual(rc, 0, output)
            self.assertNotIn('(ẩn):', output)
            self.assertEqual((path.read_bytes(), env_path.read_bytes()), after)
            self.assertEqual(len(list(backup.iterdir())), 2)

    def test_optional_llama_skip_or_cancel_keeps_openrouter_saved_before_next_prompt(self):
        for llama in ['', None]:
            with self.subTest(llama=llama), tempfile.TemporaryDirectory() as root:
                path, env_path, backup = self.fixture(root)
                rc, output = self.terminal(path, env_path, backup, ['fake-router', llama])
                self.assertEqual(rc, 0 if llama == '' else 130, output)
                data = config.read_private(path)
                self.assertTrue(data['providers']['openrouter']['enabled'])
                self.assertEqual(config.env_credentials(data['credentialSource'])['keys']['OPENROUTER_API_KEY'], 'fake-router')
                self.assertNotIn('LLAMA_CLOUD_API_KEY', env_path.read_text())

    def test_openrouter_empty_or_cancel_never_mutates_files(self):
        for answer in ['', None]:
            with self.subTest(answer=answer), tempfile.TemporaryDirectory() as root:
                path, env_path, backup = self.fixture(root)
                before = path.read_bytes(), env_path.read_bytes()
                rc, output = self.terminal(path, env_path, backup, [answer])
                self.assertNotEqual(rc, 0, output)
                self.assertEqual((path.read_bytes(), env_path.read_bytes()), before)
                self.assertFalse(backup.exists())

    def test_unknown_env_variable_fails_before_prompt_and_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            with env_path.open('a') as stream:
                stream.write('UNRELATED_VAR="must-preserve"\n')
            before = path.read_bytes(), env_path.read_bytes()
            with self.assertRaises(ValueError):
                self.call(path, env_path, backup, [])
            self.assertEqual((path.read_bytes(), env_path.read_bytes()), before)
            self.assertFalse(backup.exists())

    def test_existing_pending_keys_activate_once_and_keep_comments_and_policy(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            with env_path.open('a') as stream:
                stream.write('# keep-comment\nOPENROUTER_API_KEY="fake-existing"\nLLAMA_CLOUD_API_KEY="fake-existing-llama"\n')
            original_env = env_path.read_bytes()
            config.update(path, lambda providers: providers.update(openrouter={'revision': 'pending', 'enabled': False, 'replacementConfirmed': False, 'dataPolicy': 'SYNTHETIC_PUBLIC_APPROVED', 'costMode': 'FREE_ONLY', 'maxConcurrent': 2, 'approvedInputs': [{'questionHash': 'a' * 64, 'organizationId': 'org', 'projectId': 'project'}], 'tests': []}))
            self.assertTrue(self.call(path, env_path, backup, []))
            self.assertEqual(env_path.read_bytes(), original_env)
            router = config.read_private(path)['providers']['openrouter']
            self.assertTrue(router['enabled'])
            self.assertEqual(router['maxConcurrent'], 2)
            self.assertEqual(router['approvedInputs'][0]['questionHash'], 'a' * 64)
            self.assertNotEqual(router['revision'], 'pending')
            after = path.read_bytes(), env_path.read_bytes()
            self.assertTrue(self.call(path, env_path, backup, []))
            self.assertEqual((path.read_bytes(), env_path.read_bytes()), after)

    def test_concurrent_config_change_during_prompt_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            def change_then_answer():
                config.update(path, lambda providers: providers['kira'].update(policyRevision='concurrent'))
                return 'fake-router'
            self.assertFalse(self.call(path, env_path, backup, [change_then_answer, '']))
            self.assertEqual(config.read_private(path)['providers']['kira']['policyRevision'], 'concurrent')
            self.assertNotIn('OPENROUTER_API_KEY', env_path.read_text())
            self.assertFalse(backup.exists())

    def test_setup_default_paths_ignore_shell_override_and_reject_secret_pipe(self):
        with patch.object(config, 'setup_missing', return_value=True, create=True) as setup, patch.dict(os.environ, {'GALAXY_AI_CONFIG_FILE': '/tmp/wrong.json'}), patch.object(sys, 'argv', ['configure-ai.py', 'setup-missing']):
            config.main()
            setup.assert_called_once_with(Path('/home/galaxy_os/.runtime/ai-providers.json'), Path('/home/galaxy_os/.runtime/ai-providers.env'), Path('/home/galaxy_os/.runtime/ai-credential-backups'))
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            before = path.read_bytes(), env_path.read_bytes()
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'setup-missing', '--file', str(path), '--env-file', str(env_path), '--backup-dir', str(backup)]
            result = subprocess.run(command, input='fake-do-not-consume', capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('fake-do-not-consume', result.stdout + result.stderr)
            self.assertEqual((path.read_bytes(), env_path.read_bytes()), before)

    def test_activation_existing_key_keeps_old_evidence_policy_and_other_providers(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            config.save_provider(path, 'openrouter', 'fake-old-router', 'openrouter.ai')
            original = config.read_private(path)
            router = original['providers']['openrouter']
            evidence = dict(revision=router['revision'], provider='openrouter', requestedModel='openrouter/free', returnedModel='vendor/actual', capability='text', fixtureVersion='galaxy-ai-activation-v1', testedAt='2026-10-05T00:00:00.000Z', requestId=str(uuid.uuid4()), result='PASS', httpStatus=200, usage=None)
            config.record_test(path, 'openrouter', hashlib.sha256(path.read_bytes()).hexdigest(), evidence)
            config.update(path, lambda providers: providers['openrouter'].update(policyRevision='keep-policy', maxConcurrent=2))
            config.write_env(env_path, {**config.env_credentials(original['credentialSource'])['keys'], 'OPENROUTER_API_KEY': 'fake-manually-changed-router'})
            before_env = env_path.read_bytes()
            command = [sys.executable, '-B', str(Path(config.__file__).resolve()), 'activate-existing', '--provider', 'openrouter', '--file', str(path), '--env-file', str(env_path), '--backup-dir', str(backup)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            after = config.read_private(path)
            self.assertNotEqual(after['providers']['openrouter']['revision'], router['revision'])
            self.assertEqual(after['providers']['openrouter']['tests'], [evidence])
            self.assertEqual(after['providers']['openrouter']['lastTest'], 'PASS')
            self.assertEqual(after['providers']['openrouter']['policyRevision'], 'keep-policy')
            self.assertEqual(after['providers']['openrouter']['maxConcurrent'], 2)
            self.assertTrue(after['providers']['openrouter']['enabled'])
            self.assertEqual(env_path.read_bytes(), before_env)
            for provider in ['google_gemini', 'mistral', 'kira']:
                self.assertEqual(after['providers'][provider], original['providers'][provider])

    def test_final_env_size_and_shared_parser_invalid_keys_never_modify_canonical_files(self):
        for key, padding in [('f' * 1000, 32000), ('fake-\ufeff-router', 0), ('😀' * 4096, 0)]:
            with self.subTest(key_length=len(key), padding=padding), tempfile.TemporaryDirectory() as root:
                path, env_path, backup = self.fixture(root)
                if padding:
                    with env_path.open('a') as stream:
                        stream.write('#' + 'x' * padding + '\n')
                before = path.read_bytes(), env_path.read_bytes()
                self.assertFalse(self.call(path, env_path, backup, [key, '']))
                self.assertEqual((path.read_bytes(), env_path.read_bytes()), before)
                self.assertEqual(config.env_credentials(config.read_private(path)['credentialSource'])['status'], 'LOADED')

    def test_env_edit_after_backup_is_not_overwritten_by_appending_a_stale_prefix(self):
        with tempfile.TemporaryDirectory() as root:
            path, env_path, backup = self.fixture(root)
            original_backup = config.backup_credentials
            concurrent_env = []
            def race(*args):
                original_backup(*args)
                with env_path.open('a') as stream:
                    stream.write('# concurrent-preserved\n')
                concurrent_env.append(env_path.read_bytes())
            with patch.object(config, 'backup_credentials', side_effect=race):
                self.assertFalse(self.call(path, env_path, backup, ['fake-router', '']))
            self.assertEqual(env_path.read_bytes(), concurrent_env[0])
            self.assertNotIn('OPENROUTER_API_KEY', env_path.read_text())

if __name__ == '__main__': unittest.main()
