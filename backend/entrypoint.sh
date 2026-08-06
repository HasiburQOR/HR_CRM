#!/bin/bash
set -e

echo "Running seed script..."
python seed.py

echo "Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --forwarded-allow-ips "*"