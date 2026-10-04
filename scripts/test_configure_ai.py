import importlib.util
import json
import hashlib
import uuid
import os
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
                list(pool.map(lambda p: config.save_provider(path, p, 'synthetic-only', config.PROVIDERS[p][1]), config.PROVIDERS))
            self.assertEqual(set(config.read_private(path)['providers']), set(config.PROVIDERS))

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

if __name__ == '__main__': unittest.main()
