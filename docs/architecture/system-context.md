# System context

Staff use the Next.js web application. It calls the versioned NestJS REST API; future mobile clients must use the same API and backend authorization. The API is a modular monolith backed by PostgreSQL. Redis is reserved until a measured cache, queue, or distributed-lock need exists.

The FastAPI document service is an independent future boundary and is not called by the ERP in Sprint 0. See [its boundary](document-ai-boundary.md).
