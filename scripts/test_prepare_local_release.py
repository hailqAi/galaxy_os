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
    def test_wsl_checks_host_free_space_and_never_guesses_on_failure(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='microsoft-standard-WSL2')):
                with patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='1024')):
                    with self.assertRaisesRegex(RuntimeError, 'WINDOWS_HOST_DISK_LOW'):
                        release.check_release_space(Path(folder) / 'candidate')
                with patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='')), patch.object(release.Path, 'read_text', return_value=''):
                    with self.assertRaisesRegex(RuntimeError, 'NOT_VERIFIED'):
                        release.check_release_space(Path(folder) / 'candidate')
    def test_failed_windows_interop_uses_only_verified_c_drive_mount(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        mount = '134 80 0:72 / /mnt/c rw - 9p C:\\134 rw,aname=drvfs;path=C:\\;uid=1000\n'
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='microsoft-standard-WSL2')), patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='')), patch.object(release.Path, 'read_text', return_value=mount), patch.object(release.shutil, 'disk_usage', side_effect=[SimpleNamespace(free=8*1024**3), SimpleNamespace(free=25*1024**3)]):
                release.check_release_space(Path(folder) / 'candidate')
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='microsoft-standard-WSL2')), patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='')), patch.object(release.Path, 'read_text', return_value=mount.replace('path=C:', 'path=D:')):
                with self.assertRaisesRegex(RuntimeError, 'NOT_VERIFIED'):
                    release.check_release_space(Path(folder) / 'candidate')
    def test_keep_only_active_rollback_and_one_complete_candidate(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder)/'releases'; parent.mkdir()
            for name in ['active', 'rollback', 'candidate']:
                root=parent/name; (root/'node_modules').mkdir(parents=True); (root/'apps/web/.next').mkdir(parents=True); (root/'release.json').write_text('{}'); (root/'apps/web/.next/BUILD_ID').write_text('compiled')
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='Linux')):
                with self.assertRaisesRegex(RuntimeError, 'RETENTION_REQUIRED'):
                    release.check_release_space(parent/'fourth')
    def test_same_source_does_not_copy_dependencies_or_build_again(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root, output, existing = Path(folder)/'source', Path(folder)/'new', Path(folder)/'old'
            output.mkdir()
            (existing/'node_modules').mkdir(parents=True)
            (existing/'release.json').write_text(json.dumps({'sourceDigest':'a'*64}))
            with patch.object(release, 'check_release_space'), patch.object(release, 'snapshot', return_value={'sourceDigest':'a'*64}), patch.object(release.subprocess, 'run') as commands:
                with self.assertRaisesRegex(RuntimeError, 'DUPLICATE_SOURCE'):
                    release.prepare(root, output, {})
                commands.assert_not_called()
    def test_interrupted_dependency_copies_count_toward_retention(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder)/'releases'; parent.mkdir()
            for name in ['active', 'rollback', 'interrupted']:
                (parent/name/'node_modules').mkdir(parents=True)
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='Linux')):
                with self.assertRaisesRegex(RuntimeError, 'RETENTION_REQUIRED'):
                    release.check_release_space(parent/'fourth')
    def test_historical_shared_venv_links_do_not_count_as_copied_snapshots(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder)/'releases';parent.mkdir()
            shared=Path(folder)/'shared-venv';shared.mkdir()
            for name in ['active','rollback']:(parent/name/'node_modules').mkdir(parents=True)
            old=parent/'retired/services/document-ai';old.mkdir(parents=True);(old/'.venv').symlink_to(shared,target_is_directory=True)
            with patch.object(release.os, 'uname', return_value=SimpleNamespace(release='Linux')):
                release.check_release_space(parent/'candidate')
    def test_preparation_identity_survives_a_failed_dependency_copy(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root, output = Path(folder)/'source', Path(folder)/'candidate'
            def small_snapshot(_root, out):
                out.mkdir();return {'sourceDigest':'a'*64}
            with patch.object(release, 'check_release_space'), patch.object(release, 'snapshot', side_effect=small_snapshot), patch.object(release.subprocess, 'run', side_effect=OSError('COPY_INTERRUPTED')):
                with self.assertRaisesRegex(OSError, 'COPY_INTERRUPTED'):
                    release.prepare(root, output, {})
            identity=json.loads((output/'preparation.json').read_text())
            self.assertEqual(identity['sourceDigest'],'a'*64)
            self.assertEqual(identity['state'],'PREPARING_RELEASE_UNVERIFIED')
    def test_low_disk_aborts_before_creating_a_candidate(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root, output = Path(folder) / 'source', Path(folder) / 'candidate'
            root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            with patch.object(release.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1})()):
                with self.assertRaisesRegex(RuntimeError, 'RELEASE_DISK_SPACE_LOW'):
                    release.prepare(root, output, {})
            self.assertFalse(output.exists())
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
            office = Path(folder) / 'officecli'
            office.write_bytes(b'not-the-pinned-office-worker')
            envs['api'].write_text('GALAXY_LOCAL_RUNTIME_TOKEN=synthetic-token\nGALAXY_RELEASE_ID=new-release\nGALAXY_AI_EXECUTION_POLICY=CHATGPT_PLAN_ONLY\nGALAXY_AI_OFFICECLI=' + str(office) + '\n')
            with self.assertRaisesRegex(RuntimeError, 'OfficeCLI capability asset pin'):
                release.candidate_manifest(root, candidate, envs, active)
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
