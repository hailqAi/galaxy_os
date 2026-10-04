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

PROVIDERS = {
    'google_gemini': ('GEMINI_API_KEY', 'generativelanguage.googleapis.com'),
    'mistral': ('MISTRAL_API_KEY', 'api.mistral.ai'),
    'kira': ('KIRA_API_KEY', 'kiraai.vn'),
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
        if not isinstance(data, dict) or set(data) != {'providers'} or not isinstance(data.get('providers'), dict):
            raise ValueError('Cấu hình không hợp lệ; không ghi đè')
        return (data, hashlib.sha256(raw.encode()).hexdigest()) if metadata else data
    finally:
        os.close(fd)

def update(path, operation, expected_digest=None):
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
        operation(data['providers'])
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.ai-')
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
        os.close(lock)

def save_provider(path, provider, key, host):
    name, expected_host = PROVIDERS[provider]
    if host != expected_host or not key.strip() or any(c.isspace() for c in key) or len(key) > 4096:
        raise ValueError('Host cấp khóa hoặc giá trị không hợp lệ; không thử gửi khóa')
    def change(providers):
        previous = providers.get(provider, {})
        providers[provider] = {
            **previous, name: key, 'revision': str(uuid.uuid4()),
            'replacementConfirmed': True, 'enabled': False,
            'modelAccessVerified': False, 'textLiveVerified': False,
            'imageLiveVerified': False, 'pdfLiveVerified': False, 'lastTest': 'NOT_RUN', 'tests': [],
            'dataPolicy': 'SYNTHETIC_PUBLIC_APPROVED',
            'maxRequestsPerDay': None, 'maxConcurrent': 1, 'maxOutputTokens': 8192,
            'approvedProjects': previous.get('approvedProjects', []),
            'approvedSources': previous.get('approvedSources', []),
        }
    update(path, change)

def valid_evidence(evidence, provider):
    models = dict(google_gemini='gemini-3.8-flash', mistral='mistral-medium-3-5', kira='kira-3.5-pro')
    fields = {'revision', 'provider', 'requestedModel', 'returnedModel', 'capability', 'fixtureVersion', 'testedAt', 'requestId', 'result', 'httpStatus', 'usage'}
    if (not isinstance(evidence, dict) or set(evidence) != fields or
        provider not in models or evidence['provider'] != provider or evidence['requestedModel'] != models[provider] or
        not isinstance(evidence['revision'], str) or not 1 <= len(evidence['revision']) <= 100 or
        (evidence['returnedModel'] is not None and (not isinstance(evidence['returnedModel'], str) or len(evidence['returnedModel']) > 200)) or
        evidence['capability'] not in ['text', 'image', 'pdf'] or
        (provider != 'google_gemini' and evidence['capability'] != 'text') or
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

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['key', 'enable', 'disable', 'approve-source', 'approve-project', 'status', 'record-test'])
    parser.add_argument('--provider', choices=PROVIDERS, required=True)
    parser.add_argument('--file', type=Path, default=Path(os.environ.get('GALAXY_AI_CONFIG_FILE') or '/home/galaxy_os/.runtime/ai-providers.json'))
    parser.add_argument('--organization')
    parser.add_argument('--project')
    parser.add_argument('--source')
    parser.add_argument('--version')
    args = parser.parse_args()
    if not args.file.is_absolute():
        raise ValueError('Đường cấu hình cần tuyệt đối')
    if args.action == 'record-test':
        payload = json.loads(sys.stdin.read(16385))
        if set(payload) != {'expectedDigest', 'evidence'}:
            raise ValueError('INVALID_EVIDENCE')
        record_test(args.file, args.provider, payload['expectedDigest'], payload['evidence'])
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
        try:
            info = args.file.lstat()
            owner, mode = info.st_uid, oct(stat_module.S_IMODE(info.st_mode))
            data = read_private(args.file)
            schema_valid = True
            providers = data['providers']
            state = providers.get(args.provider, {})
            credential_present = isinstance(state, dict) and isinstance(state.get(PROVIDERS[args.provider][0]), str) and bool(state[PROVIDERS[args.provider][0]].strip())
            allowed_fields = {'revision', 'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'KIRA_API_KEY', 'replacementConfirmed', 'enabled', 'modelAccessVerified', 'textLiveVerified', 'imageLiveVerified', 'pdfLiveVerified', 'lastTest', 'tests', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens', 'approvedProjects', 'approvedSources'}
            limits = {'maxRequestsPerDay': (1, 100000, True), 'maxConcurrent': (1, 4, False), 'maxOutputTokens': (256, 65536, False)}
            if not isinstance(state, dict):
                state, diagnostic = {}, 'INVALID_CONFIG'
            elif (set(state) - allowed_fields or
                  any(k in state and type(state[k]) is not bool for k in ['enabled', 'replacementConfirmed']) or
                  (credential_present and not all(k in state for k in ['revision', 'dataPolicy'])) or
                  any(k in state and state[k] is not None and type(state[k]) is not int for k in ['maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']) or
                  any(k in state and ((state[k] is None and not nullable) or (state[k] is not None and not low <= state[k] <= high)) for k, (low, high, nullable) in limits.items()) or
                  ('revision' in state and (not isinstance(state['revision'], str) or not 1 <= len(state['revision']) <= 100)) or
                  ('lastTest' in state and (not isinstance(state['lastTest'], str) or not re.fullmatch(r'[A-Z_]{1,80}', state['lastTest']))) or
                  any(isinstance(state.get(k), str) and state[k] == state.get(key_name) for k in ['revision', 'lastTest', 'dataPolicy'] for key_name, _ in PROVIDERS.values()) or
                  ('dataPolicy' in state and state['dataPolicy'] != 'SYNTHETIC_PUBLIC_APPROVED') or
                  not isinstance(state.get('tests', []), list) or
                  len(state.get('tests', [])) > 3 or
                  any(not valid_evidence(t, args.provider) or t['result'] in [state.get(key_name) for key_name, _ in PROVIDERS.values()] for t in state.get('tests', []))):
                state, diagnostic = {}, 'INVALID_CONFIG'
            elif args.provider not in providers:
                diagnostic = 'STORE_INVALID_FORMAT' if set(providers) - set(PROVIDERS) else 'PROVIDER_ENTRY_MISSING' if providers else 'EMPTY_STORE'
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
        result = {k: state.get(k) for k in ['revision', 'enabled', 'replacementConfirmed', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']}
        result.update(storePath=str(args.file), ownerUid=owner, mode=mode, rootSchemaValid=schema_valid, credentialState=diagnostic, configLoaded=schema_valid, credentialPresent=credential_present, credentialConfigured=diagnostic == 'LOADED', modelAccessVerified=bool(tests), textLiveVerified=any(t.get('capability') == 'text' for t in tests), imageLiveVerified=any(t.get('capability') == 'image' for t in tests), pdfLiveVerified=any(t.get('capability') == 'pdf' for t in tests), lastTest=current_tests[-1]['result'] if current_tests else 'NOT_RUN')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    def change(providers):
        state = providers.get(args.provider)
        if not state:
            raise ValueError('Chưa nhập khóa thay thế')
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
    except (ValueError, OSError, KeyError, TypeError) as error:
        if str(error) in ['CONFIG_CHANGED', 'INVALID_EVIDENCE']:
            print(str(error), file=sys.stderr)
            sys.exit(1)
        print('Không cập nhật: kiểm tra owner/quyền file, host và tham số. Không ghi đè cấu hình lỗi.', file=sys.stderr)
        sys.exit(1)
