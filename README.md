# 야크 재고 관리 시스템

블랙야크 발주/입고/출고 재고 관리 웹앱

**배포 URL:** https://yak-inventory-pouzjv6waa-du.a.run.app/

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 19 + TypeScript + Vite + Tailwind CSS |
| 백엔드 | FastAPI + SQLAlchemy + SQLite |
| 배포 | Google Cloud Run (asia-northeast3, 서울) |
| CI/CD | GitHub Actions → Artifact Registry → Cloud Run |

---

## 주요 기능

- **발주 입력** — 엑셀 붙여넣기 대량 입력, 퍼지 매칭으로 상품 자동 연결
- **입고 관리** — 발주 기반 입고 처리, 수량 관리
- **출고 현황** — 월별 캘린더 히트맵, 상품별 그룹핑
- **재고 이력** — 발주/입고 전체 이력 조회 및 엑셀 내보내기
- **설정** — 상품 추가/수정/삭제 (관리자 전용)

## 로그인

| 모드 | 비밀번호 |
|------|----------|
| 뷰어 | 없음 |
| 관리자 | `0000` |

---

## 로컬 개발

```bash
# 백엔드
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev
```

---

## 배포 구조

```
GitHub push → main
  └─ GitHub Actions
       ├─ Docker 빌드 (Node 20 → React 빌드 → Python 3.11)
       ├─ Artifact Registry 푸시
       └─ Cloud Run 배포 (자동)
```

### GCP 리소스

| 항목 | 값 |
|------|-----|
| 프로젝트 | blackyak-493519 |
| 리전 | asia-northeast3 (서울) |
| Artifact Registry | yak-inventory |
| Cloud Run 서비스 | yak-inventory |

### GitHub Secrets

| 키 | 설명 |
|----|------|
| `WIF_PROVIDER` | Workload Identity Federation Provider 경로 |
