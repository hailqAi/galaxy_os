import importlib.util
import json
import hashlib
import uuid
import os
from pathlib import Path
import tempfile
import unittest
import warnings
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('configure_ai', Path(__file__).with_name('configure-ai.py'))
config = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(config)

class SecretConfigTest(unittest.TestCase):
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
