from fastapi import FastAPI
from .routers import forecast

app = FastAPI(
    title="CADalytix Analytics Service",
    version="0.1.0",
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(forecast.router, prefix="/ml", tags=["forecast"])
