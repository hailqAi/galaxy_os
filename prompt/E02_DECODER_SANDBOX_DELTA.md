# E02 decoder sandbox delta r1 — 2026-10-10

Owner approval “Duyệt hết mọi thiết kế” covers this required functional/security delta. No new approval request or UI redesign. Existing E02 requirements section11 and A24 require file/CLI workers to have private filesystem/network and bounded resources.

Source inspection after R6 freeze found OfficeCLI already runs in bwrap, but pdfinfo/pdftotext/pdftoppm run directly and Sharp decodes in the API process. Earlier matrix wording claiming Sharp sandbox verification is superseded; no exploitation is asserted. R6 frozen functionality receipts remain valid for their exact bytes, not a final A24 verdict.

Smallest repair: reuse installed bwrap/timeout/prlimit and existing Poppler/Sharp. Add one private decoder helper shared by three fixed PDF operations and image validation. Input/output use bounded stdin/stdout; no model script, path, shell, URL or new package. Read-only system libraries/fonts and exact decoder asset/dependency mounts; no home/repo/runtime credential store, writable filesystem or network. Keep MIME/hash/pixel/page/output limits, cancellation, source ACL, version and model/MAX contracts. Use two-worker admission/backpressure and existing jobs, without a second queue; unsupported sandbox fails closed.

Plan: (1) RED tests on existing calls proving decoder invocation lacks isolation; (2) implement fixed-operation helper/callers; (3) actual isolated synthetic secret/network/CPU/RAM/cancel probes and native PDF/image regression; (4) fresh full checks and independent delta review; (5) freeze/verify/app-only release on additive schema91, keep originals and rollback; (6) fresh owner PDF/image/Create proofs and update memory/matrix/STATUS. No heavy parser/build runs alongside the current frozen R6 full10GB acceptance.
