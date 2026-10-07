import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
import json

SPEC = importlib.util.spec_from_file_location('release', Path(__file__).with_name('prepare-local-release.py'))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def test_units_use_candidate_templates_and_reject_unresolved_placeholders(self):
        with tempfile.TemporaryDirectory() as folder:
            root, candidate = Path(folder) / 'old-checkout', Path(folder) / 'candidate'
            templates = candidate / 'infra/systemd'
            templates.mkdir(parents=True)
            envs = {name: Path(folder) / f'{name}.env' for name in ['api', 'web']}
            for name, path in envs.items():
                path.touch()
                (templates / f'galaxy-os-{name}.service.example').write_text(f'[Service]\nWorkingDirectory=<RUNTIME_ROOT>\nEnvironmentFile=<PRIVATE_{name.upper()}_ENV_FILE>\nExecStart=/usr/bin/python3 <CONTROLLER_PATH> serve {name}\nEnvironment=GALAXY_LOCAL_RUNTIME_MANIFEST=<PRIVATE_MANIFEST_PATH>\n')
            (templates / 'galaxy-os.target.example').write_text('[Unit]\nDescription=Candidate target\n')
            output = Path(folder) / 'units'
            release.stage_units(root, candidate, envs, output, Path(folder) / 'manifest.json')
            api = (output / 'galaxy-os-api.service').read_text()
            self.assertIn(f'WorkingDirectory={root}', api)
            self.assertIn(f'{candidate}/scripts/local-runtime.py serve api', api)
            self.assertNotIn('<', api)
            (templates / 'galaxy-os-web.service.example').write_text('[Service]\nWorkingDirectory=<REPOSITORY_PATH>\n')
            rejected = Path(folder) / 'rejected'
            with self.assertRaisesRegex(RuntimeError, 'placeholder'):
                release.stage_units(root, candidate, envs, rejected, Path(folder) / 'manifest.json')
            self.assertFalse(rejected.exists())
    def test_candidate_identity_reports_current_artifacts_and_keeps_database_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root, candidate = Path(folder) / 'source', Path(folder) / 'release'
            metadata = {'releaseId': 'new-release', 'sourceDigest': 'b' * 64, 'baseSha': 'a' * 40, 'dirty': True, 'webBuildId': 'new-build'}
            files = {'release.json': json.dumps(metadata), 'apps/api/dist/main.js': 'compiled-api', 'scripts/local-runtime.py': 'controller', 'apps/web/.next/BUILD_ID': 'new-build', 'apps/web/node_modules/next/package.json': '{"version":"16.2.10"}'}
            files.update({f'apps/web/.next/{name}': '{}' for name in ['build-manifest.json', 'required-server-files.json', 'prerender-manifest.json', 'routes-manifest.json']})
            for name, value in files.items():
                path = candidate / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value)
            for name in ['node_modules', 'apps/web/.next/server', 'apps/web/.next/static']: (candidate / name).mkdir(parents=True)
            envs = {name: Path(folder) / f'{name}.env' for name in ['api', 'web']}
            for path in envs.values(): path.write_text('GALAXY_LOCAL_RUNTIME_TOKEN=synthetic-token\nGALAXY_RELEASE_ID=new-release\nGALAXY_AI_EXECUTION_POLICY=CHATGPT_PLAN_ONLY\n')
            active = {'expectedSchema': {'migrations': []}, 'identity': {'webSource': 'old-source', 'webBuild': 'old-dev-build', 'apiSource': 'old-source', 'apiBuildSha256': 'old-digest', 'apiArtifact': '/old-artifact', 'envFile': '/old-env', 'compatibility': 'old-artifact compatibility', 'database': {'name': 'galaxy_os'}, 'fileStorage': '/existing/storage', 'm2SchemaReady': True, 'm3SchemaReady': True}}
            identity = release.candidate_manifest(root, candidate, envs, active)['identity']
            self.assertEqual('snapshot-sha256:' + 'b' * 64, identity['webSource'])
            self.assertEqual(identity['webSource'], identity['apiSource'])
            self.assertEqual('new-build', identity['webBuild'])
            self.assertEqual(release.runtime.digest(candidate / 'apps/api/dist'), identity['apiBuildSha256'])
            self.assertEqual(str(candidate / 'apps/api'), identity['apiArtifact'])
            self.assertEqual({name: str(path) for name, path in envs.items()}, identity['envFile'])
            self.assertIn('new-release', identity['compatibility'])
            for key in ['database', 'fileStorage', 'm2SchemaReady', 'm3SchemaReady']: self.assertEqual(active['identity'][key], identity[key])
            metadata['verifiedCodeSha'] = 'c' * 40
            (candidate / 'release.json').write_text(json.dumps(metadata))
            self.assertEqual('c' * 40, release.candidate_manifest(root, candidate, envs, active)['identity']['apiSource'])
            envs['api'].write_text('GALAXY_LOCAL_RUNTIME_TOKEN=synthetic-token\nGALAXY_RELEASE_ID=new-release\n')
            with self.assertRaisesRegex(RuntimeError, 'CHATGPT_PLAN_ONLY'):
                release.candidate_manifest(root, candidate, envs, active)
    def test_snapshot_captures_dirty_source_and_excludes_private_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            root, output = Path(folder) / 'source', Path(folder) / 'snapshot'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'app.ts').write_text('first')
            (root / '.gitignore').write_text('.env.local\n')
            (root / '.env.local').write_text('SECRET=synthetic-do-not-copy')
            subprocess.run(['git', '-C', str(root), 'add', 'app.ts', '.gitignore'], check=True)
            (root / 'app.ts').write_text('second')
            result = release.snapshot(root, output)
            self.assertEqual('second', (output / 'app.ts').read_text())
            self.assertFalse((output / '.env.local').exists())
            self.assertTrue(result['dirty'])
            self.assertEqual(64, len(result['sourceDigest']))
    def test_dependencies_cannot_resolve_outside_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'release'
            root.mkdir()
            (root / 'node_modules').mkdir()
            (root / 'node_modules' / 'mutable').symlink_to(Path(folder) / 'outside')
            with self.assertRaises(RuntimeError): release.verify_dependencies(root)

if __name__ == '__main__': unittest.main()
