# Kiểm kê và dọn dung lượng — 14/10/2026

Thời điểm tổng hợp: 2026-10-14T10:40:48.704036+00:00. Đây là kết quả thao tác thật; compact Windows và deploy MCP mới chưa chạy.

## Kết quả đo

| Nhóm                            | Trước          | Sau                                  | Phạm vi bằng chứng                                                                                                                |
| ------------------------------- | -------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Linux filesystem used           | 212.58 GiB     | 65.17 GiB                            | statvfs/disk_usage trước apply và sau focused tests; **giảm 147.41 GiB**. Không cộng các du riêng.                                |
| Linux filesystem free           | 743.06 GiB     | khoảng 890.47 GiB                    | VHD virtual capacity khoảng1TiB; không phải dung lượng trống C.                                                                   |
| Windows C free                  | 14.23 GiB      | CHƯA ĐO LẠI                          | Windows DriveInfo thật09:09Z; probe sau dọn lỗi WSL UtilAcceptVsock accept4 failed110.                                            |
| Ubuntu VHDX physical allocation | 210.55 GiB     | CHƯA XÁC MINH LẠI allocation Windows | GetCompressedFileSizeW trước dọn; chưa compact. DrvFS stat sau dọn vẫn length226077179904B, không thay cho phép đo Windows.       |
| `.runtime` allocated            | 164.08 GiB     | khoảng30.46 GiB                      | du hardlinks counted once within traversal; hai thư mục root-owned không đọc được, báo riêng. Không cộng vào filesystem recovery. |
| Codex packages                  | khoảng10.2 GiB | 2.10 GiB                             | 22 bản lịch sử đã bỏ; current 0.162.1 và fallback còn nguyên.                                                                     |

Nguồn tăng lớn nhất: **128 release directories** giữ lặp dependency/build (~128.48 GiB trước dọn), cộng 8 snapshot candidate cùng dependency, pnpm/npm/pip response caches và Codex executable versions lịch sử. Clone Git/source không phải nguyên nhân hàng trămGiB.

## Đã thực hiện

- Xóa973 đường dẫn generated được whitelist trong134 release/snapshot roots, theo dry-run/manifest/inode+device/process/mount/symlink guards và journal fsync, chia đợt nhỏ. Chỉ node_modules/.next/dist/venv placeholder; source, metadata, lock, config và bằng chứng giữ nguyên.
- `pnpm 10.33.4 store prune`:62550 files/1637 packages; `npm cache clean --force`; pip purge74files và exact http-v2 HTTP cache. Không xóa môi trường Python cá nhân.
- Xóa22 stock Codex package versions cũ, giữ standalone 0.161.0/0.162.1 và daemon 0.161.0/0.162.0/0.162.1. Installer locks/current symlinks/exe/cwd/cmdline/openFD đã đối chiếu; sessions/auth/plugins/logs không xóa. Tổng23 user-cache targets. Binary version/source layout ghi trong manifest; updater và bản hiện tại giữ nguyên để tải lại.
- `git worktree prune --dry-run` rồi prune 3 registration đã mất thư mục/tmp. Không xóa worktree source, branches, tags hay Git objects.
- Không xóa toàn bộ clone nào: chưa mục nào đủ cả điều kiện không dùng + bảo toàn dữ liệu riêng + phục hồi được.

## Repository và tool thực tìm thấy

Không mặc định lời nhắc “11 repository” là11 Git clone còn tồn tại. Tìm thấy7 Git checkouts,12 installed plugin versions và các binary/package assets bên dưới. Windows Desktop/Documents/Downloads được dò439 directories đếndepth 4 vàkhông thấy.git; đây không phải quét hết mọi thư mục trênC.

| Tên              | Đường dẫn                                                      | Loại         | Dung lượng sau | Thành phần sử dụng / căn cứ                                                                                                                            | Dữ liệu riêng                | Quyết định | Bảo toàn / khôi phục                                                                                                  |
| ---------------- | -------------------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| ponytail         | `/home/hailq_glx/.codex/.tmp/marketplaces/ponytail`            | Git checkout | 0.022 GiB      | Configured Ponytail marketplace/plugin consumed by current session; source contains install metadata and installed cache is active.                    | install metadata             | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `2961b52fc1fe6a5a87c7a959a79512e5c2f3ffe5` |
| plugins          | `/home/hailq_glx/.codex/.tmp/plugins`                          | Git checkout | 0.086 GiB      | Codex marketplace snapshot has no origin and one local-only commit; restore source not proven. 180 marketplace declarations are not installed plugins. | local-only snapshot          | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `11c74d6ba24d3a6d48f54a194cd00ef3beea18f9` |
| 5.2.0            | `/home/hailq_glx/.codex/plugins/cache/ponytail/ponytail/5.2.0` | Git checkout | 0.022 GiB      | Configured Ponytail marketplace/plugin consumed by current session; source contains install metadata and installed cache is active.                    | install metadata             | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `2961b52fc1fe6a5a87c7a959a79512e5c2f3ffe5` |
| Flowise          | `/home/hailq_glx/ai-workflow/Flowise`                          | Git checkout | 2.903 GiB      | Three tracked changes and three untracked source/config files; clone is not disposable.                                                                | tracked + untracked changes  | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `b7a2005fd7b394ba7874aded744fe3730d59ccb3` |
| hailq_ai_project | `/home/hailq_ai_project`                                       | Git checkout | 4.891 GiB      | User-owned project and ignored venv; lack of source consumers is insufficient to authorize deletion of its environment or repository.                  | private venv                 | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `a84d0ad3bc27dd30a32b1b2084729de4a6377008` |
| galaxy_os        | `/home/galaxy_os`                                              | Git checkout | 1.402 GiB      | Distinct active source checkout; uncommitted work and 111 commits not reachable from existing remote-tracking refs.                                    | dirty source / local history | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `1a59665854c99a1298f47a71c6852917eb2c8e7c` |
| m2-a-20260928    | `/home/galaxy_os/.worktrees/m2-a-20260928`                     | worktree     | 3.639 GiB      | Distinct active source checkout; uncommitted work and 111 commits not reachable from existing remote-tracking refs.                                    | dirty source / local history | GIỮ        | Git status/ignored/stash/refs + consumer/config inspection; restore commit `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` |

Kích thước root Galaxy loại `.runtime` và nestedworktree; từng hàng tính hardlink một lần trong traversal riêng, **không cộng các hàng**. 111 local commits Galaxy không reachable từremote-tracking refs hiện có, toàn bộ giữ lại. Stash 0 trong7 checkouts. Restore origins/commits/localbranch/tag inventory nằm trong private repository-inventory-final.json; không push dữ liệu riêng.

| Tool / plugin                                                                                                                    | Đường dẫn                                                                                              | Loại                                           | Thành phần sử dụng                                                     | Dữ liệu riêng                                    | Quyết định | Căn cứ                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------- |
| Galaxy Os                                                                                                                        | `/home/hailq_glx/.codex/plugins/cache/created-by-me-remote/dev-6ace76398dd881918b46233a2a5bdbaa/1.0.0` | plugin 1.0.0                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Galaxy OS R21                                                                                                                    | `/home/hailq_glx/.codex/plugins/cache/created-by-me-remote/dev-6acee418a5a481918699659607020d0f/1.0.0` | plugin 1.0.0                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Work with Gmail using the configured Gmail app connector                                                                         | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/gmail/0.1.10`                              | plugin 0.1.10                                  | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Use Google Drive as the single entrypoint for Drive, Docs, Sheets, and Slides work                                               | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.20`                       | plugin 0.1.20                                  | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| OpenAI default document, presentation, and spreadsheet templates                                                                 | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1`                    | plugin 0.1.1                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Create, read, and edit pages and spaces with ChatGPT Space                                                                       | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/pages/0.1.23`                              | plugin 0.1.23                                  | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Create and improve plugins from your ideas, instructions, and workflows                                                          | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/plugin-creator/0.1.26`                     | plugin 0.1.26                                  | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Discover relevant plugins and manage app connections, permissions, and dependencies                                              | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/plugin-management/0.1.0`                   | plugin 0.1.0                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Build and deploy websites with Sites                                                                                             | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/sites/1.0.2-remix-a.1`                     | plugin 1.0.2-remix-a.1                         | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| An agentic skills framework & software development methodology that works: planning, TDD, debugging, and collaboration workflows | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2`                         | plugin 6.4.2                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Create and manage animated companion pets that appear inside ChatGPT Work mode                                                   | `/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/work-pets/0.1.6`                           | plugin 0.1.6                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| Lazy senior dev mode                                                                                                             | `/home/hailq_glx/.codex/plugins/cache/ponytail/ponytail/5.2.0`                                         | plugin 5.2.0                                   | configured/available connector or skill                                | plugin/config metadata                           | GIỮ        | Installed manifest; no proven disposable duplicate                                  |
| OfficeCLI                                                                                                                        | `.runtime/e02-20261010/officecli`                                                                      | external runtime asset1.0.156; folder123.54MiB | API read-only document preview/validation; active manifest fingerprint | LICENSE/NOTICE/probes                            | GIỮ        | Executable pin a5ed6e…; runtime path còn dùng.                                      |
| PptxGenJS                                                                                                                        | current/canonical `.pnpm/pptxgenjs@4.0.1`                                                              | installed dependency                           | ai-presentation→ai-document                                            | package/license                                  | GIỮ        | import, lockfile và runtime artifacts.                                              |
| AnyDoc                                                                                                                           | `.runtime/e02-20261010/anydoc-evaluation`                                                              | evaluation package0.2.4;19.29MiB               | deferred, chưa runtime-wired                                           | local evaluation inputs/output/source provenance | GIỮ        | Chưa bảo toàn/đối chiếu riêng dữ liệu thử; dung lượng nhỏ, không xóa theo suy đoán. |

17 upstream names trong E03_TOOL_ADOPTION_MATRIX là capability/request/reference inventory, không bằng chứng17 repositories đã clone. Các nhóm còn lại như personal perl-test/venv, ai-workflow private data và unresolved Codex scratch roots giữ nguyên vì chưa chứng minh khả năng tái tạo. Model weights/custom data trong env riêng không xóa.

## Dữ liệu và vận hành bảo toàn

- R32 **local-d2565a503380** vẫn READY; API/Web/Edge trỏ đúng frozen32, protocol mcp-data-v2, main schema98 / structure 683ecb6060fd391b2d7ae4c7ed834822. MetadataSHA e071549124e5fa7180115a3ddf276cfce88978a016a30101435dd60e5dd962f1.
- R33 **local-6b454d4851df** giữ đầy đủ làm compatible spare/candidate, chưa active. MetadataSHA561e505dc8540b514e14db971e24e32de564840fcd43af610587a03630744d45. Hai release API/Web/Edge/dependency artifact digests khớp hoàn toàn metadata sau dọn. Không sử dụng lại rollback R21/v1; kế hoạch cũ của các release đã retire chỉ để audit, generated runtime không còn nên không được activate.
- Source comparison134/134roots PASS. Raw133 PASS + 1 mismatch được giữ trong receipt: directory symlink generated-prisma/runtime của rollback-0e5680a chuyển thành dangling sau khi xóa dependency, nên os.walk phân loại từdirs sangfiles; target/symlink/source không đổi và cùng cách phân loại trước dọn hash khớp chính xác. Không che raw mismatch.
- Root Git status không mấtentry; canonical cũng không mấtentry, chỉthêm2 maintenance files trong phépđo trước/sau, sau đó có MCP fix đã ủy quyền và status docs. Giữ dirty/untracked/ignored source và local history.
- Main DB khoảng38.4 MiB; AuditLog lớn nhất khoảng 4.6 MiB, ChatAiAnswer khoảng 2.9 MiB. Không phải nguồn tăng hàng trăm GiB; không VACUUM FULL/WAL delete/migration/reset/restore.
- Docker: 6 images khoảng 8.27 GB, 18 containers, 9 volumes khoảng 262.8 MB giữ nguyên; build cache 0 B. Không prune volumes. Main PostgreSQL/Redis persistence và backups Files/business (~20 GiB của E03 backups) giữ nguyên; chưa có nơi ngoài ổ C bảo toàn độc lập để retire những bản chưa đủ căn cứ.
- Journal khoảng 1.7 GB cùng logs/trace/Work XLSX4653B củaBuserror/MCPimport/latency giữ nguyên. Không có large deleted files >10MiB đang giữFDở thời điểm kiểmtra.
- Input trial 6493 B checksum dd63e46b4cc671c928f5ad52f510dfe8e3f9c3f30a6161fc7f161f6017aa2396 đọc được. File gốc của hai job thật được đối chiếu riêng trong business-job-manifests-after.json. Artifact đang chờ / retry / receipts / outbox / subscription không xóa.
- Có 1 nonrevoked unexpired subscription theo refreshBefore; verifiedUntil là cache callback verification, không dùng làmexpiry củasubscription. Work tiếp tụcghi job/delivery thật trongthời gian dọn; số đếm đã thay đổi hợp lệ, không khẳng định DB đóng băng.
- Sáu public HTTPS MCP/OAuth contracts 10:11:39Z PASS JSON/401/400 + cả hai release headers đúng R32. Installed Galaxy OS R21 OAuth tool đếm 10 Project thật lúc 10:23:39Z; không cần job/Events. Đây không phải XLSX roundtrip hoàn tất.

## Ngăn phình lại

Đã sửa canonical code `scripts/prepare-local-release.py` và thêm `scripts/storage-maintenance.py`, cùng regression tests. Policy `.runtime/storage-retention.json` pin R32/R33 và chỉ cho phép dọn các root đã xác minh retire. Manifest mặc định đã cài tại `.runtime/storage-maintenance/cleanup-manifest.json`; audit sau dọn còn 0 target.

```bash
/usr/bin/python3 /home/galaxy_os/.worktrees/m2-a-20260928/scripts/storage-maintenance.py audit
/usr/bin/python3 /home/galaxy_os/.worktrees/m2-a-20260928/scripts/storage-maintenance.py dry-run
```

Apply dùng manifest đã review, tối đa 4 root mỗi đợt. Script từ chối target đang dùng, pin, symlink, mount hoặc inode đã đổi. Không tự dọn source, DB, uploads hay backup.

Release preparation kiểm tra **trước copy/build**: Linux free ≥4 GiB, Windows C free thực ≥20 GiB, tối đa 3 snapshot còn dependency/build (active, bản tương thích, một candidate). Nếu không đo được Windows thì dừng. Marker PREPARING và sourceDigest ngăn đóng gói trùng hoặc tạo lại bản build đã bị ngắt. Không chia sẻ hardlink giữa dependency có thể bị Prisma generate sửa và release đóng băng.

Checkpoint chỉ lưu văn bản, ID và manifest; không sao chép dependency. Không clone lại cùng tool hoặc chạy builder cũ bỏ qua guard. Playwright hiện đã dùng retain-on-failure/only-on-failure; không bật trace/video cho mọi ca thành công. Cache tải xuống dọn bằng package manager; logs và bằng chứng các lỗi chưa giải quyết vẫn giữ.

## Thu hồi ổ C — thao tác owner ngoài phiên Codex

Script và hướng dẫn nhỏ đã đặt tại \*\*C:\Users\Admin\GalaxyOS-Maintenance-20261014\*\* để đọc được khi Ubuntu tắt. Đúng VHDX:

```text
C:\Users\Admin\AppData\Local\wsl\{a3d59df2-b5da-4c10-b499-8acac4303f79}\ext4.vhdx
```

Đã xác minh Ubuntu-22.04, WSL2.7.3.0, Windows11 Pro22631.6199; VHDX chưa sparse ở phép đo trước. Optimize-VHD có sẵn, nhưng phiên hiện tại không có quyền Windows Administrator.

Trước khi dừng Galaxy, mở sẵn Windows PowerShell **as Administrator** và kiểm tra `Get-Command Get-VHD, Mount-VHD, Optimize-VHD, Dismount-VHD` không báo lỗi. Giữ cửa sổ đó để chạy compact ngay sau pause; nếu không có quyền/cmdlet thì Galaxy vẫn phục vụ.

1. Đóng build/install và công việc WSL khác; thoát Docker Desktop để tránh tự khởi động lại Ubuntu. Trong Ubuntu, chạy bằng `hailq_glx`:

```bash
sudo -v
/usr/bin/python3 /home/galaxy_os/.runtime/storage-cleanup-20261014/pause-for-compact.py pause
```

Chỉ tiếp tục khi có `PAUSED_FOR_OFFLINE_COMPACT`. Helper xác minh R32, stage/schema, container IDs và volumes, READY trước khi gián đoạn; dùng drain/NFT barrier hiện có để chờ request, worker và artifact lease. Redis SAVE rồi dừng dịch vụ và DB đúng thứ tự; fstrim không ghi zero-fill. Nếu drain không ổn định, helper phục hồi R32, không ép hủy job. Work phía ngoài có thể còn xử lý; không khẳng định đã dừng Work.

2. Mở **Windows PowerShell as Administrator**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Admin\GalaxyOS-Maintenance-20261014\compact-galaxy.ps1"
```

Bypass chỉ áp dụng cho process này. Script kiểm tra receipt còn mới và trạng thái Linux thật ngay trước khi dừng; chỉ terminate Ubuntu-22.04, không shutdown distro khác. Nó từ chối VHD còn attached, mount read-only, Optimize-VHD Full và luôn dismount trong finally. JSON dung lượng C và VHDX trước/sau lưu trên Windows. Không resize, sao chép VHD hoặc zero-fill.

[Microsoft Optimize-VHD](https://learn.microsoft.com/en-us/powershell/module/hyper-v/optimize-vhd?view=windowsserver2025-ps) yêu cầu disk offline hoặc read-only; compact có thể thành công mà không giảm kích thước. [WSL disk-space](https://learn.microsoft.com/en-us/windows/wsl/disk-space) giải thích virtual capacity và host disk. Phải đọc receipt sau thao tác, chưa được coi 147 GiB Linux là đã thu hồi về C.

3. Mở Ubuntu lại, chạy bằng `hailq_glx`:

```bash
sudo -v
/usr/bin/python3 /home/galaxy_os/.runtime/storage-cleanup-20261014/pause-for-compact.py resume
```

Resume vô hiệu receipt compact trước khi start; từ chối container ID, volume hoặc manifest đã đổi. Nó khởi động DB/Redis → API → Web → Edge, chờ R32 và DB READY, mở admission rồi kiểm tra 6 public contracts. Chỉ báo `RESUMED_PUBLIC_VERIFIED` khi các phép kiểm tra thật đạt. Không restore/reset DB. Nếu pause hoặc compact bị ngắt, dùng lệnh resume này và giữ receipt để chẩn đoán.

## Kiểm thử và phần MCP đã tiếp tục

- Fresh **93 Python script tests PASS**, thêm **4 mock tests** bảo vệ pause/resume PASS. Độc lập Astra/Ponytail review: SHIP cho exact cleanup, prevention và owner handoff.
- Actual pause/resume, Windows script execution và compact: **NOT_RUN**. Interop lỗi nên chưa kiểm thử PowerShell parser/runtime trên Windows.
- App full gates/build/browser trên source mới: **NOT_RUN** vì dung lượng Windows chưa xác minh; không báo scope ứng dụng hoàn tất.

Sau cleanup đã tiếp tục lỗi MCP còn dở. G00 dùng tmpfs nên mất DB test sau WSL restart: xác minh đúng container/port/DB identity và DB trống trước khi khởi tạo 98 migrations/seed **chỉ trên DB test**, không chạm main.

Regression G00 tái hiện “sửa file vừa tạo” sau clarification: expected201, got409. Candidate selection và baseArtifacts bây giờ chỉ chọn AVAILABLE receipts thuộc submission hiện hành. File cũ và native output vẫn giữ; auth/scope/version không thay đổi. Regression GREEN2, sau đó **5 ca MCP liên quan PASS**, API typecheck/eslint/format PASS; review **SHIP_SOURCE_ONLY**.

Hai job thật `e3ad6597-5e2e-4a87-b8ef-165394f2f0e6` và `821fee96-5d1a-4fd5-b985-2f9157cf1427` vẫn MCPstateERROR, receipt có fileAssetId/checksumnull. Chưa được báo XLSX đã lưu. R32 còn parser cũ; R33 có decoder correction đã kiểm thử local nhưng chưa active.

Bước tiếp theo: sau compact và Windows free-space proof, tạo **một candidate R36** từ canonical source, chạy gates/browser/restart và bind manifest đúng bytes, rồi owner activation và nghiệm thu Work/file thật. Không chạy `prepare-candidate-r35.py` cũ: R34 dependency đã retire; R35 partial không có gates. Không sửa frozen releases hoặc tạo job xử lý trùng.

Bus error: tiến trình gây lỗi và nguyên nhân vẫn UNKNOWN; không quy cho RAM/model. Latency job256da0cc…: creation→ACK2.250s, ACK→firstgetJob117.542s, firstgetJob→processingreport14.115s, processingreport→completed16.647s. Không có timestamp nội bộ Work, nên 117.542s chỉ là “chờ hoạt động đầu tiên từ Work”, không gọi là inference/queue OpenAI, không suy ra p95.

Work chưa có contract được xác minh để Galaxy điều khiển model/reasoning/speed từng job; giữ “Model do ChatGPT Work quản lý”. Không triển khai selector giả để che blocker.

Private receipts, restore manifests, action journals, source proof, Windows measurements và verification: `/home/galaxy_os/.runtime/storage-cleanup-20261014/`. Không ghi token, signing secret hoặc signed URL. Không commit/tag/push/PR.
