"""Snapshot/build only: no DB write, service action, secret copy or live .next edit."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

SPEC = importlib.util.spec_from_file_location('local_runtime', Path(__file__).with_name('local-runtime.py'))
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)

def snapshot(root, output):
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    names = subprocess.check_output(['git', '-C', str(root), 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    digest = hashlib.sha256()
    for name in sorted(set(filter(None, names))):
        relative = Path(name)
        if any(part.startswith('.env') and not part.endswith('.example') for part in relative.parts):
            continue
        source = root / relative
        if not source.exists():
            digest.update((name + ':deleted').encode())
            continue
        if source.is_symlink():
            raise RuntimeError(f'Source symlink needs explicit review: {name}')
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        digest.update(name.encode())
        digest.update(target.read_bytes())
    return {
        'sourceDigest': digest.hexdigest(),
        'baseSha': subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip() or None,
        'dirty': bool(subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain'])),
    }

def verify_dependencies(root):
    for path in root.rglob('*'):
        if path.is_symlink() and not path.resolve().is_relative_to(root.resolve()):
            raise RuntimeError('Dependency symlink resolves outside candidate: ' + str(path.relative_to(root)))

def check_release_space(output):
    # WSL's virtual free space does not represent free space on the host drive.
    if shutil.disk_usage(output.parent).free < 4 * 1024**3:
        raise RuntimeError('RELEASE_DISK_SPACE_LOW')
    if 'microsoft' in os.uname().release.lower():
        powershell = Path('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')
        value = ''
        try:
            result = subprocess.run([str(powershell), '-NoProfile', '-NonInteractive', '-Command', "[System.IO.DriveInfo]::new('C:\\').AvailableFreeSpace"], capture_output=True, text=True, timeout=15)
            if result.returncode == 0:
                value = result.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
        if not value.isdigit():
            for line in Path('/proc/self/mountinfo').read_text().splitlines():
                left, separator, right = line.partition(' - ')
                fields = right.split()
                if separator and left.split()[4] == '/mnt/c' and len(fields) >= 3 and fields[:2] == ['9p', r'C:\134'] and 'path=C:\\;' in fields[2]:
                    value = str(shutil.disk_usage('/mnt/c').free)
                    break
            if not value.isdigit():
                raise RuntimeError('WINDOWS_HOST_SPACE_NOT_VERIFIED')
        if int(value) < 20 * 1024**3:
            raise RuntimeError('WINDOWS_HOST_DISK_LOW_RECLAIM_BEFORE_BUILD')
    if output.parent.name == 'releases':
        complete = [p for p in output.parent.iterdir() if p.is_dir() and any((p / relative).is_dir() and not (p / relative).is_symlink() for relative in ['node_modules', 'apps/web/.next', 'services/document-ai/.venv'])]
        if len(complete) >= 3:
            raise RuntimeError('RELEASE_RETENTION_REQUIRED_ACTIVE_ROLLBACK_ONE_CANDIDATE')

def prepare(root, output, active):
    check_release_space(output)
    metadata = snapshot(root, output)
    preparation = {**metadata, 'state': 'PREPARING_RELEASE_UNVERIFIED'}
    (output / 'preparation.json').write_text(json.dumps(preparation, indent=2) + '\n')
    for existing in [*output.parent.glob('*/release.json'), *output.parent.glob('*/preparation.json')]:
        recorded = json.loads(existing.read_text())
        if existing.parent != output and recorded.get('sourceDigest') == metadata['sourceDigest'] and (recorded.get('state') == 'PREPARING_RELEASE_UNVERIFIED' or (existing.parent / 'node_modules').is_dir()):
            raise RuntimeError('RELEASE_DUPLICATE_SOURCE_CONTINUE_EXISTING_CANDIDATE')
    # Reflinks/copies freeze installed packages. Relative pnpm links stay inside
    # this snapshot; no dependency points at the live development workspace.
    for relative in [Path('node_modules'), *[path.relative_to(root) for path in (root / 'apps').glob('*/node_modules')]]:
        subprocess.run(['cp', '-a', '--reflink=auto', str(root / relative), str(output / relative)], check=True)
    verify_dependencies(output)
    source_api = runtime.Runtime(active, output / '.runtime-preflight').environment(active['services']['api'])
    build_env = {key: value for key, value in source_api.items() if key in {'FEATURE_PROJECT_CHAT', 'FEATURE_PROJECT_AI', 'FEATURE_MARKETING', 'APP_PUBLIC_ORIGIN', 'INTERNAL_API_URL'}}
    release_id = 'local-' + metadata['sourceDigest'][:12]
    build_env.update(PATH=os.environ['PATH'], NODE_ENV='production', ALLOW_DEV_AUTH='false', TRUST_PROXY='true', NEXT_PUBLIC_API_URL='/api/v1', NEXT_TELEMETRY_DISABLED='1', GALAXY_PUBLIC_ACCESS='false', GALAXY_RELEASE_ID=release_id)
    for package in ['api', 'web', 'edge']:
        subprocess.run(['pnpm', '--filter', '@galaxy/' + package, 'build'], cwd=output, env=build_env, check=True)
    metadata.update(releaseId=release_id, webBuildId=(output / 'apps/web/.next/BUILD_ID').read_text().strip(), expectedSchema=active['expectedSchema'])
    metadata['artifactDigests'] = {name: runtime.digest(output / relative) for name, relative in {'api': 'apps/api/dist', 'web': 'apps/web/.next', 'edge': 'apps/edge/dist', 'dependencies': 'node_modules'}.items()}
    (output / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    (output / 'preparation.json').write_text(json.dumps({**preparation, 'state': 'BUILD_FINISHED_NOT_YET_ACCEPTED'}, indent=2) + '\n')
    return metadata

def stage_units(root, release, private_envs, output, manifest_path):
    units = {}
    for name in ['api', 'web']:
        env_file = private_envs[name].resolve(strict=True)
        if env_file.is_relative_to(release.resolve()):
            raise RuntimeError('Private environment must remain outside artifact')
        template = (release / f'infra/systemd/galaxy-os-{name}.service.example').read_text()
        units[f'galaxy-os-{name}.service'] = template.replace('<RUNTIME_ROOT>', str(root)).replace('<CONTROLLER_PATH>', str(release / 'scripts/local-runtime.py')).replace('<PRIVATE_MANIFEST_PATH>', str(manifest_path)).replace(f'<PRIVATE_{name.upper()}_ENV_FILE>', str(env_file))
    units['galaxy-os.target'] = (release / 'infra/systemd/galaxy-os.target.example').read_text()
    if any(re.search(r'<[A-Z_]+>', text) for text in units.values()):
        raise RuntimeError('Unresolved systemd template placeholder; no units staged')
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    for name, text in units.items():
        (output / name).write_text(text)

def candidate_manifest(root, release, private_envs, active):
    metadata = json.loads((release / 'release.json').read_text())
    result = {**active, 'runtimeRoot': str(root), 'identity': {**active.get('identity', {}), 'release': {key: metadata[key] for key in ['releaseId', 'sourceDigest', 'baseSha', 'dirty', 'webBuildId']}}, 'schemaProbe': ['/usr/bin/node', str(release / 'scripts/local-database-status.mjs')], 'services': {}}
    source = metadata.get('verifiedCodeSha') or 'snapshot-sha256:' + metadata['sourceDigest']
    result['identity'].update(webSource=source, apiSource=source, webBuild=(release / 'apps/web/.next/BUILD_ID').read_text().strip(), apiBuildSha256=runtime.digest(release / 'apps/api/dist'), apiBuildDigestKind='SHA256 relative paths + contents of dist directory', apiArtifact=str(release / 'apps/api'), envFile={name: str(path.resolve(strict=True)) for name, path in private_envs.items()}, compatibility=f"Release {metadata['releaseId']}: unchanged reviewed database/schema/storage contract; rollback retains schema and data.")
    for name in ['api', 'web']:
        env_file = private_envs[name].resolve(strict=True)
        environment = runtime.Runtime(active, release / '.runtime-preflight').environment({'envFile': str(env_file), 'environment': {}})
        if not environment.get('GALAXY_LOCAL_RUNTIME_TOKEN') or environment.get('GALAXY_RELEASE_ID') != metadata['releaseId']:
            raise RuntimeError('Private env requires matching release marker and managed token')
        if name == 'api' and environment.get('GALAXY_AI_EXECUTION_POLICY') != 'CHATGPT_PLAN_ONLY':
            raise RuntimeError('Candidate API requires GALAXY_AI_EXECUTION_POLICY=CHATGPT_PLAN_ONLY')
        cwd = release / 'apps' / name
        command = ['/usr/bin/node', str(cwd / 'dist/main.js')] if name == 'api' else ['/usr/bin/node', str(cwd / 'node_modules/next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', '3000']
        artifacts = [cwd / 'dist'] if name == 'api' else [cwd / '.next' / part for part in ['BUILD_ID', 'server', 'static', 'build-manifest.json', 'required-server-files.json', 'prerender-manifest.json', 'routes-manifest.json']]
        paths = [*artifacts, release / 'node_modules', release / 'scripts/local-runtime.py', env_file]
        if name == 'api' and environment.get('GALAXY_AI_OFFICECLI'):
            office = Path(environment['GALAXY_AI_OFFICECLI']).resolve(strict=True)
            if hashlib.sha256(office.read_bytes()).hexdigest() != 'a5ed6e4157fe9b24a099cd24ff30e89a4349b7a7d782d2b7de8d56294c7e1423':
                raise RuntimeError('OfficeCLI capability asset pin does not match')
            paths.append(office)
        result['services'][name] = {'cwd': str(cwd), 'command': command, 'port': 3001 if name == 'api' else 3000, 'health': '/api/v1/ready' if name == 'api' else '/health', 'service': name, 'readyBody': {'status': 'ok', 'releaseId': metadata['releaseId'], **({'database': 'connected'} if name == 'api' else {'service': 'web'})}, 'systemdUnit': f'galaxy-os-{name}.service', 'controllerPath': str(release / 'scripts/local-runtime.py'), 'envFile': str(env_file), 'environment': {}, 'identityKeys': sorted(environment), 'fingerprints': {str(path): runtime.digest(path) for path in paths}}
        if name == 'web':
            version = json.loads((cwd / 'node_modules/next/package.json').read_text())['version']
            result['services'][name]['processTitle'] = f'next-server (v{version})'
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'units'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--release', type=Path)
    parser.add_argument('--api-env', type=Path)
    parser.add_argument('--web-env', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    if not args.output.is_absolute(): raise RuntimeError('Output must be an absolute new private path')
    if args.action == 'build':
        if not args.manifest: raise RuntimeError('Existing reviewed manifest is required')
        result = prepare(root, args.output, json.loads(args.manifest.read_text()))
        print(json.dumps({key: result[key] for key in ['releaseId', 'sourceDigest', 'baseSha', 'dirty', 'webBuildId']}))
    else:
        if not all([args.release, args.api_env, args.web_env, args.manifest]): raise RuntimeError('Release, reviewed manifest and both private env paths are required')
        private_envs = {'api': args.api_env, 'web': args.web_env}
        manifest = candidate_manifest(root, args.release, private_envs, json.loads(args.manifest.read_text()))
        stage_units(root, args.release, private_envs, args.output, args.manifest)
        candidate = args.output / 'local-runtime.candidate.json'
        candidate.write_text(json.dumps(manifest, indent=2) + '\n')
        candidate.chmod(0o600)
        print('User units and candidate manifest staged; not installed or activated')

if __name__ == '__main__': main()
