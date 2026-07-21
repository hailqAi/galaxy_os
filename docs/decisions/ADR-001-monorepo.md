# ADR-001: pnpm monorepo

**Status:** Accepted

Keep web and ERP API in one pnpm workspace so one lockfile and root commands verify the current applications. Do not create empty shared packages; add one only when real code has multiple consumers.
