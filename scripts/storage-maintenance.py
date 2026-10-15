"""Explicit-manifest maintenance only; keeps release source and business data."""
import argparse, datetime, fcntl, hashlib, json, os, shutil, subprocess
from pathlib import Path

BASE = Path('/home/galaxy_os/.runtime/storage-maintenance')
RELEASES = Path('/home/galaxy_os/.runtime/releases')
RUNTIME = Path('/home/galaxy_os/.runtime/local-runtime.json')
EXTRA_ROOTS = {Path('/home/galaxy_os/.runtime/e05-mcp-20261013') / ('candidate-source-r' + str(n)) for n in range(5, 13)}
RESTORE_ORIGINS = {RELEASES / 'galaxy-os-mcp-e05-20261014-r35-interrupted-wsl': RELEASES / 'galaxy-os-mcp-e05-20261014-r34'}
ALLOWED = {'node_modules', 'apps/api/node_modules', 'apps/web/node_modules', 'apps/edge/node_modules', 'apps/web/.next', 'apps/api/dist', 'apps/edge/dist', 'services/document-ai/.venv'}

def managed_artifact_path(name):
    return name.startswith(str(RELEASES) + '/') or any(name == str(root) or name.startswith(str(root) + '/') for root in EXTRA_ROOTS)

def active_paths():
    value = json.loads(RUNTIME.read_text())
    paths = [Path(s['cwd']) for s in value['services'].values()]
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            paths.append(Path(os.readlink(proc / 'cwd')))
            for argument in (proc / 'cmdline').read_bytes().split(b'\0'):
                name = os.fsdecode(argument)
                if managed_artifact_path(name):
                    paths.append(Path(name))
            for fd in (proc / 'fd').iterdir():
                try:
                    name = os.readlink(fd)
                    if managed_artifact_path(name):
                        paths.append(Path(name.removesuffix(' (deleted)')))
                except (OSError, PermissionError):
                    pass
        except (OSError, PermissionError):
            pass
    return paths

def verify(row, protected, active):
    root, path = Path(row['release']), Path(row['path'])
    if (root.parent != RELEASES and root not in EXTRA_ROOTS) or root.is_symlink() or row['relative'] not in ALLOWED:
        raise RuntimeError('UNSAFE_ROOT_OR_CATEGORY')
    if path != root / row['relative'] or any(p.is_symlink() for p in [path, *path.parents] if p != Path('/')):
        raise RuntimeError('SYMLINK_OR_PATH_MISMATCH')
    if root in protected or any(p == root or p.is_relative_to(root) for p in active):
        raise RuntimeError('RELEASE_IN_USE_OR_PINNED')
    restore = RESTORE_ORIGINS.get(root, root)
    if not (restore / 'pnpm-lock.yaml').is_file() or not (restore / 'package.json').is_file():
        raise RuntimeError('REBUILD_SOURCE_NOT_PRESERVED')
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mount = Path(line.split()[4].replace('\\040', ' '))
        if mount == path or mount.is_relative_to(path):
            raise RuntimeError('MOUNTED_TARGET')
    if not path.exists():
        return False
    stat = path.stat()
    if not path.is_dir() or stat.st_dev != row['device'] or stat.st_ino != row['inode']:
        raise RuntimeError('TARGET_CHANGED_AFTER_MANIFEST')
    return True

def run(mode, plan_path, limit):
    if not plan_path.is_file() or plan_path.is_symlink():
        raise RuntimeError('MANIFEST_REQUIRED')
    plan = json.loads(plan_path.read_text())
    if plan.get('version') != 1:
        raise RuntimeError('MANIFEST_VERSION')
    protected = {Path(p) for p in plan['protectedReleases']}
    retention_path = Path('/home/galaxy_os/.runtime/storage-retention.json')
    if not retention_path.is_file():
        raise RuntimeError('RETENTION_PINS_REQUIRED')
    retention = json.loads(retention_path.read_text())
    protected.update(Path(p) for p in retention['protectedReleases'])
    retired = set(retention['retiredReleases'])
    if any(row['release'] not in retired for row in plan['targets']):
        raise RuntimeError('RETIREMENT_NOT_APPROVED')
    if not protected:
        raise RuntimeError('PROTECTED_RELEASES_REQUIRED')
    paths = active_paths()
    rows = [r for r in plan['targets'] if verify(r, protected, paths)]
    if limit:
        releases = list(dict.fromkeys(r['release'] for r in rows))[:limit]
        rows = [r for r in rows if r['release'] in releases]
    report = {'state': 'DRY_RUN', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'manifestSHA256': hashlib.sha256(plan_path.read_bytes()).hexdigest(), 'targets': [r['path'] for r in rows], 'protected': sorted(str(p) for p in protected), 'businessDataDeletion': False}
    if mode == 'apply':
        journal = BASE / 'cleanup-actions.jsonl'
        with journal.open('a') as stream:
            os.chmod(journal, 0o600)
            for row in rows:
                if verify(row, protected, active_paths()):
                    stream.write(json.dumps({'path': row['path'], 'state': 'DELETE_STARTED', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}) + '\n'); stream.flush(); os.fsync(stream.fileno())
                    shutil.rmtree(row['path'])
                    stream.write(json.dumps({'path': row['path'], 'state': 'DELETED', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}) + '\n'); stream.flush(); os.fsync(stream.fileno())
        report['state'] = 'APPLIED_GENERATED_ONLY'
    report['filesystem'] = {'freeBytes': shutil.disk_usage(RELEASES).free, 'usedBytes': shutil.disk_usage(RELEASES).used}
    print(json.dumps(report))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('mode', choices=['audit', 'dry-run', 'apply']); parser.add_argument('--manifest', type=Path, default=BASE / 'cleanup-manifest.json'); parser.add_argument('--limit-releases', type=int, default=0)
    args = parser.parse_args()
    BASE.mkdir(mode=0o700, parents=True, exist_ok=True)
    if args.limit_releases < 0:
        parser.error('negative limit')
    with (Path('/home/galaxy_os/.runtime/local-managed/lock')).open('a') as deploy_lock, (BASE / 'cleanup.lock').open('a') as lock:
        fcntl.flock(deploy_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(args.mode, args.manifest, args.limit_releases)
