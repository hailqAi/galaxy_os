"""Nhập khóa THAY THẾ trực tiếp tại máy chủ; không nhận secret qua argv hoặc stdin pipe."""
import argparse
import fcntl
import getpass
import json
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

def read_private(path):
    if not path.exists() and not path.is_symlink():
        return {'providers': {}}
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        stat = os.fstat(fd)
        if stat.st_uid != os.getuid() or stat.st_mode & 0o077:
            raise ValueError('File cấu hình cần đúng owner và quyền 0600')
        with os.fdopen(fd, 'r', closefd=False) as stream:
            data = json.load(stream)
        if not isinstance(data.get('providers'), dict):
            raise ValueError('Cấu hình không hợp lệ; không ghi đè')
        return data
    finally:
        os.close(fd)

def update(path, operation):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('Không dùng symlink cho cấu hình')
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    temporary = None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = read_private(path)
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
            'imageLiveVerified': False, 'pdfLiveVerified': False, 'lastTest': 'NOT_RUN',
            'dataPolicy': 'SYNTHETIC_PUBLIC_APPROVED',
            'maxRequestsPerDay': None, 'maxConcurrent': 1, 'maxOutputTokens': 8192,
            'approvedProjects': previous.get('approvedProjects', []),
            'approvedSources': previous.get('approvedSources', []),
        }
    update(path, change)

def hidden_key():
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            return getpass.getpass('Khóa THAY THẾ (ẩn): ')
    except getpass.GetPassWarning as exc:
        raise ValueError('Terminal không bảo đảm input ẩn; chưa đọc khóa') from exc

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['key', 'enable', 'disable', 'approve-source', 'approve-project', 'status'])
    parser.add_argument('--provider', choices=PROVIDERS, required=True)
    parser.add_argument('--file', type=Path, default=Path('/home/galaxy_os/.runtime/ai-providers.json'))
    parser.add_argument('--organization')
    parser.add_argument('--project')
    parser.add_argument('--source')
    parser.add_argument('--version')
    args = parser.parse_args()
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
        print(json.dumps({k: state.get(k) for k in ['revision', 'enabled', 'replacementConfirmed', 'modelAccessVerified', 'textLiveVerified', 'lastTest', 'dataPolicy', 'maxRequestsPerDay', 'maxConcurrent', 'maxOutputTokens']}, ensure_ascii=False, indent=2))
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
    except (ValueError, OSError, KeyError):
        print('Không cập nhật: kiểm tra owner/quyền file, host và tham số. Không ghi đè cấu hình lỗi.', file=sys.stderr)
        sys.exit(1)
