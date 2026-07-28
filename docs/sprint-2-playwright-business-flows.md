# Sprint 2 Playwright business flows

Status: `PARTIAL`.

The authentication and user-administration baseline has six passing Chromium
tests. Business-flow coverage for Warehouse receipt/QC, reservation/issue,
transfer, cycle count, installation, inspection/handover, Service Visit,
Warranty Claim/Replacement and the authorization matrix remains required.

Tests must use deterministic local adapters and isolated test data, fail on
page errors, unexpected console errors and HTTP 500 responses, and must not
use skipped tests, forced clicks or arbitrary sleeps.
