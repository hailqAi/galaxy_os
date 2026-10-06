"""Nhập khóa THAY THẾ trực tiếp tại máy chủ; không nhận secret qua argv hoặc stdin pipe."""
import argparse
import fcntl
import getpass
import json
import hashlib
import re
from datetime import datetime
import os
from pathlib import Path
import sys
import tempfile
import uuid
import warnings
import stat as stat_module
import subprocess

PROVIDERS = {
    'google_gemini': ('GEMINI_API_KEY', 'generativelanguage.googleapis.com'),
    'mistral': ('MISTRAL_API_KEY', 'api.mistral.ai'),
    'kira': ('KIRA_API_KEY', 'kiraai.vn'),
    'openrouter': ('OPENROUTER_API_KEY', 'openrouter.ai'),
    'llama_cloud': ('LLAMA_CLOUD_API_KEY', 'api.cloud.llamaindex.ai'),
}

def read_private(path, metadata=False):
    if not path.exists() and not path.is_symlink():
        return ({'providers': {}}, None) if metadata else {'providers': {}}
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        stat = os.fstat(fd)
        if not stat_module.S_ISREG(stat.st_mode) or stat.st_size > 262144 or stat.st_uid != os.getuid() or stat.st_mode & 0o077:
            raise ValueError('STORE_UNREADABLE')
        with os.fdopen(fd, 'r', closefd=False) as stream:
            raw = stream.read()
            data = json.loads(raw)
        if not isinstance(data, dict) or set(data) - {'providers', 'credentialSource', 'connections'} or not isinstance(data.get('providers'), dict):
            raise ValueError('Cấu hình không hợp lệ; không ghi đè')
        if 'connections' in data and (not isinstance(data['connections'], dict) or set(data['connections']) - {'llama_cloud'}):
            raise ValueError('INVALID_CONFIG')
        if 'credentialSource' in data and (not isinstance(data['credentialSource'], dict) or set(data['credentialSource']) != {'mode', 'path'} or data['credentialSource']['mode'] != 'env' or not isinstance(data['credentialSource']['path'], str) or not Path(data['credentialSource']['path']).is_absolute()):
            raise ValueError('INVALID_CREDENTIAL_SOURCE')
        return (data, hashlib.sha256(raw.encode()).hexdigest()) if metadata else data
    finally:
        os.close(fd)

def update(path, operation, expected_digest=None, whole_document=False, after_write=None):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('Không dùng symlink cho cấu hình')
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    temporary = None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data, digest = read_private(path, metadata=True)
        if expected_digest is not None and digest != expected_digest:
            raise ValueError('CONFIG_CHANGED')
        operation(data if whole_document else data['providers'])
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.ai-')
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if after_write:
            after_write()
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
        os.close(lock)

def env_credentials(source):
    # Cùng resolver với API; dữ liệu private chỉ đi qua pipe trong máy.
    result = subprocess.run(['node', str(Path(__file__).with_name('ai-credentials.cjs'))], input=json.dumps(source), capture_output=True, text=True, timeout=5, check=True,
                            env={k: v for k, v in os.environ.items() if not k.endswith('_API_KEY')})
    return json.loads(result.stdout)

def private_bytes(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat_module.S_ISREG(info.st_mode) or info.st_size > limit or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('STORE_UNREADABLE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('STORE_UNREADABLE')
        return raw
    finally:
        os.close(fd)

def backup_credentials(path, env_path, directory, expected_digest, env_raw):
    metadata_raw = private_bytes(path, 262144)
    if hashlib.sha256(metadata_raw).hexdigest() != expected_digest or private_bytes(env_path, 32768) != env_raw:
        raise ValueError('CONFIG_CHANGED')
    directory = Path(directory)
    if not directory.is_absolute() or directory.is_symlink():
        raise ValueError('BACKUP_UNSAFE')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.stat()
    if not stat_module.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('BACKUP_UNSAFE')
    snapshot = Path(tempfile.mkdtemp(prefix='setup-', dir=directory))
    for name, raw in [('ai-providers.json', metadata_raw), ('ai-providers.env', env_raw)]:
        fd = os.open(snapshot / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())

def env_text(keys, prefix=''):
    if any(name not in [v[0] for v in PROVIDERS.values()] or not isinstance(key, str) or not key or len(key) > 4096 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in key) for name, key in keys.items()):
        raise ValueError('INVALID_CREDENTIAL')
    text = prefix + ('' if not prefix or prefix.endswith('\n') else '\n')
    text += ''.join(name + '=' + json.dumps(key, ensure_ascii=True) + '\n' for name, key in sorted(keys.items()))
    if len(text.encode('utf8')) > 32768:
        raise ValueError('INVALID_CREDENTIAL')
    return text

def write_env(path, keys, prefix='', *, validate_only=False, expected_raw=None):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink():
        raise ValueError('INVALID_CREDENTIAL_SOURCE')
    text = env_text(keys, prefix)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.ai-env-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        if env_credentials({'mode': 'env', 'path': temporary})['status'] != 'LOADED':
            raise ValueError('INVALID_CREDENTIAL')
        if expected_raw is not None and private_bytes(path, 32768) != expected_raw:
            raise ValueError('CONFIG_CHANGED')
        if not validate_only:
            os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def migrate_env(path, env_path, backup_dir, phase):
    if not all(p and p.is_absolute() for p in [env_path, backup_dir]):
        raise ValueError('INVALID_CREDENTIAL_SOURCE')
    def change(data):
        source = {'mode': 'env', 'path': str(env_path)}
        if data.get('credentialSource', source) != source:
            raise ValueError('CONFLICT')
        keys = {name: state[name] for provider, state in data['providers'].items() for name, _host in [PROVIDERS[provider]] if state.get(name)}
        current = env_credentials(source)
        if env_path.exists() or env_path.is_symlink():
            if current['status'] != 'LOADED' or any(current['keys'].get(name) != key for name, key in keys.items()):
                raise ValueError('CONFLICT')
        elif phase != 'stage' or not keys:
            raise ValueError('SECRET_FILE_MISSING')
        backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = backup_dir.lstat()
        if not stat_module.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('BACKUP_UNSAFE')
        backup = backup_dir / 'ai-providers.before-env.json'
        if not backup.exists():
            fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump(data, stream)
                stream.flush()
                os.fsync(stream.fileno())
        if phase == 'stage':
            if not env_path.exists():
                write_env(env_path, keys)
            return
        if phase == 'finalize' and data.get('credentialSource') != source:
            raise ValueError('ENV_NOT_ACTIVE')
        data['credentialSource'] = source
        if phase == 'finalize':
            for provider, state in data['providers'].items():
                name = PROVIDERS[provider][0]
                if not current['keys'].get(name):
                    raise ValueError('SECRET_FILE_MISSING')
                for key_name, _ in PROVIDERS.values():
                    state.pop(key_name, None)
    update(path, change, whole_document=True)

def save_provider(path, provider, key, host, *, activate=False, expected_digest=None, expected_keys=None, backup_dir=None):
    name, expected_host = PROVIDERS[provider]
    if host != expected_host or not key.strip() or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in key) or len(key) > 4096:
        raise ValueError('Host cấp khóa hoặc giá trị không hợp lệ; không thử gửi khóa')
    pending = {}
    def change(document):
        if provider in ['openrouter', 'llama_cloud'] and not document.get('credentialSource'):
            raise ValueError('ENV_REQUIRED')
        providers = document.setdefault('connections', {}) if provider == 'llama_cloud' else document['providers']
        previous = providers.get(provider, {})
        if not isinstance(previous, dict):
            raise ValueError('INVALID_CONFIG')
        source = document.get('credentialSource')
        if source:
            env_raw = private_bytes(Path(source['path']), 32768) if backup_dir else None
            resolved = env_credentials(source)
            if resolved['status'] != 'LOADED':
                raise ValueError(resolved['status'])
            if expected_keys is not None:
                if resolved['keys'] != expected_keys:
                    raise ValueError('CONFIG_CHANGED')
                if any(key_name in state for state in [*document['providers'].values(), *document.get('connections', {}).values()] if isinstance(state, dict) for key_name, _ in PROVIDERS.values()):
                    raise ValueError('CONFLICT')
            if resolved['keys'].get(name) != key:
                pending.update(path=Path(source['path']), keys={name: key} if expected_keys is not None else {**resolved['keys'], name: key}, prefix=env_raw.decode('utf8') if expected_keys is not None else '')
                env_text(pending['keys'], pending['prefix'])
            if backup_dir:
                backup_credentials(path, Path(source['path']), backup_dir, expected_digest, env_raw)
            if pending and expected_keys is not None:
                write_env(pending['path'], pending['keys'], pending['prefix'], validate_only=True, expected_raw=env_raw)
                pending['expected_raw'] = env_raw
        providers[provider] = {
            **previous, **({name: key} if not source else {}), 'revision': str(uuid.uuid4()),
            'replacementConfirmed': True, 'enabled': activate,
            'modelAccessVerified': False, 'textLiveVerified': False,
            'imageLiveVerified': False, 'pdfLiveVerified': False,
            'lastTest': previous.get('lastTest', 'NOT_RUN') if expected_keys is not None else 'NOT_RUN',
            'tests': previous.get('tests', []) if expected_keys is not None else [],
            'dataPolicy': previous.get('dataPolicy', 'SYNTHETIC_PUBLIC_APPROVED') if expected_keys is not None else 'SYNTHETIC_PUBLIC_APPROVED',
            'maxRequestsPerDay': previous.get('maxRequestsPerDay'), 'maxConcurrent': previous.get('maxConcurrent', 1), 'maxOutputTokens': previous.get('maxOutputTokens', 2048 if provider == 'openrouter' else 8192),
            'approvedProjects': previous.get('approvedProjects', []),
            'approvedSources': previous.get('approvedSources', []),
        }
        if provider == 'openrouter':
            providers[provider]['costMode'] = 'FREE_ONLY'
        if provider == 'llama_cloud':
            providers[provider] = {'revision': providers[provider]['revision'], 'category': 'DOCUMENT_KNOWLEDGE', 'enabled': False, 'replacementConfirmed': True}
        if source:
            for key_name, _ in PROVIDERS.values():
                providers[provider].pop(key_name, None)
    # Hai file không atomic cùng nhau; credential thiếu không thể dispatch dù metadata enabled.
    update(path, change, expected_digest=expected_digest, whole_document=True,
           after_write=lambda: write_env(**pending) if pending else None)

def setup_snapshot(path, env_path):
    document, digest = read_private(path, metadata=True)
    source = {'mode': 'env', 'path': str(env_path)}
    if document.get('credentialSource') != source:
        raise ValueError('CONFLICT')
    resolved = env_credentials(source)
    if resolved['status'] != 'LOADED':
        raise ValueError(resolved['status'])
    return document, digest, resolved['keys']

def activate_existing(path, provider, env_path, backup_dir):
    if provider not in ['openrouter', 'llama_cloud']:
        raise ValueError('INVALID_CONFIG')
    document, digest, keys = setup_snapshot(path, env_path)
    name, host = PROVIDERS[provider]
    if not keys.get(name):
        raise ValueError('SECRET_FILE_MISSING')
    save_provider(path, provider, keys[name], host, activate=provider == 'openrouter', expected_digest=digest, expected_keys=keys, backup_dir=backup_dir)

def setup_missing(path, env_path, backup_dir):
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise ValueError('Nhập khóa tại terminal tương tác có input ẩn')
    if not all(p.is_absolute() for p in [path, env_path, backup_dir]):
        raise ValueError('INVALID_CREDENTIAL_SOURCE')
    print(f'secretEnvPath={env_path}\nmetadataJsonPath={path}')
    print('Tệp JSON chỉ lưu metadata; khóa bí mật chỉ lưu trong tệp env riêng 0600.')
    setup_snapshot(path, env_path)  # Không hỏi khóa khi nguồn hiện hữu chưa đọc được.
    success = True
    for provider in ['openrouter', 'llama_cloud']:
        name, host = PROVIDERS[provider]
        print(f'{provider} · {host} · {name}')
        document, digest, keys = setup_snapshot(path, env_path)
        state = (document.get('connections', {}) if provider == 'llama_cloud' else document['providers']).get(provider, {})
        if not isinstance(state, dict) or (provider == 'openrouter' and state.get('costMode') not in [None, 'FREE_ONLY']):
            print(f'{provider}: CONFLICT; không thay đổi provider này.')
            success = False
            continue
        if keys.get(name):
            print(f'{name}: đã có; không nhập lại hoặc ghi lại khóa.')
            ready = state.get('replacementConfirmed') is True and (state.get('enabled') is True and state.get('costMode') == 'FREE_ONLY' if provider == 'openrouter' else state.get('category') == 'DOCUMENT_KNOWLEDGE')
            if ready:
                continue
            key = keys[name]
        else:
            if provider == 'llama_cloud':
                print('LlamaCloud tùy chọn: Enter để bỏ qua; không xử lý tài liệu.')
            key = hidden_key()
            if not key:
                print(f'{name}: chưa có; không ghi giá trị rỗng.')
                if provider == 'openrouter':
                    return False
                continue
        try:
            save_provider(path, provider, key, host, activate=provider == 'openrouter', expected_digest=digest, expected_keys=keys, backup_dir=backup_dir)
            print(f'{provider}: đã lưu cục bộ; chưa kiểm chứng kết nối hoặc gọi dịch vụ.')
        except ValueError as error:
            code = str(error) if str(error) in ['CONFIG_CHANGED', 'CONFLICT', 'BACKUP_UNSAFE', 'INVALID_CONFIG'] else 'INVALID_CONFIG'
            print(f'{provider}: {code}; không ghi đè thay đổi khác.')
            success = False
    return success

def valid_evidence(evidence, provider):
    models = dict(google_gemini='gemini-3.8-flash', mistral='mistral-medium-3-5', kira='kira-3.5-pro', openrouter='openrouter/free')
    fields = {'revision', 'provider', 'requestedModel', 'returnedModel', 'capability', 'fixtureVersion', 'testedAt', 'requestId', 'result', 'httpStatus', 'usage'}
    if (not isinstance(evidence, dict) or set(evidence) != fields or
        provider not in models or evidence['provider'] != provider or evidence['requestedModel'] != models[provider] or
        not isinstance(evidence['revision'], str) or not 1 <= len(evidence['revision']) <= 100 or
        (evidence['returnedModel'] is not None and (not isinstance(evidence['returnedModel'], str) or len(evidence['returnedModel']) > 200)) or
        evidence['capability'] not in ['text', 'image', 'pdf'] or
        (evidence['capability'] not in (['text', 'image', 'pdf'] if provider == 'google_gemini' else ['text', 'image'] if provider == 'openrouter' else ['text'])) or
        evidence['fixtureVersion'] != 'galaxy-ai-activation-v1' or
        not isinstance(evidence['result'], str) or
        not re.fullmatch(r'[A-Z_]{1,80}', evidence['result']) or
        not isinstance(evidence['requestId'], str) or
        not isinstance(evidence['testedAt'], str) or
        not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z', evidence['testedAt']) or
        (evidence['httpStatus'] is not None and (type(evidence['httpStatus']) is not int or not 100 <= evidence['httpStatus'] <= 599))):
        return False
    usage = evidence['usage']
    if usage is not None and (not isinstance(usage, dict) or
        not {'input_tokens', 'output_tokens'} <= set(usage) or
        set(usage) - {'input_tokens', 'output_tokens', 'thought_tokens'} or
        any(type(v) is not int or not 0 <= v <= 9007199254740991 for v in usage.values())):
        return False
    try:
        request_id = uuid.UUID(evidence['requestId'])
        datetime.fromisoformat(evidence['testedAt'].replace('Z', '+00:00'))
        return str(request_id) == evidence['requestId'].lower() and len(json.dumps(evidence)) <= 4096
    except ValueError:
        return False

def record_test(path, provider, expected_digest, evidence):
    # Chỉ metadata do backend tạo; không nhận secret hoặc dữ liệu Project qua đường này.
    if not valid_evidence(evidence, provider) or not isinstance(expected_digest, str) or not re.fullmatch(r'[a-f0-9]{64}', expected_digest):
        raise ValueError('INVALID_EVIDENCE')
    def change(providers):
        state = providers.get(provider)
        if not state or state['revision'] != evidence['revision']:
            raise ValueError('CONFIG_CHANGED')
        state['tests'] = [t for t in state.get('tests', []) if t['capability'] != evidence['capability']] + [evidence]
        state['lastTest'] = evidence['result']
    update(path, change, expected_digest)

def hidden_key():
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            return getpass.getpass('Khóa THAY THẾ (ẩn): ')
    except getpass.GetPassWarning as exc:
        raise ValueError('Terminal không bảo đảm input ẩn; chưa đọc khóa') from exc

def record_project_policy(path, expected_digest, policy):
    if not isinstance(policy, dict) or set(policy) != {'organizationId', 'revision', 'decisionReference', 'approvedAt'}:
        raise ValueError('INVALID_EVIDENCE')
    uuid.UUID(policy['organizationId'])
    datetime.fromisoformat(policy['approvedAt'].replace('Z', '+00:00'))
    if not all(isinstance(policy[k], str) and 1 <= len(policy[k]) <= limit for k, limit in [('revision', 100), ('decisionReference', 300)]):
        raise ValueError('INVALID_EVIDENCE')
    def change(providers):
        state = providers['openrouter']
        if state.get('costMode') != 'FREE_ONLY' or not state.get('enabled'):
            raise ValueError('INVALID_CONFIG')
        previous = state.get('projectPolicy')
        if previous and previous != policy:
            raise ValueError('POLICY_ALREADY_REVISED')
        state.update(dataPolicy='PROJECT_AUTHORIZED', projectPolicy=policy, policyRevision=policy['revision'])
    update(path, change, expected_digest)

def record_policy(path, provider, expected_digest, event):
    required = {'id', 'actorId', 'organizationId', 'projectId', 'at', 'kind', 'action', 'target'}
    if not isinstance(event, dict) or not required <= set(event) or set(event) - required - {'version'} or event['kind'] not in ['INPUT', 'SOURCE', 'PROJECT'] or event['action'] not in ['APPROVE', 'REVOKE'] or not isinstance(event['target'], str) or len(event['target']) > 200:
        raise ValueError('INVALID_EVIDENCE')
    for name in ['id', 'actorId', 'organizationId', 'projectId']:
        uuid.UUID(event[name])
    datetime.fromisoformat(event['at'].replace('Z', '+00:00'))
    if event['kind'] == 'INPUT' and not re.fullmatch(r'[a-f0-9]{64}', event['target']):
        raise ValueError('INVALID_EVIDENCE')
    def change(providers):
        state = providers[provider]
        if state.get('dataPolicy') not in ['SYNTHETIC_PUBLIC_APPROVED', 'PROJECT_AUTHORIZED']:
            raise ValueError('INVALID_EVIDENCE')
        if state.get('dataPolicy') == 'PROJECT_AUTHORIZED' and (provider != 'openrouter' or state.get('projectPolicy', {}).get('organizationId') != event['organizationId'] or event['kind'] == 'INPUT'):
            raise ValueError('INVALID_EVIDENCE')
        if event['kind'] == 'INPUT':
            field = 'approvedInputs'
            entry = {'organizationId': event['organizationId'], 'projectId': event['projectId'], 'questionHash': event['target']}
        elif event['kind'] == 'SOURCE':
            if not isinstance(event.get('version'), str) or not 1 <= len(event['version']) <= 200:
                raise ValueError('INVALID_EVIDENCE')
            uuid.UUID(event['target'])
            field, entry = 'approvedSources', {'id': event['target'], 'version': event['version']}
        else:
            field, entry = 'approvedProjects', {'organizationId': event['organizationId'], 'projectId': event['projectId']}
        rows = state.setdefault(field, [])
        if event['action'] == 'APPROVE' and entry not in rows:
            rows.append(entry)
        if event['action'] == 'REVOKE':
            state[field] = [row for row in rows if not all(row.get(k) == v for k, v in entry.items())]
        state['policyRevision'] = event['id']
        state.setdefault('policyAudit', []).append(event)
        if len(state['policyAudit']) > 2000 or len(state[field]) > 1000:
            raise ValueError('POLICY_AUDIT_FULL')
    update(path, change, expected_digest)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['setup-missing', 'activate-existing', 'key', 'enable', 'disable', 'pause', 'resume', 'register', 'approve-source', 'approve-project', 'status', 'record-test', 'record-policy', 'project-policy', 'migrate-env'])
    parser.add_argument('--provider', choices=PROVIDERS)
    parser.add_argument('--file', type=Path)
    parser.add_argument('--organization')
    parser.add_argument('--project')
    parser.add_argument('--source')
    parser.add_argument('--version')
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--backup-dir', type=Path)
    parser.add_argument('--phase', choices=['stage', 'activate', 'finalize'])
    args = parser.parse_args()
    canonical_setup = args.action in ['setup-missing', 'activate-existing']
    if args.file is None:
        args.file = Path('/home/galaxy_os/.runtime/ai-providers.json' if canonical_setup else os.environ.get('GALAXY_AI_CONFIG_FILE') or '/home/galaxy_os/.runtime/ai-providers.json')
    if canonical_setup:
        args.env_file = args.env_file or Path('/home/galaxy_os/.runtime/ai-providers.env')
        args.backup_dir = args.backup_dir or Path('/home/galaxy_os/.runtime/ai-credential-backups')
    if not args.file.is_absolute():
        raise ValueError('Đường cấu hình cần tuyệt đối')
    if args.action == 'setup-missing':
        if not setup_missing(args.file, args.env_file, args.backup_dir):
            raise ValueError('SETUP_PARTIAL')
        return
    if args.action == 'activate-existing':
        activate_existing(args.file, args.provider, args.env_file, args.backup_dir)
        print('Đã kích hoạt credential hiện có; evidence cũ đã hết hiệu lực, chưa gọi provider.')
        return
    if args.action == 'migrate-env':
        if not args.phase:
            raise ValueError('Cần phase migration')
        migrate_env(args.file, args.env_file, args.backup_dir, args.phase)
        print('Đã thực hiện bước env; chưa chứng minh API effective. Không hiển thị credential.')
        return
    if not args.provider:
        raise ValueError('Cần provider')
    if args.action == 'register':
        if args.provider != 'llama_cloud':
            raise ValueError('DOCUMENT_CONNECTION_ONLY')
        def register(document):
            document.setdefault('connections', {}).setdefault('llama_cloud', {'revision': str(uuid.uuid4()), 'category': 'DOCUMENT_KNOWLEDGE', 'enabled': False, 'replacementConfirmed': False})
        update(args.file, register, whole_document=True)
        print('Đã đăng ký kết nối tài liệu; chờ credential, chưa gọi dịch vụ.')
        return
    if args.action == 'project-policy':
        if args.provider != 'openrouter':
            raise ValueError('INVALID_CONFIG')
        payload = json.loads(sys.stdin.read(16384))
        record_project_policy(args.file, payload['expectedDigest'], payload['evidence'])
        print('Đã ghi quyết định Project theo tenant; giữ audit và credential.')
        return
    if args.action in ['record-test', 'record-policy']:
        payload = json.loads(sys.stdin.read(16385))
        if set(payload) != {'expectedDigest', 'evidence'}:
            raise ValueError('INVALID_EVIDENCE')
        (record_test if args.action == 'record-test' else record_policy)(args.file, args.provider, payload['expectedDigest'], payload['evidence'])
        print('Đã ghi bằng chứng kiểm thử theo đúng revision; không đổi khóa/policy.')
        return
    if args.action == 'key':
        if not sys.stdin.isatty() or not sys.stderr.isatty():
            raise ValueError('Nhập khóa tại terminal tương tác có input ẩn')
        expected_host = PROVIDERS[args.provider][1]
        print(f'Đích duy nhất: {expected_host}. Chỉ khóa thay thế vừa tạo ở console đúng nhà cung cấp.')
        host = input('Nhập lại host này để xác nhận nơi cấp khóa: ').strip()
        if host != expected_host:
            raise ValueError('Host không khớp; chưa đọc hoặc gửi khóa')
        key = hidden_key()
        save_provider(args.file, args.provider, key, host)
        print('Đã lưu khóa riêng 0600; kết nối vẫn tắt. API đọc file mới ở lượt kế tiếp.')
        return
    if args.action == 'status':
        state, owner, mode, schema_valid, credential_present = {}, None, None, False, False
        credential_source, secret_status = 'json', 'LOADED'
        try:
            info = args.file.lstat()
            owner, mode = info.st_uid, oct(stat_module.S_IMODE(info.st_mode))
            data = read_private(args.file)
            schema_valid = True
            providers = data.get('connections', {}) if args.provider == 'llama_cloud' else data['providers']
            state = providers.get(args.provider, {})
            if data.get('credentialSource'):
                credential_source = 'env'
                resolved = env_credentials(data['credentialSource'])
                secret_status = resolved['status']
                if isinstance(state, dict):
                    state = {**{k: v for k, v in state.items() if k not in [p[0] for p in PROVIDERS.values()]}, **({PROVIDERS[args.provider][0]: resolved['keys'][PROVIDERS[args.provider][0]]} if PROVIDERS[args.provider][0] in resolved['keys'] else {})}
            credential_present = isinstance(state, dict) and isinstance(state.get(PROVIDERS[args.provider][0]), str) and bool(state[PROVIDERS[args.provider][0]].strip())
            allowed_fields = {'revision', 'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'KIRA_API_KEY', 'OPENROUTER_API_KEY', 'LLAMA_CLOUD_API_KEY', 'replacementConfirmed', 'enabled', 'modelAccessVerified', 'textLiveVerified', 'imageLiveVerified', 'pdfLiveVerified', 'lastTest', 'tests', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens', 'approvedProjects', 'approvedSources', 'approvedInputs', 'policyRevision', 'policyAudit', 'projectPolicy', 'paused', 'costMode', 'category'}
            limits = {'maxRequestsPerDay': (1, 100000, True), 'maxConcurrent': (1, 4, False), 'maxOutputTokens': (256, 65536, False)}
            if args.provider not in providers:
                diagnostic = 'STORE_INVALID_FORMAT' if set(providers) - set(PROVIDERS) else 'PROVIDER_ENTRY_MISSING' if providers else 'EMPTY_STORE'
            elif not isinstance(state, dict):
                state, diagnostic = {}, 'INVALID_CONFIG'
            elif (set(state) - allowed_fields or
                  any(k in state and type(state[k]) is not bool for k in ['enabled', 'replacementConfirmed', 'paused']) or
                  (credential_present and not all(k in state for k in (['revision', 'category'] if args.provider == 'llama_cloud' else ['revision', 'dataPolicy']))) or
                  any(k in state and state[k] is not None and type(state[k]) is not int for k in ['maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']) or
                  any(k in state and ((state[k] is None and not nullable) or (state[k] is not None and not low <= state[k] <= high)) for k, (low, high, nullable) in limits.items()) or
                  ('revision' in state and (not isinstance(state['revision'], str) or not 1 <= len(state['revision']) <= 100)) or
                  ('lastTest' in state and (not isinstance(state['lastTest'], str) or not re.fullmatch(r'[A-Z_]{1,80}', state['lastTest']))) or
                  any(isinstance(state.get(k), str) and state[k] == state.get(key_name) for k in ['revision', 'lastTest', 'dataPolicy'] for key_name, _ in PROVIDERS.values()) or
                  ('dataPolicy' in state and state['dataPolicy'] not in ['SYNTHETIC_PUBLIC_APPROVED', 'PROJECT_AUTHORIZED']) or
                  not isinstance(state.get('tests', []), list) or
                  len(state.get('tests', [])) > 3 or
                  any(not valid_evidence(t, args.provider) or t['result'] in [state.get(key_name) for key_name, _ in PROVIDERS.values()] for t in state.get('tests', []))):
                state, diagnostic = {}, 'INVALID_CONFIG'
            elif (args.provider == 'openrouter' and state.get('costMode') != 'FREE_ONLY') or (args.provider == 'llama_cloud' and (state.get('category') != 'DOCUMENT_KNOWLEDGE' or set(state) - {'revision', 'category', 'enabled', 'replacementConfirmed', 'LLAMA_CLOUD_API_KEY'})):
                state, diagnostic = {}, 'INVALID_CONFIG'
            elif secret_status != 'LOADED':
                diagnostic = secret_status
            elif not credential_present:
                diagnostic = 'CREDENTIAL_EMPTY'
            elif not state.get('replacementConfirmed'):
                diagnostic = 'CREDENTIAL_NOT_CONFIRMED'
            else:
                diagnostic = 'LOADED'
        except FileNotFoundError:
            diagnostic = 'CREDENTIAL_NOT_LOADED'
        except OSError:
            diagnostic = 'STORE_UNREADABLE'
        except (ValueError, UnicodeError) as error:
            diagnostic = 'STORE_UNREADABLE' if str(error) == 'STORE_UNREADABLE' else 'STORE_INVALID_FORMAT'
        current_tests = [t for t in state.get('tests', []) if t['revision'] == state.get('revision')]
        tests = [t for t in current_tests if t['result'] == 'PASS']
        result = {k: state.get(k) for k in ['revision', 'enabled', 'paused', 'category', 'costMode', 'replacementConfirmed', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']}
        result['credentialSource'] = credential_source
        result.update(storePath=str(args.file), ownerUid=owner, mode=mode, rootSchemaValid=schema_valid, credentialState=diagnostic, configLoaded=schema_valid, credentialPresent=credential_present, credentialConfigured=diagnostic == 'LOADED', modelAccessVerified=bool(tests), textLiveVerified=any(t.get('capability') == 'text' for t in tests), imageLiveVerified=any(t.get('capability') == 'image' for t in tests), pdfLiveVerified=any(t.get('capability') == 'pdf' for t in tests), lastTest=current_tests[-1]['result'] if current_tests else 'NOT_RUN')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    if args.provider == 'llama_cloud':
        raise ValueError('DOCUMENT_CONNECTION_ONLY')
    def change(providers):
        state = providers.get(args.provider)
        if not state:
            raise ValueError('Chưa nhập khóa thay thế')
        if args.action in ['pause', 'resume']:
            state['paused'] = args.action == 'pause'
            return
        if args.action == 'approve-project':
            if not args.organization or not args.project:
                raise ValueError('Cần organization/project ID của hồ sơ giả hoặc public-approved')
            entry = {'organizationId': args.organization, 'projectId': args.project}
            if entry not in state['approvedProjects']:
                state['approvedProjects'].append(entry)
        elif args.action == 'approve-source':
            if not args.source or not args.version:
                raise ValueError('Cần source index ID và version đã kiểm tra là giả/công khai được phép')
            entry = {'id': args.source, 'version': args.version}
            if entry not in state['approvedSources']:
                state['approvedSources'].append(entry)
        else:
            state['enabled'] = args.action == 'enable'
        state['revision'] = str(uuid.uuid4())
    update(args.file, change)
    print('Đã cập nhật cấu hình. Không có khóa được hiển thị; không tự gọi provider.')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Đã dừng nhập; các khóa đã lưu trước đó được giữ nguyên.', file=sys.stderr)
        sys.exit(130)
    except EOFError:
        print('Đã kết thúc nhập; các khóa đã lưu trước đó được giữ nguyên.', file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, KeyError, TypeError) as error:
        if str(error) in ['CONFIG_CHANGED', 'INVALID_EVIDENCE', 'CONFLICT', 'SECRET_FILE_MISSING', 'ENV_NOT_ACTIVE', 'ENV_REQUIRED', 'SETUP_PARTIAL', 'BACKUP_UNSAFE']:
            print(str(error), file=sys.stderr)
            sys.exit(1)
        print('Không cập nhật: kiểm tra owner/quyền file, host và tham số. Không ghi đè cấu hình lỗi.', file=sys.stderr)
        sys.exit(1)
