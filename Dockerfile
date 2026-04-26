# ── 1단계: React 빌드 ─────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .

ARG VITE_APP_NAME="야크 재고관리"
ARG VITE_APP_SUB="블랙야크 위탁판매"
ARG VITE_SKIP_AUTH="false"

RUN VITE_API_URL="" \
    VITE_APP_NAME="$VITE_APP_NAME" \
    VITE_APP_SUB="$VITE_APP_SUB" \
    VITE_SKIP_AUTH="$VITE_SKIP_AUTH" \
    npm run build

# ── 2단계: FastAPI 서버 ───────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# React 빌드 결과 → static/ 폴더로 복사
COPY --from=frontend-build /frontend/dist ./static

# SQLite DB 디렉토리 (Cloud Run GCS 볼륨 마운트 위치)
RUN mkdir -p /data

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
