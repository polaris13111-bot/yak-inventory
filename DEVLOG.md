# 야크 재고관리 시스템 — 개발 로그

> 블랙야크 위탁판매 재고·발주 관리 웹 시스템  
> 운영 URL: https://yak-inventory-pouzjv6waa-du.a.run.app

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| **프론트엔드** | React 19 + TypeScript + Vite + Tailwind CSS |
| **백엔드** | FastAPI + SQLAlchemy + SQLite |
| **인프라** | Google Cloud Run (asia-northeast3, Seoul) |
| **DB 영속성** | GCS 버킷(yak-inventory-data) → Cloud Run 볼륨 마운트 `/data` |
| **CI/CD** | GitHub Actions → Artifact Registry → Cloud Run |
| **인증** | Workload Identity Federation (WIF) — 서비스 계정 키 없이 배포 |
| **차트** | Recharts |

---

## 아키텍처

```
GitHub main push
    → GitHub Actions (WIF 인증)
    → Docker 빌드 (2-stage)
        Stage 1: Node 20 Alpine → React 빌드 (VITE_API_URL="")
        Stage 2: Python 3.11 slim → FastAPI + 정적 파일 서빙
    → Artifact Registry 푸시
    → Cloud Run 배포
        - min-instances=1 (콜드스타트 방지)
        - max-instances=1 (SQLite 동시성 충돌 방지)
        - GCS 볼륨 마운트 → SQLite 데이터 영속
```

### API 연결 방식
- **프로덕션**: `VITE_API_URL=""` → 빈 문자열 → 상대 경로 `/orders`, `/products` 등
- **로컬**: `.env.local`에 `VITE_API_URL=http://localhost:8000`
- 주의: `||` 대신 `??` 사용 (빈 문자열은 falsy라서 `||`이면 localhost로 폴백됨)

---

## 접근 제어

| 모드 | 비밀번호 | 접근 가능 페이지 |
|------|----------|-----------------|
| **뷰어** | `blackyak` | 대시보드, 출고 현황, 판매 분석 |
| **관리자** | `newface` | 전체 (내역 관리, 발주 입력, 입고 관리, 상품목록 포함) |

- 시작 화면에서 모드 선택 후 비밀번호 입력
- 사이드바에서 모드 전환 가능 (관리자 → 뷰어는 버튼, 뷰어 → 관리자는 비밀번호 필요)
- `sessionStorage`로 세션 유지 (탭 닫으면 초기화)

---

## 페이지별 기능

### 대시보드 (`/`)
- 이번 달 재고 현황 요약 카드
- 전체 상품 재고 테이블

### 출고 현황 (`/calendar`)
- 월별 캘린더 그리드 (제품 × 날짜)
- 히트맵 스타일 수량 표시
- 포함/제외 키워드 필터
- 날짜 클릭 → 해당일 발주 상세 슬라이드 패널
- **엑셀 다운로드** 버튼 (현재 필터 상태 그대로 반영)

### 판매 분석 (`/analytics`) — 뷰어 접근 가능
- 요약 카드: 총 출고, 출고 품목수, 1위 제품
- **가로 막대차트**: 제품명 기준 합산 출고량 (다수 SKU → 이름으로 그룹핑)
- **클릭 드릴다운**: 선택 제품의 색상별/사이즈별 도넛 차트
- **라인 차트**: 일별 총 출고 추이
- 월 이동으로 과거 데이터 조회

### 내역 관리 (`/history`) — 관리자
- 월별/일별 탭 전환
- 체크박스 다중 선택 → 일괄 삭제
- 그룹 단위 전체 선택 (indeterminate 상태)

### 발주 입력 (`/order`) — 관리자
- **낱개 입력**: 제품명→색상→사이즈 캐스케이딩 드롭다운
- **대량 입력**:
  - 스프레드시트 붙여넣기 또는 Excel 파일 업로드
  - 헤더 행 자동 감지 및 열 매핑
  - 자동 제품 매칭 (규칙 기반 → fuzzy 매칭)
  - 매칭 실패 시 후보 카드 표시, 직접 검색(캐스케이딩) 토글
  - 매칭 성공 행에 **✕ 수정** 버튼으로 재매칭 가능
  - `Promise.allSettled` 병렬 등록 (40개 기준 순차 대비 ~40배 빠름)
  - 실패 시 몇 행이 실패했는지 표시 + **다시하기** 버튼

### 입고 관리 (`/inventory`) — 관리자
- 단건/대량 입고 등록

### 상품목록 (`/settings`) — 관리자
- 상품 CRUD (이름/색상/사이즈/모델코드)

---

## 주요 해결 이슈

### 1. SQLite 데이터 초기화 문제
**현상**: Cloud Run 재시작 시 데이터 날아감  
**원인**: Cloud Run 컨테이너는 stateless — 파일시스템이 재시작마다 초기화  
**해결**: GCS 버킷을 볼륨으로 마운트 (`/data`), SQLite DB를 `/data/yak.db`에 저장

```yaml
--add-volume=name=db-vol,type=cloud-storage,bucket=yak-inventory-data
--add-volume-mount=volume=db-vol,mount-path=/data
--set-env-vars DATABASE_URL=sqlite:////data/yak.db
```

### 2. 다중 인스턴스 SQLite 충돌
**현상**: 두 컴퓨터에서 보는 데이터가 다름  
**원인**: Cloud Run이 2개 인스턴스를 띄우면 각각 다른 SQLite 파일을 가짐  
**해결**: `--max-instances=1`로 단일 인스턴스 강제

### 3. 프론트엔드가 localhost를 호출하는 버그
**현상**: 배포 후 API 호출이 localhost:8000으로 감  
**원인**: `VITE_API_URL ?? ''`가 아닌 `VITE_API_URL || ''` 사용 — 빈 문자열이 falsy라 localhost로 폴백  
**해결**: `??` (nullish coalescing) 연산자로 변경

### 4. SQLite 동시 쓰기 실패
**현상**: 대량 등록 40개 중 2개 랜덤 실패  
**원인**: `Promise.allSettled`로 동시 요청 → SQLite write lock 충돌  
**해결**: WAL 모드 + busy_timeout 설정

```python
@event.listens_for(ENGINE, 'connect')
def _set_sqlite_pragmas(conn, _):
    cur = conn.cursor()
    cur.execute('PRAGMA journal_mode=WAL')
    cur.execute('PRAGMA busy_timeout=5000')
    cur.close()
```

### 5. 콜드스타트 지연
**현상**: 오랜만에 접속 시 로딩이 수십 초  
**원인**: `min-instances=0` (기본값) — 요청이 없으면 컨테이너 종료  
**해결**: `--min-instances=1`로 항상 컨테이너 유지

### 6. 시드 데이터 미적용
**현상**: 배포 후 상품 목록 0개  
**원인**: `with SessionLocal() as db:` 패턴이 SQLAlchemy에서 제대로 동작 안 함  
**해결**: 명시적 `db = SessionLocal()` + try/finally 패턴으로 교체

---

## 빌드/배포 프로세스

### 로컬 개발
```bash
# 백엔드
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev   # VITE_API_URL=http://localhost:8000 (.env.local)
```

### 배포 (자동)
`main` 브랜치에 push하면 GitHub Actions가 자동으로:
1. GCP 인증 (WIF — 서비스 계정 키 불필요)
2. Docker 빌드 & Artifact Registry 푸시
3. Cloud Run 배포

### 로컬 빌드 검증 (푸시 전 필수)
```bash
cd frontend
npx tsc -b              # TypeScript 체크 (Docker와 동일한 방식)
VITE_API_URL="" npx vite build   # 실제 번들 빌드 테스트
```
> ⚠️ `tsc --noEmit`은 로컬에서 통과해도 Docker의 `tsc -b`에서 실패할 수 있음

---

## 빌드 실패 히스토리 및 원인

| 커밋 | 실패 원인 | 해결 |
|------|-----------|------|
| `9211bf4` 초기 | `npm ci --silent`가 에러 숨김 | `npm install --legacy-peer-deps`로 변경 |
| `ace9802` | TypeScript 에러 (unused import 등) | 에러 수정 |
| `d1f70fe` | Analytics.tsx 다수 TS 에러 | `tsc --noEmit`이 아닌 `tsc -b`로 검증해야 함을 학습 |
| `274e013` | Bar onClick `name: string \| undefined` 타입 | `data.name != null` 가드 추가 |
| `724e3ef` | recharts가 `react-is`를 peer dep으로 필요 | `npm install react-is` 명시 추가 |

**공통 교훈**: Docker는 매번 깨끗한 환경에서 빌드. 로컬 `node_modules`에 이미 있는 패키지가 Docker에선 없을 수 있음.

---

## 환경 변수

| 변수 | 값 | 설명 |
|------|----|------|
| `DATABASE_URL` | `sqlite:////data/yak.db` | Cloud Run 환경 (GCS 마운트) |
| `DATABASE_URL` | `sqlite:///./yak.db` | 로컬 기본값 |
| `VITE_API_URL` | `""` (빈 문자열) | 프로덕션 빌드 시 상대 경로 사용 |
| `VITE_API_URL` | `http://localhost:8000` | 로컬 개발 (.env.local) |

---

## GCP 리소스

| 리소스 | 이름 |
|--------|------|
| 프로젝트 | `blackyak-493519` |
| Cloud Run 서비스 | `yak-inventory` |
| 리전 | `asia-northeast3` (서울) |
| Artifact Registry | `asia-northeast3-docker.pkg.dev/blackyak-493519/yak-inventory/app` |
| GCS 버킷 | `yak-inventory-data` |
| WIF 서비스 계정 | `github-deploy@blackyak-493519.iam.gserviceaccount.com` |

---

*마지막 업데이트: 2026-04-22*
