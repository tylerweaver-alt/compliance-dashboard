from sqlalchemy.orm import Session
from sqlalchemy import text
import pandas as pd
from datetime import timedelta

def generate_forecast(db: Session, payload):
    # 1) Pull historical call timestamps, casting the text column to timestamptz
    rows = db.execute(
        text(
            """
            SELECT response_date_time::timestamptz AS call_ts
            FROM calls
            WHERE parish_id = :parish_id
              AND response_date_time IS NOT NULL
              AND response_date_time::timestamptz >= :start - interval '90 days'
              AND response_date_time::timestamptz < :end
            """
        ),
        {
            "parish_id": payload.parish_id,
            "start": payload.start,
            "end": payload.end,
        },
    ).all()

    if not rows:
        return {"message": "No data"}

    # rows is a list of Row objects -> grab the first (and only) column
    df = pd.DataFrame([r[0] for r in rows], columns=["call_ts"])
    df["bucket"] = df["call_ts"].dt.floor("H")
    series = df.groupby("bucket").size()

    # 2) Naive forecast: mean calls per hour across history
    future_index = pd.date_range(payload.start, payload.end, freq="H")
    forecast = pd.Series(
        [series.mean()] * len(future_index),
        index=future_index,
        name="forecast_calls",
    )

    # 3) Write results into forecast_heatmap
    for bucket, value in forecast.items():
        db.execute(
            text(
                """
                INSERT INTO forecast_heatmap (
                  parish_id,
                  cell_id,
                  bucket_start,
                  bucket_end,
                  forecast_calls,
                  model_version
                )
                VALUES (:parish_id, :cell_id, :start, :end, :calls, :model_version)
                """
            ),
            {
                "parish_id": payload.parish_id,
                "cell_id": "global",
                "start": bucket.to_pydatetime(),
                "end": (bucket + timedelta(hours=1)).to_pydatetime(),
                "calls": float(value),
                "model_version": "naive_v0",
            },
        )

    db.commit()

    return {
        "rows_written": len(forecast),
        "model_version": "naive_v0",
    }
