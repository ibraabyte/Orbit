#!/bin/sh
set -e
# Bring the database up to the latest schema before serving. Safe to run on every start.
alembic upgrade head
# Coolify's proxy sits in front and terminates HTTPS, so trust its forwarded headers.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*" --workers "${ORBIT_WORKERS:-1}"
