# ── 1단계: React 빌드 ─────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# 프론트 + 백엔드가 같은 origin → 상대 경로 사용
RUN VITE_API_URL="" npm run build

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
