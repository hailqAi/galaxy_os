# E05 owner handoff r3 — OAuth form and staged cutover

Version: E05-HANDOFF-r3 — 2026-10-12T12:38Z. Source checkpoint: [E05-CP-r3](E05_MCP_WORK_CHECKPOINT.md). Candidate release: `local-53a1fc6912e3`, immutable r4 at `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261012-r4`.

## Verification state

| Area                       | State                   | Evidence                                                                                                                                                                                                              |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate code/config      | LOCAL_VERIFIED          | Frozen r4, full gates and synthetic G00/browser results recorded in CP-r2. OAuth values below are read from candidate code and private config.                                                                        |
| Candidate runtime staging  | LOCAL_VERIFIED          | Stage-r1 Edge drop-in points at r4. Stage-r2 aligns only the runtime schema fingerprint with active R40 after all 97 migration checksums and unresolved count matched. Both remain uninstalled.                       |
| Public endpoint            | PUBLIC_VERIFIED: NO     | Last recorded probe in CP-r2: `/mcp`, protected-resource metadata, and DCR route redirected 307 to login; authorization-server metadata returned 503. A fresh probe this turn could not resolve DNS from the sandbox. |
| OAuth through ChatGPT      | NOT TESTED              | No ChatGPT client registration, callback, token, or Galaxy login has occurred.                                                                                                                                        |
| Events roundtrip           | NOT TESTED with ChatGPT | G00 callback tests are synthetic only.                                                                                                                                                                                |
| ChatGPT artifact roundtrip | NOT TESTED              | G00 validates fixture inputs/outputs, including XLSX; ChatGPT has not supplied an output file.                                                                                                                        |

Do not connect ChatGPT until API/Web are READY on r4 and public discovery/routing returns the expected responses. `LOCAL_VERIFIED` describes candidate source/config and earlier isolated checks. It is not a public endpoint claim.

## ChatGPT custom MCP form values

Candidate configuration has `APP_PUBLIC_ORIGIN=https://os.galaxycentre.vn`. Code advertises authorization-code and refresh-token grants, PKCE `S256`, token endpoint auth `none`, and DCR. It does not advertise CIMD and does not implement OIDC/userinfo. Source: [`mcp.oauth.ts`](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/mcp/mcp.oauth.ts), [`mcp.schemas.ts`](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/mcp/mcp.schemas.ts), [`mcp.controller.ts`](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/mcp/mcp.controller.ts).

All values below are LOCAL_VERIFIED from candidate r4. PUBLIC_VERIFIED remains NO. After the public probes pass, retry discovery; let ChatGPT populate values from discovery wherever it does so.

| ChatGPT field              | Value to choose or enter                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Name                       | `Galaxy OS`                                                                                                                                |
| Description                | `Send authorized Galaxy OS Project Chat jobs to ChatGPT Work and save answers and generated files back to the originating project thread.` |
| Server URL                 | `https://os.galaxycentre.vn/mcp`                                                                                                           |
| Authentication             | `OAuth` (authorization code + PKCE)                                                                                                        |
| Registration method        | `DCR`                                                                                                                                      |
| Client ID                  | Do not enter manually. ChatGPT obtains/reuses it through DCR.                                                                              |
| Client secret              | Do not enter; this is a public client and the token endpoint method is `none`.                                                             |
| Token endpoint auth method | `none`                                                                                                                                     |
| Default scopes             | Leave blank / omit the override. DCR registration returns the server default scope string below.                                           |
| Base scopes                | `galaxy.jobs.read galaxy.jobs.write galaxy.events`                                                                                         |
| Auth URL                   | Discovery value: `https://os.galaxycentre.vn/mcp/oauth/authorize`                                                                          |
| Token URL                  | Discovery value: `https://os.galaxycentre.vn/mcp/oauth/token`                                                                              |
| Registration URL           | If manually requested: `https://os.galaxycentre.vn/mcp/oauth/register`; otherwise leave the override blank because metadata advertises it. |
| Authorization server base  | Discovery issuer: `https://os.galaxycentre.vn`                                                                                             |
| Resource                   | `https://os.galaxycentre.vn/mcp`                                                                                                           |
| OIDC enabled               | Off / `false`                                                                                                                              |
| OIDC configuration URL     | Leave blank; not implemented.                                                                                                              |
| OIDC userinfo endpoint     | Leave blank; not implemented.                                                                                                              |
| OIDC scopes                | Leave blank; not implemented. Do not add `openid`, `email`, or `profile`.                                                                  |

The exact discovery documents are expected at `https://os.galaxycentre.vn/.well-known/oauth-protected-resource/mcp` and `https://os.galaxycentre.vn/.well-known/oauth-authorization-server`. The registration response contains `scope: "galaxy.jobs.read galaxy.jobs.write galaxy.events"`. ChatGPT's OAuth form and DCR behavior are documented by [OpenAI authentication docs](https://developers.openai.com/plugins/build/auth) and the [plugin OAuth field reference](https://developers.openai.com/plugins/build/plugins). DCR is correct for this candidate because its metadata has a `registration_endpoint` and no `client_id_metadata_document_supported` field.

## Prepare API/Web before privileged Edge change

Stage-r1's drop-in was verified to use the r4 Edge build and `EDGE_MCP_UPSTREAM=http://127.0.0.1:3001`. Its candidate runtime manifest had an isolated-G00 structure fingerprint that differed from the current main manifest, despite identical 97 migration checksums. Use corrected stage-r2 only. Stage-r2 changes no source, unit, environment, release artifact, or database; its runtime manifest takes the already-observed schema97 structure fingerprint from the active R40 manifest.

A config-only R40 rollback snapshot is at `/home/galaxy_os/.runtime/e05-mcp-20261012/runtime-rollback-r2`. Log in as `hailq_glx` and run the following as that normal user, not under `sudo`. It stops Web first to prevent new UI jobs, then checks the aggregate count of active ChatAiAnswer jobs. If the query fails or the count is nonzero, it restarts R40 Web and stops. The target unit is byte-identical to the currently installed user target, so only API/Web units are replaced.

```bash
set -eu
pnpm --dir /home/galaxy_os/.worktrees/m2-a-20260928 local:status
systemctl --user stop galaxy-os-web.service
if ! ACTIVE_ANSWERS=$(docker exec galaxy_os-postgres-1 psql -X -U galaxy -d galaxy_os -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"ChatAiAnswer\" WHERE \"status\" IN ('QUEUED','INDEXING','RUNNING')"); then
  systemctl --user start galaxy-os-web.service
  echo "Could not verify active jobs; R40 Web restarted, stop here."
  exit 1
fi
if [ "$ACTIVE_ANSWERS" != "0" ]; then
  systemctl --user start galaxy-os-web.service
  echo "Active ChatAiAnswer jobs remain; R40 Web restarted, stop here."
  exit 1
fi
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-stage-r2/local-runtime.candidate.json /home/galaxy_os/.runtime/local-runtime.json
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-stage-r2/galaxy-os-api.service /home/hailq_glx/.config/systemd/user/galaxy-os-api.service
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-stage-r2/galaxy-os-web.service /home/hailq_glx/.config/systemd/user/galaxy-os-web.service
systemctl --user daemon-reload
systemctl --user reset-failed galaxy-os-api.service galaxy-os-web.service
systemctl --user restart galaxy-os-api.service
systemctl --user restart galaxy-os-web.service
pnpm --dir /home/galaxy_os/.worktrees/m2-a-20260928 local:status
curl -fsS http://127.0.0.1:3001/api/v1/ready
curl -fsS http://127.0.0.1:3000/health
```

Require `local:status READY`, API `releaseId=local-53a1fc6912e3` with `database=connected`, and Web `releaseId=local-53a1fc6912e3` before touching Edge. If any command fails, do not run the Edge block. Restore R40 from the saved config and restart it:

```bash
set -eu
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-rollback-r2/local-runtime.json /home/galaxy_os/.runtime/local-runtime.json
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-rollback-r2/galaxy-os-api.service /home/hailq_glx/.config/systemd/user/galaxy-os-api.service
install -m 0600 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-rollback-r2/galaxy-os-web.service /home/hailq_glx/.config/systemd/user/galaxy-os-web.service
systemctl --user daemon-reload
systemctl --user reset-failed galaxy-os-api.service galaxy-os-web.service
systemctl --user restart galaxy-os-api.service
systemctl --user restart galaxy-os-web.service
pnpm --dir /home/galaxy_os/.worktrees/m2-a-20260928 local:status
```

## Minimal administrator Edge block

Run only after API/Web r4 pass the check above. This backs up the current drop-in before replacing it. It does not run Codex as root and does not touch the database.

```bash
set -eu
sudo install -d -o root -g root -m 0700 /home/galaxy_os/.runtime/e05-mcp-20261012/edge-admin-backup-r1
sudo cp -a /etc/systemd/system/galaxy-edge.service.d/20-runtime-release.conf /home/galaxy_os/.runtime/e05-mcp-20261012/edge-admin-backup-r1/20-runtime-release.conf.before
sudo install -o root -g root -m 0644 /home/galaxy_os/.runtime/e05-mcp-20261012/runtime-stage-r2/galaxy-edge-runtime-release.conf /etc/systemd/system/galaxy-edge.service.d/20-runtime-release.conf
sudo systemctl daemon-reload
sudo systemctl restart galaxy-edge.service
sudo systemctl is-active --quiet galaxy-edge.service
```

If Edge restart or the public checks fail, restore only the old drop-in, then reload and restart Edge:

```bash
set -eu
sudo install -o root -g root -m 0644 /home/galaxy_os/.runtime/e05-mcp-20261012/edge-admin-backup-r1/20-runtime-release.conf.before /etc/systemd/system/galaxy-edge.service.d/20-runtime-release.conf
sudo systemctl daemon-reload
sudo systemctl restart galaxy-edge.service
sudo systemctl is-active --quiet galaxy-edge.service
```

If the API/Web candidate also needs rollback, run the R40 restore block above. Keep schema97 and all data. Do not restore `main-backup-r1` or any pre-migration database dump over the current database.

## Public smoke checks after the commands

These are not passed yet. From a machine that can resolve `os.galaxycentre.vn`, check that metadata is JSON and has the candidate issuer, resource, endpoint URLs, `none`, `S256`, DCR registration, and three scopes. Check unauthenticated `POST /mcp` returns a JSON 401 with a `WWW-Authenticate` resource-metadata challenge, rather than a redirect/login page or 503. Check `POST /mcp/oauth/register` with `{}` returns a JSON 400 before any client row is created. Check `GET /mcp/oauth/authorize` without parameters returns JSON 400. These negative probes only test routing; the actual DCR/client/token/consent path must use ChatGPT.

After public verification passes, use ChatGPT Plugins → Add custom MCP server, enter `https://os.galaxycentre.vn/mcp`, select OAuth and DCR, click **Retry discovery**, then **Create as a plugin**, install it, and sign in to Galaxy when OAuth redirects there. Do not subscribe to Events or claim file roundtrip before this real connection succeeds. The official [plugin quickstart](https://developers.openai.com/plugins/build/app-quickstart) documents this flow.

A business write/read test requires a real authorized Project Chat thread and OAuth identity; none was available in this sandbox. After the connection, create one disposable test job in a test Project, verify its original request and source references through `galaxy_get_job`, submit/read the result back in that exact thread, then remove/cancel the test job using the existing Galaxy action. Only then test actual Events delivery and a ChatGPT-created XLSX through save, download, reopen, and expected cell checks.
