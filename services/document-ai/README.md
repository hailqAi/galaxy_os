# Document AI placeholder

This FastAPI service is intentionally inactive in the ERP workflow. Sprint 0 exposes only liveness and readiness endpoints; document extraction, OCR, AI, queues, and data models belong to Sprint 14.

Use an isolated environment:

```bash
cd services/document-ai
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/pytest
```

Endpoints: `GET /health` and `GET /ready`.
