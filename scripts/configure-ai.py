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
        if stat.st_uid != os.getuid() or stat.st_mode & 0o077:
            raise ValueError('File cấu hình cần đúng owner và quyền 0600')
        with os.fdopen(fd, 'r', closefd=False) as stream:
            raw = stream.read()
            data = json.loads(raw)
        if not isinstance(data.get('providers'), dict):
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

def record_test(path, provider, expected_digest, evidence):
    # Chỉ metadata do backend tạo; không nhận secret hoặc dữ liệu Project qua đường này.
    models = dict(google_gemini='gemini-3.8-flash', mistral='mistral-medium-3-5', kira='kira-3.5-pro')
    fields = {'revision', 'provider', 'requestedModel', 'returnedModel', 'capability', 'fixtureVersion', 'testedAt', 'requestId', 'result', 'httpStatus', 'usage'}
    if (not isinstance(evidence, dict) or set(evidence) != fields or
        evidence['provider'] != provider or evidence['requestedModel'] != models[provider] or
        evidence['capability'] not in ['text', 'image', 'pdf'] or
        (provider != 'google_gemini' and evidence['capability'] != 'text') or
        evidence['fixtureVersion'] != 'galaxy-ai-activation-v1' or
        not re.fullmatch(r'[A-Z_]{1,80}', evidence['result']) or
        not re.fullmatch(r'[a-f0-9]{64}', expected_digest)):
        raise ValueError('INVALID_EVIDENCE')
    uuid.UUID(evidence['requestId'])
    datetime.fromisoformat(evidence['testedAt'].replace('Z', '+00:00'))
    if len(json.dumps(evidence)) > 4096:
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
    parser.add_argument('--file', type=Path, default=Path('/home/galaxy_os/.runtime/ai-providers.json'))
    parser.add_argument('--organization')
    parser.add_argument('--project')
    parser.add_argument('--source')
    parser.add_argument('--version')
    args = parser.parse_args()
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
        state = read_private(args.file)['providers'].get(args.provider, {})
        tests = [t for t in state.get('tests', []) if t['revision'] == state.get('revision') and t['result'] == 'PASS']
        result = {k: state.get(k) for k in ['revision', 'enabled', 'replacementConfirmed', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']}
        result.update(credentialConfigured=bool(state.get(PROVIDERS[args.provider][0]) and state.get('replacementConfirmed')), modelAccessVerified=bool(tests), textLiveVerified=any(t['capability'] == 'text' for t in tests), imageLiveVerified=any(t['capability'] == 'image' for t in tests), pdfLiveVerified=any(t['capability'] == 'pdf' for t in tests), lastTest=state.get('lastTest', 'NOT_RUN'))
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
