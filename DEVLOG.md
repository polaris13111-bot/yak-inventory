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
  - `/orders/bulk` 단일 트랜잭션으로 등록 (SQLite write lock 충돌 방지)
  - 실패 시 몇 행이 실패했는지 표시 + **다시하기** 버튼

### 입고 관리 (`/inventory`) — 관리자
- 단건/대량 입고 등록
- 최근 50건 내역 표시
- 체크박스로 다중 선택 → **일괄 삭제**
- 연필 아이콘 클릭 → **수량 인라인 수정** (Enter 저장, Esc 취소)

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

### 4. SQLite 동시 쓰기 실패 (1차 → 2차 해결)
**현상**: 대량 등록 40개 중 10개만 성공  
**원인**: `Promise.allSettled`로 40개 동시 HTTP 요청 → SQLite는 한 번에 1개 writer만 허용 → write lock 경쟁  
**1차 해결**: WAL 모드 + busy_timeout 설정 (부분 개선)

**2차 해결 (근본 해결)**: `/orders/bulk` 엔드포인트 신설 → 프론트엔드에서 1개 HTTP 요청으로 전체 처리, 단일 DB 트랜잭션으로 commit 1회

```python
@app.post('/orders/bulk')
def create_orders_bulk(data: list[OrderIn], db: Session = Depends(get_db)):
    for order_data in data:
        db.add(Order(**order_data.model_dump()))
    db.commit()  # 전체를 한 번에 commit
    return {'ok': len(data), 'fail': []}
```

### 5. 콜드스타트 지연
**현상**: 오랜만에 접속 시 로딩이 수십 초  
**원인**: `min-instances=0` (기본값) — 요청이 없으면 컨테이너 종료  
**해결**: `--min-instances=1`로 항상 컨테이너 유지

### 6. 시드 데이터 미적용
**현상**: 배포 후 상품 목록 0개  
**원인**: `with SessionLocal() as db:` 패턴이 SQLAlchemy에서 제대로 동작 안 함  
**해결**: 명시적 `db = SessionLocal()` + try/finally 패턴으로 교체

### 7. 대시보드 로딩 느림 (N+1 쿼리)
**현상**: 대시보드 진입 시 로딩 지연  
**원인**: `/stock/summary`가 제품 N개 × 2쿼리 = 118회 쿼리 (GCS 환경에서 특히 느림)  
**해결**: 집계 쿼리 3회로 교체 → **21배** 개선

```python
# 변경 전: 제품마다 개별 SUM 쿼리
for p in products:
    total_in  = db.query(func.sum(InventoryItem.quantity)).filter(...).scalar()
    total_out = db.query(func.sum(Order.quantity)).filter(...).scalar()

# 변경 후: 전체를 한 번에 집계
inv_map = {r.product_id: r.total for r in
           db.query(InventoryItem.product_id, func.sum(...)).group_by(...).all()}
ord_map = {r.product_id: r.total for r in
           db.query(Order.product_id, func.sum(...)).group_by(...).all()}
```

### 8. bulk 등록 N+1 쿼리
**현상**: 100개 bulk 등록 시 느림  
**원인**: product 존재 여부를 루프 안에서 `db.get(Product, id)` 호출 → N번 쿼리  
**해결**: product ID 전체를 set으로 pre-load → 1회 쿼리 + O(1) set 조회 → **36배** 개선

### 9. API 실패 시 로딩 화면 영구 멈춤
**현상**: 네트워크 오류 시 로딩 스피너가 사라지지 않음  
**원인**: Dashboard, History, StockCalendar, Analytics 4곳 모두 `Promise.all().then().finally()` 패턴에 `.catch()` 없음  
**해결**: `.catch(() => setLoadError(true))` 추가 + 에러 메시지 UI 표시

---

### 10. GCS FUSE stat-cache stale read — bulk 등록 간헐적 실패 (최종 해결)

**현상**: `/orders/bulk` 로 75개 전송 시 27개만 성공, 46개 "제품 없음" 실패. 재시도할수록 조금씩 성공이 늘어남.

**원인 분석**:

SQLite는 DB 파일을 열 때 `fstat()`으로 파일 크기를 확인하고, 그 크기 범위 안의 페이지만 랜덤 접근으로 읽는다.  
GCS FUSE는 파일 메타데이터(크기, mtime)를 일정 시간 **stat-cache**에 캐시하는데, 이 캐시가 stale하면 실제보다 작은 파일 크기를 반환한다.

```
실제 yak.db = 400KB (상품 59개)
GCS FUSE fstat() 캐시 = 200KB (예전 값)
→ SQLite: "200KB까지만 읽겠다"
→ 뒤쪽 페이지에 저장된 상품들 → 읽지 못함
→ db.query(Product).all()이 59개 중 27개만 반환
→ 나머지 32개 product_id → "제품 없음" 처리
```

**재시도할수록 성공이 늘어나는 이유**: 요청마다 GCS FUSE가 일부 페이지를 커널 캐시에 올리고, 캐시가 쌓일수록 stat 불일치 범위가 줄어들어 점점 더 많은 상품을 읽게 됨.

**시도한 임시 조치 (모두 실패)**:
- WAL → DELETE 저널 모드 변경: WAL의 POSIX lock 문제는 해결했지만 stat-cache 문제는 별개
- `db.query(Product).all()` 쿼리 방식 변경: 근본 원인(partial read)은 그대로
- product_id 사전 검증 제거: 증상 우회이며 데이터 무결성 포기

**최종 해결 (`models.py` + `main.py`)**:

```
읽기: GCS FUSE 완전 우회
  → shutil.copy2('/data/yak.db', '/tmp/yak.db') (기동 시 1회)
  → shutil은 순차 EOF 읽기 → fstat() 무시 → 파일 전체 복사 보장
  → 이후 모든 SQLAlchemy 읽기/쓰기는 /tmp (RAM, 신뢰 가능)

쓰기: 영속성 유지
  → POST/PUT/DELETE 완료 후 백그라운드로
  → shutil.copy2('/tmp/yak.db', '/data/yak.db') (GCS FUSE에 동기화)
```

```python
# models.py — 기동 시 /tmp로 복사
if _GCS_DB and os.path.exists(_GCS_DB):
    shutil.copy2(_GCS_DB, _TMP_DB)   # 전체 순차 복사 (stat 우회)
_db_url = f'sqlite:////{_TMP_DB}'    # 이후 SQLAlchemy는 /tmp 사용

# main.py — 쓰기 후 미들웨어로 sync
@app.middleware('http')
async def _gcs_sync_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method in ('POST', 'PUT', 'DELETE'):
        asyncio.create_task(asyncio.to_thread(_sync_db))  # 백그라운드
    return response
```

**핵심 인사이트**: `shutil.copy2`는 `read()` 반환값 0(EOF)으로 복사 완료를 판단하며 `fstat()` 파일 크기를 사용하지 않는다. 따라서 stat-cache가 stale해도 파일 전체가 복사된다. `/tmp`는 RAM 기반이므로 이후 모든 SQLite 읽기에서 partial read가 발생하지 않는다.

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

## API 엔드포인트 전체 목록

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/products` | 전체 제품 목록 |
| POST | `/products` | 제품 등록 |
| PUT | `/products/{id}` | 제품 수정 |
| DELETE | `/products/{id}` | 제품 삭제 |
| GET | `/orders` | 발주 목록 (month/date 필터) |
| POST | `/orders` | 발주 단건 등록 |
| POST | `/orders/bulk` | 발주 대량 등록 (단일 트랜잭션, 최대 500건) |
| PUT | `/orders/{id}` | 발주 수정 |
| DELETE | `/orders/{id}` | 발주 삭제 |
| POST | `/orders/batch-delete` | 발주 다중 삭제 (`DELETE WHERE id IN`) |
| GET | `/inventory` | 입고 목록 |
| POST | `/inventory` | 입고 단건 등록 |
| POST | `/inventory/bulk` | 입고 대량 등록 (단일 트랜잭션, 최대 500건) |
| PUT | `/inventory/{id}` | 입고 수정 |
| DELETE | `/inventory/{id}` | 입고 삭제 |
| GET | `/stock/summary` | 재고 현황 집계 (3쿼리로 N+1 방지) |
| GET | `/stock/daily` | 월별 일자별 출고 집계 |
| GET/POST/PUT/DELETE | `/mapping-rules/...` | 매핑 규칙 CRUD |
| POST | `/mapping-rules/resolve` | 상품명 텍스트 → product_id 자동 해석 |
| POST | `/mapping-rules/seed-defaults` | 기본 매핑 규칙 자동 생성 |

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

## GitHub MCP 설정

Claude Code에서 GitHub Actions 로그를 직접 조회할 수 있도록 MCP 연결.

```bash
claude mcp add github -s user \
  -e GITHUB_PERSONAL_ACCESS_TOKEN=<토큰> \
  -- npx -y @modelcontextprotocol/server-github
```

- 저장소: `polaris13111-bot/yak-inventory`
- 효과: 빌드 실패 시 Actions 로그를 복붙 없이 Claude가 직접 확인

---

*마지막 업데이트: 2026-04-22 (이슈 #10 GCS FUSE stale read 근본 해결)*
