from fastapi import FastAPI

app = FastAPI(title="Galaxy OS Document AI", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "document-ai"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ok"}
