# ChatGPT CONNECT_FIRST — S0 và spec chờ review

Checkpoint **WRITTEN_SPEC_REVIEW_PENDING / S1_NOT_IMPLEMENTED**, 08/10/2026. Không phải USER_AUTH_PENDING: callback và main mới chưa sẵn sàng. Owner giao thực thi tại phiên hiện tại; gate review kiến trúc của AGENTS/Superpowers còn thiếu đã trình bằng [spec cụ thể](../../superpowers/specs/2026-10-08-chatgpt-owner-connection-design.md). Không mở lại CAS hoặc recovery.

## USER_REPORTED và VERIFIED_THIS_RUN

USER_REPORTED: CODE_SHA=TESTED_SHA a5e82d8, TESTED_TREE3e04b19; main local-a3eb571a7fcc, runtime/pnpm dev đã phục hồi, UI P04/admin đã lên; full API1400/Web573/Edge5/document1/runtime64, fixture Chrome8/8 và lint/types/format/build đạt. Đây là checkpoint nền từ [handoff trước](2026-10-08-recovery-ui-admin-maintenance.md), không phải full regression chạy lại cho OAuth.

VERIFIED_THIS_RUN:

- Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, bắt đầu HEAD07708c5 sạch; root HEAD1a59665 và untracked figma/prompt giữ. Local spec commit449435a; amendments/handoff chỉ docs. `git diff a5e82d8 -- apps scripts database services package.json pnpm-lock.yaml pnpm-workspace.yaml docker-compose.yml` rỗng; không product code mới, dependency/key/schema/connection hoặc release mutation.
- 05:43:06 UTC: localhost/LAN/Web/API health HTTP200, release local-a3eb571a7fcc khớp; API database connected. Không rerun recovery, manager, daemon, pnpm dev hoặc restart app; pnpm-dev exit0 từ checkpoint trước được giữ dưới USER_REPORTED.
- Windows Chrome154/Win32: own tabs GET `/me` và admin endpoint401, redirect `/login`; screenshot mới là **main login**, không admin accepted. Existing API `http://127.0.0.1:3001/api/v1/ready` từ chính Chrome Windows200/cùng release, chứng minh loopback tới API WSL hiện có; **không chứng minh callback14555**. Cổng14555 read-only ss không có listener. Không login hoặc đổi role/data/session; đóng chỉ hai tab mình tạo, không đóng Chrome/tab owner.
- OpenAI discovery GET `https://auth.openai.com/.well-known/openid-configuration` HTTP200: issuer auth.openai.com, authorize `/api/accounts/authorize`, token `/api/accounts/oauth/token`, JWKS `/.well-known/jwks.json`, revoke `/api/accounts/oauth/revoke`. Chỉ đọc discovery/docs; **authorize/token/models/responses/revoke NOT_STARTED**, chưa provider refusal.
- Fresh focused tests8/8 PASS: existing SIWC codec7 + CHATGPT_PLAN_ONLY gate1, trong1.32s. Đây là contract/unit và mocked-network=0, không OAuth/lifecycle/integration/main/model live. Không full suite/build lại cây product chưa đổi.
- 05:50:06 UTC: metadata từ active config path của current API env xác nhận đủ google_gemini/mistral/kira/openrouter paused:true và CHATGPT_PLAN_ONLY; assert cả4 đạt. Không đọc/in secret hoặc sửa provider config. Reader ban đầu dùng nhầm top-level thay vì providers map cho null; đã đối chiếu readAiConfig và sửa evidence reader, không phải lỗi config main.

Evidence private: `/home/galaxy_os/.runtime/connect-first-20261008/s0/`: `discovery-and-health.json`, `provider-pause.json`, `main-before.json`, `main-session-expired-1440.png`, `main-session-expired-375.png`, `existing-contract-tests.log`, `inspect-main.cjs`. Evidence admin/P04 đã nghiệm thu trước giữ ở `.runtime/recovery-tracker-registry-20261008/main-browser/`, không gán thành ảnh admin fresh ở lượt này.

## S0 — điều kiện nút và thiếu execution

Frontend page.tsx: Connect/Disconnect `disabled` literal, chưa handler; nội dung trạng thái cố định. SettingsService.chatGptConnection trả `canConnect:false`, models[], identitynull và requirements gộp multiuser; POST check chỉ audit local. Controller chưa có begin/cancel/callback/disconnect. ai-registry modelChoices trả[] dưới CHATGPT_PLAN_ONLY, request provider enum chưa chatgpt. ProjectAiService chọn/run/dispatch provider cũ; tools chỉ OpenRouter UNIFIED. ProjectAi UI default OpenRouter/free và filter provider OpenRouter. ai-chatgpt-plan.ts chỉ wire codec, chưa network/lifecycle. **Nguyên nhân code thiếu, trước OAuth; không phải thiếu issued client ID hay refusal nhà cung cấp.**

Route đề xuất: SIWC dynamic cho locally hosted owner pilot, app thật Galaxy OS/private local; không giả OSS/personal. [Official overview](https://developers.openai.com/siwc/token-sharing-open-source) mô tả dynamic registration của local app; [registration guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) dùng dynamic_agent_client và nhận issued ID sau callback, không client secret/partner key. [Cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) nêu selected private apps: chưa có bằng chứng Galaxy được admitted; phải báo provider result thực nếu route từ chối. Không dùng “chưa hồ sơ chấp thuận” hoặc member scope để chặn begin trước provider attempt hợp lệ.

Ba gate tách riêng: begin-auth kiểm Galaxy SYSTEM/session/listener/host; owner inference kiểm actor liên kết + verified registration/identity/token scope/catalog + Project/data/tool ACL; member inference thêm verified provider serving scope, hiện UNCONFIRMED/DISABLED. SYSTEM quản lý không làm mọi SYSTEM thành subscription owner.

Spec còn ghi giới hạn no-paid-credits trước inference: docs cho phép plan hoặc credits, không có flag Responses được công bố để ép plan-only. OAuth/catalog không bị gate này chặn; trước S3 cần owner kiểm app credits limit0/tắt dùng credits ở Usage nếu control có sẵn. Nếu chưa bảo đảm được thì chưa gọi inference, không tự debit để “thử”. Không mua credits hoặc dùng API key.

## Kết quả từng bước hiện tại

| Trường                                                                          | Kết quả                                                                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CODE_SHA / TESTED_SHA                                                           | `a5e82d80129cc698860c501683b844b404c7f33b` — cây product nền, chưa source mới                                                               |
| TESTED_TREE                                                                     | `3e04b19306cece71605018e419ee87caab221922` — full tree ở checkpoint nền                                                                     |
| DEPLOYED_LOCAL_RELEASE                                                          | `local-a3eb571a7fcc`, immutable recovery-tracker-registry-20261008-r1                                                                       |
| API_WEB_RELEASE_MATCH                                                           | VERIFIED_THIS_RUN PASS200 localhost/LAN/API                                                                                                 |
| URLs/menu                                                                       | http://localhost:3000, http://192.168.1.80:3000; Hệ thống → Kết nối ChatGPT `/settings/chatgpt-connection`                                  |
| BUTTON_BEGIN_AUTH                                                               | CODE: DISABLED_LITERAL_AND_CANCONNECT_FALSE; MAIN_THIS_RUN: NO_SESSION401                                                                   |
| HOST_CALLBACK_READY                                                             | NOT_IMPLEMENTED/NOT_PROBED;14555 free; existingAPI3001 loopback PASS riêng                                                                  |
| OAUTH_ATTEMPT_STARTED                                                           | NOT_STARTED, không authorize request                                                                                                        |
| DYNAMIC_REGISTRATION / VERIFIED_IDENTITY / GRANTED_PLAN_SCOPE                   | NOT_REQUESTED / NOT_VERIFIED / NOT_REQUESTED                                                                                                |
| CREDENTIAL_PERSISTENCE / TOKEN_REFRESH / DISCONNECT_REVOKE                      | NOT_IMPLEMENTED, không token stored hoặc remote revoke                                                                                      |
| ACCOUNT_MODEL_CATALOG_LIVE / OWNER_PROJECT_CHAT_LIVE / TASK_LIST_TOOL_LOOP_LIVE | NOT_RUN cả ba; codec hoặc registry không live                                                                                               |
| MEMBER_PROVIDER_SCOPE                                                           | UNCONFIRMED, không kích hoạt dùng chung                                                                                                     |
| MEMBER_INFERENCE_ENFORCEMENT                                                    | Nền plan-only chưa dispatch bất kỳ actor; owner/member split còn phải implement/test                                                        |
| API_KEY_PROVIDERS_PAUSED / NO_FALLBACK                                          | VERIFIED_THIS_RUN active config4paused + policy, fresh unit network gate PASS; không thay                                                   |
| MAIN_UI_VERIFIED                                                                | Previous baseline admin/P04 acceptance giữ; fresh auth GET401/login observed, không fresh admin acceptance                                  |
| USER_ACTION_REQUIRED                                                            | Review written spec đã gửi; chưa yêu cầu OAuth/MFA. Sau spec: viết plan và trình review/chọn INLINE theo workflow, rồi S1 code/test/cutover |

S0 source/docs/root cause DONE; regression chống circular gate chưa viết nên L01 chỉ PARTIAL. S1 BLOCKED_BY_WRITTEN_SPEC_REVIEW, chưa implement. S2 NOT_READY, không gán lỗi cho owner chưa consent khi code chưa sẵn. S3 NOT_RUN. S4 PARTIAL: handoff/memory/evidence hiện có, chưa release mới hoặc live.

## L01–L20 — evidence đúng lớp

PARTIAL không đồng nghĩa PASS. CODE ở bảng này là source trace/readiness hiện có; UNIT là tests chạy mới8, không OAuth mới. INTEGRATION/FIXTURE ghi NOT_RUN ở lượt CONNECT_FIRST; full/Chrome cũ chỉ nằm USER_REPORTED.

| Bài                                        | CODE                      | UNIT                  | INTEGRATION | FIXTURE | MAIN                        | PROVIDER_LIVE |
| ------------------------------------------ | ------------------------- | --------------------- | ----------- | ------- | --------------------------- | ------------- |
| L01 source/circular gate                   | PARTIAL                   | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L02 SYSTEM/member/revoked callback         | PARTIAL                   | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L03 truthful first state/timestamps        | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L04 callback/lifecycle/WSL                 | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | PARTIAL existingAPI only    | NOT_RUN       |
| L05 dynamic OAuth protocol                 | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L06 denied/state/replay/identity/redaction | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L07 identity vs plan scope                 | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L08 durable credential/host/registration   | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L09 refresh/concurrency/fencing            | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L10 account catalog                        | PARTIAL codec             | PASS codec only       | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L11 Project terminal completion            | PARTIAL codec             | PASS codec only       | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L12 task_list round trip                   | PARTIAL local handler     | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L13 Project/source/field isolation         | PARTIAL existing ACL      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L14 member owner-token denial              | FAIL new split missing    | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L15 management vs owner/actor              | PARTIAL admin permissions | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L16 disconnect/revoke/late output          | FAIL                      | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L17 errors/no fallback/fees                | PARTIAL codec/pause       | PASS codec/pause only | NOT_RUN     | NOT_RUN | NOT_RUN                     | NOT_RUN       |
| L18 release/pause/admin/Project            | PARTIAL baseline          | PASS pause only       | NOT_RUN     | NOT_RUN | PARTIAL health/login        | NOT_RUN       |
| L19 owner host vs LAN/mobile               | FAIL new callback         | NOT_RUN               | NOT_RUN     | NOT_RUN | PARTIAL existingAPI Windows | NOT_RUN       |
| L20 admin375/registry/memory               | PARTIAL docs              | NOT_RUN               | NOT_RUN     | NOT_RUN | NOT_RUN newadmin            | NOT_RUN       |

## Bước tiếp theo và review

1. Nhận phản hồi thật cho written spec; không coi elapsed time hoặc duyệt UI/CAS cũ thành duyệt OAuth architecture. Gate từ [AGENTS](/home/galaxy_os/.worktrees/m2-a-20260928/AGENTS.md) “Present a design and obtain explicit user approval” và [brainstorming SKILL](/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/brainstorming/SKILL.md) “the human partner reviews and approves the written spec”.
2. Sau duyệt spec: writing-plans, written plan review/execution INLINE, TDD S1 lifecycle/catalog/dispatcher/UI với reuse Settings/ProjectChatPolicy/codec/TasksService. Không xin lại quyền local commit/release đã có, không mở CAS.
3. Focused/full/artifact browser/correctness/security/authorization/UX/Ponytail reviews; prepare/cutover qua hai app runtime hiện có. Probe listener mới Windows thật trước consent; không fake callback/grant. Fresh main login Galaxy cần khi session đã hết, không gửi password vào chat.
4. S2 chỉ sau main ready: đúng menu/nút OpenAI; owner tự login/MFA/consent. USER_AUTH_PENDING nếu đang chờ bước này; sau đó S3 terminal chat + task_list + reload và đánh dấu riêng từng tool/evidence.

Spec đã tự review phạm vi/caller/credential rotation/session callback và Ponytail full/diff review; không có product diff để claim ship. Chưa code review độc lập của implementation vì chưa implementation. No reset/stash/clean/add-all; không bật4provider hoặc thay public policy. Không dùng hồ sơ partner/approved client ID như blocker generic. **Blocker hiện tại là mandatory written-spec review trước code; bước OAuth còn thiếu code, không provider refusal.**
