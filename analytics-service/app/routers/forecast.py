from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.forecasting import generate_forecast

router = APIRouter()

class ForecastRequest(BaseModel):
    parish_id: int
    start: datetime
    end: datetime
    granularity: str  # 'global' | 'zone' | 'hex'

@router.post("/forecast")
def run_forecast(payload: ForecastRequest, db: Session = Depends(get_db)):
    try:
        result = generate_forecast(db, payload)
        return {"status": "ok", "summary": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
