# 야크 재고관리 시스템 — 프로젝트 개요

> 블랙야크 위탁판매(뉴페이스) 전용 재고·발주·입고 관리 웹앱.  
> 다른 에이전트가 검수·기능 추가 시 이 문서를 기준으로 삼으세요.

---

## 목차
1. [기술 스택](#기술-스택)
2. [배포 구조](#배포-구조)
3. [인증 시스템](#인증-시스템)
4. [데이터베이스 스키마](#데이터베이스-스키마)
5. [백엔드 API](#백엔드-api)
6. [프론트엔드 페이지](#프론트엔드-페이지)
7. [핵심 유틸리티](#핵심-유틸리티)
8. [알려진 이슈 및 개선 포인트](#알려진-이슈-및-개선-포인트)
9. [파일 구조](#파일-구조)

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite, Tailwind CSS v4 |
| 백엔드 | FastAPI (Python 3.11), SQLAlchemy, Pydantic v2 |
| DB | SQLite (단일 파일 `yak.db`) |
| 배포 | Google Cloud Run (컨테이너), GCS FUSE (DB 영구 저장) |
| CI/CD | GitHub Actions → Cloud Run 자동 배포 |
| 패키징 | Docker (Dockerfile: frontend 빌드 → FastAPI static serve) |
| 라이브러리 | Fuse.js (퍼지 매칭), xlsx (엑셀 처리), dayjs (날짜), lucide-react (아이콘), python-jose (JWT) |

---

## 배포 구조

```
GitHub main 브랜치 push
  → GitHub Actions (build & deploy)
    → Docker 빌드 (frontend Vite 빌드 + FastAPI)
      → Google Artifact Registry push
        → Cloud Run 배포
          → /data 디렉토리 = GCS FUSE 마운트 (DB 영구 저장)
```

**DB 동기화 방식:**  
Cloud Run의 GCS FUSE는 `fstat()` stat-cache 문제로 SQLite 직접 사용 불가.  
→ 서버 시작 시 `/data/yak.db` → `/tmp/yak.db` 복사 후 `/tmp`에서 작동.  
→ 쓰기(POST/PUT/DELETE) 완료 후 미들웨어가 `/tmp/yak.db` → `/data/yak.db` 동기화.

---

## 인증 시스템

`frontend/src/context/AdminContext.tsx` + `backend/main.py /auth/login`

### JWT 기반 인증 (2026-04 도입)

| 모드 | 비밀번호 | 접근 가능 |
|------|----------|-----------|
| 뷰어 | `blackyak` (env: `VIEWER_PASSWORD`) | 대시보드, 출고현황, 재고, 입고현황, 분석, 피킹 리스트 (읽기 전용) |
| 관리자 | `newface` (env: `ADMIN_PASSWORD`) | 전체 (발주 입력, 입고 관리, 내역 관리, 상품목록, 백업, 피킹 리스트) |

**동작 방식:**
1. 로그인 시 `/auth/login` API 호출 → JWT 액세스 토큰 발급 (24시간 유효)
2. 토큰은 `localStorage`(`yak_token`, `yak_role`)에 저장 → 페이지 새로고침 후에도 유지
3. 모든 API 요청에 `Authorization: Bearer <token>` 헤더 자동 첨부 (axios 인터셉터)
4. 401 응답 시 토큰 자동 삭제 → 로그인 화면으로

**JWT 설정값 (환경변수로 오버라이드 가능):**
```
JWT_SECRET=yak-jwt-secret-2026   # 반드시 프로덕션에서 변경
ADMIN_PASSWORD=newface
VIEWER_PASSWORD=blackyak
```

**엔드포인트별 권한:**
- 인증 불필요: `GET /products`, `POST /mapping-rules/resolve`
- 뷰어 이상: `GET /orders`, `GET /inventory`, `GET /stock/*`
- 관리자만: 모든 쓰기(POST/PUT/DELETE/PATCH) 엔드포인트

환경변수 `VITE_SKIP_AUTH=true`로 인증 건너뜀 (개발용).

---

## 데이터베이스 스키마

### products (상품 SKU)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동 증가 |
| name | STRING | 제품명 (예: "H티아고 자켓") |
| color | STRING | 색상 (예: "블랙") |
| size | STRING | 사이즈 (예: "90", "FREE") |
| model_code | STRING | 모델코드 (예: "8BYABF3902") — 바코드 스캐너 매칭에 사용 |
| active | BOOLEAN | 활성 여부 (비활성 상품은 그리드 입력에서 숨김) |

복합 유니크: `(name, color, size)`

### orders (발주/출고)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| date | STRING | 출고일 **YYYY-MM-DD 형식** (예: "2026-04-17") |
| product_id | FK → products | |
| quantity | INTEGER | 수량 |
| order_date | STRING | 발주일 (YYYY-MM-DD) |
| storage | STRING | 보관창고 (기본값: "뉴페이스") |
| mall | STRING | 판매몰 (스마트스토어, 쿠팡 등) |
| orderer | STRING | 주문자 |
| recipient | STRING | 수령인 |
| phone | STRING | 연락처 |
| address | STRING | 배송주소 |
| memo | STRING | 메모 |
| created_at | DATETIME | 등록시각 |

> **날짜 형식 주의:** 기존 "M.DD" 형식은 앱 시작 시 `_migrate_dates()`가 자동으로 "YYYY-MM-DD"로 변환함.  
> API의 `month` 파라미터는 **"YYYY-MM"** 형식 (예: `?month=2026-04`).

### inventory (입고)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| date | STRING | 입고일 **YYYY-MM-DD 형식** |
| product_id | FK → products | |
| quantity | INTEGER | 수량 |
| type | ENUM | `normal`(정상), `return`(변심반품), `defective`(불량) |
| notes | STRING | 메모 |
| created_at | DATETIME | 등록시각 |

**중요:** `defective` 타입은 재고 계산에서 **제외**됨 (불량품 별도 보관).  
재고 = `normal` + `return` 입고 합계 − 출고 합계

### mapping_rules (상품명 자동 매핑 규칙)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| rule_name | STRING | 규칙 이름 |
| product_id | FK → products | 매핑할 상품 |
| match_type | STRING | `and`(키워드 전부 포함) / `or`(하나라도) |
| keywords | STRING | JSON 배열 문자열 (예: `["티아고","블랙","90"]`) |
| enabled | BOOLEAN | 활성 여부 |
| priority | INTEGER | 우선순위 (높을수록 먼저 검사) |

---

## 백엔드 API

Base URL: `https://<cloud-run-url>` (또는 로컬 `http://localhost:8000`)

### 인증
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/auth/login` | 없음 | `{password}` → `{token, role}` 반환 |

### 상품 `/products`
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/products` | 없음 | 전체 상품 목록 |
| POST | `/products` | 관리자 | 상품 등록 (중복 시 400) |
| PUT | `/products/{id}` | 관리자 | 상품 수정 |
| DELETE | `/products/{id}` | 관리자 | 상품 삭제 |
| PATCH | `/products/{id}/toggle-active` | 관리자 | 활성/비활성 토글 |

### 발주 `/orders`
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/orders?month=2026-04&date=2026-04-17` | 뷰어+ | 발주 목록 (월별/날짜별 필터) |
| POST | `/orders` | 관리자 | 단건 발주 등록 |
| PUT | `/orders/{id}` | 관리자 | 발주 수정 |
| DELETE | `/orders/{id}` | 관리자 | 발주 삭제 |
| POST | `/orders/bulk` | 관리자 | 대량 발주 등록 (최대 500건) |
| POST | `/orders/batch-delete` | 관리자 | 대량 삭제 `{ids: [1,2,3]}` |

### 입고 `/inventory`
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/inventory?month=2026-04` | 뷰어+ | 입고 목록 (월별 필터) |
| POST | `/inventory` | 관리자 | 단건 입고 등록 |
| PUT | `/inventory/{id}` | 관리자 | 입고 수정 |
| DELETE | `/inventory/{id}` | 관리자 | 입고 삭제 |
| POST | `/inventory/bulk` | 관리자 | 대량 입고 등록 (최대 500건) |
| POST | `/inventory/batch-delete` | 관리자 | 대량 삭제 |

### 재고/분석
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/stock/summary?month=2026-04` | 뷰어+ | 재고 요약 (월별이면 해당 월 출고 기준) |
| GET | `/stock/daily?month=2026-04` | 뷰어+ | 날짜별 출고 집계 (출고현황 캘린더용) |

### 매핑 규칙
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/mapping-rules` | 없음 | 전체 규칙 |
| POST | `/mapping-rules` | 관리자 | 규칙 추가 |
| PUT | `/mapping-rules/{id}` | 관리자 | 규칙 수정 |
| DELETE | `/mapping-rules/{id}` | 관리자 | 규칙 삭제 |
| PATCH | `/mapping-rules/{id}/toggle` | 관리자 | 활성/비활성 토글 |
| POST | `/mapping-rules/resolve` | 없음 | 상품명 텍스트 → product_id 자동 해석 |
| POST | `/mapping-rules/seed-defaults` | 관리자 | 기본 규칙 자동 생성 |

### 백업·복원
| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | `/backup/export` | 없음 | 전체 데이터 Excel 내보내기 |
| POST | `/backup/import` | 관리자 | Excel에서 데이터 가져오기 (append/reset 모드) |

---

## 프론트엔드 페이지

모든 페이지는 `frontend/src/pages/` 위치. 모바일 반응형 적용 완료 (Tailwind `md:` 프리픽스).

### Dashboard.tsx — 대시보드
- 금일/금월/전월 출고 요약 카드 (모바일: 2열)
- 오늘 출고 발주 목록 테이블
- 재고 부족/품절 품목 경고 리스트

### StockCalendar.tsx — 출고현황
- **데스크탑**: 날짜×제품 히트맵 테이블 (월별, 수량 기반 색상 강도)
  - 오늘 날짜 열: 헤더 + 데이터셀 파란 배경 강조
  - 날짜 클릭 → 우측 슬라이드 패널에 해당 날짜 발주 목록
  - 키워드 포함/제외 필터 (다중 태그), Excel 다운로드
- **모바일**: 탭 가능한 월별 캘린더 그리드
  - 각 날짜 셀에 일별 출고 합계 표시
  - 탭 → 해당 날짜 발주 목록 인라인 표시
- 날짜 형식: `YYYY-MM-DD` (API 조회 및 `dateStr` 모두 통일)

### StockStatus.tsx — 현재 재고
- SKU별 재고 현황 테이블 (가로 스크롤, 모바일 대응)
- 컬럼: 제품명, 색상, 사이즈, 총입고, 총출고, 현재고, 일평균, 소진예상D-day, 상태
- 재고부족/품절 필터 버튼, 경고기준 슬라이더 (localStorage 저장)
- 검색 필터 (제품명/색상/사이즈)

### InboundStatus.tsx — 입고현황
- 월별 입고 내역 조회
- 요약 카드: 총입고건수, 총입고수량, 변심반품, 불량입고
- 날짜별 그룹화 테이블
- 입고 타입 배지: 정상(파랑), 변심반품(주황), 불량(빨강)

### Analytics.tsx — 판매 분석
- 월별 매출 분석 (recharts 차트)
- 상품별/색상별/사이즈별 판매 분포 (바차트, 라인차트, 도넛차트)
- 이전 월 대비 추이

### OrderInput.tsx — 발주 입력 (관리자 전용)
4가지 입력 모드 (탭 전환):

1. **낱개 입력**: 폼으로 개별 발주 등록
2. **대량 입력**: 스프레드시트 붙여넣기 → 자동 파싱 → 상품 퍼지 매칭
   - 탭 구분(엑셀 복사) + 다중 공백 구분(텍스트) 자동 감지
   - 헤더 행 자동 감지, 발주 스프레드시트 14열 형식 지원
   - 파싱 시 "M.DD" 날짜 자동으로 "YYYY-MM-DD" 변환
3. **그리드 대량 입력**: 제품 매트릭스(이름→색상→사이즈) 그리드에 직접 수량 입력
4. **바코드**: USB 바코드 스캐너 연동 발주
   - 스캔 전용 input에 포커스 → 스캐너 입력 → Enter 시 `model_code` 매칭
   - 매칭 성공 시 수량 +1 (동일 상품 재스캔 시 누적)
   - 스캔 목록에서 수량 조정/삭제 후 일괄 등록

### InventoryManage.tsx — 입고 관리 (관리자 전용)
3가지 입력 모드:
1. **낱개 입력**: 폼으로 개별 입고 등록
2. **텍스트 대량**: 스프레드시트/텍스트 붙여넣기 → 파싱 (M.DD 날짜 자동 변환)
3. **그리드 대량**: 제품 매트릭스 그리드로 수량 일괄 입력

**입고 유형:** 정상(재고 합산) / 변심반품(재고 합산) / 불량(재고 미포함)

### PickingList.tsx — 피킹 리스트 (뷰어/관리자)
- 날짜 선택(전날/다음날 이동) → 해당일 발주 건을 **제품별로 합산**
- 창고 작업자용 출력 최적화 뷰
- **인쇄 시**: 체크박스 열 표시, 불필요한 UI 요소 숨김 (`window.print()`)
- 상세 발주 내역 테이블 (수령인, 연락처, 매출몰 포함)
- 경로: `/picking` — 관리자 사이드바 + 관리자 모바일 탭 2번째 줄에 노출

### History.tsx — 내역 관리 (관리자 전용)
- 발주/입고 전체 내역 탭 전환
- 날짜 범위 필터, 제품명 검색
- 인라인 수정(수량, 유형) + 삭제

### Settings.tsx — 상품목록 (관리자 전용)
- 전체 상품 SKU 목록, 상품 추가/수정/삭제
- 활성/비활성 토글
- 매핑 규칙 관리 (키워드 AND/OR 매핑)

### Backup.tsx — 백업·복원 (관리자 전용)
- Excel 전체 내보내기/가져오기

---

## 핵심 유틸리티

### `frontend/src/utils/matcher.ts` — 상품 매칭 엔진
대량 입력 시 텍스트 상품명 → DB 상품 자동 매칭:
1. **autoMatch()**: 완전 일치 → 모델코드 포함 순으로 즉시 매칭
2. **findCandidates()**: Fuse.js 퍼지 검색
3. **stripNoise()**: 브랜드명, 괄호, 사이즈 레이블 제거
4. **normalizeColors()**: 영문/이형 색상 → 정식 한글 색상명 변환

### `frontend/src/api/index.ts` — API 클라이언트
- 모든 백엔드 통신 함수 정의
- **request 인터셉터**: localStorage에서 토큰 읽어 `Authorization: Bearer` 헤더 자동 첨부
- **response 인터셉터**: 401 응답 시 `yak_token`, `yak_role` 자동 삭제

### `frontend/src/context/AdminContext.tsx` — 인증 상태 관리
- `loginAdmin(pw)` / `loginViewer(pw)`: 비동기, `/auth/login` API 호출 후 JWT 저장
- `logout()`: localStorage 토큰 삭제 + 상태 초기화
- 페이지 로드 시 localStorage에서 role 복원 (새로고침 후 유지)

### `backend/main.py` — 주요 헬퍼
- `_migrate_dates()`: 앱 시작 시 orders/inventory의 "M.DD" 날짜를 "YYYY-MM-DD"로 일괄 변환
- `_sync_db()`: `/tmp/yak.db` → `/data/yak.db` GCS 동기화
- `_create_token()` / `_verify_token()` / `_require_admin()`: JWT 발급/검증/권한 확인

---

## 모바일 네비게이션 구조

**공통 하단 탭 (뷰어/관리자 동일):**
대시보드 | 출고현황 | 재고 | 입고현황 | 분석

**관리자 전용 추가 탭 (2번째 줄, 주황 배경):**
발주 입력 | 입고 관리 | 피킹 | 내역 관리

**데스크탑 사이드바:**
- 뷰어: 5개 조회 페이지
- 관리자: 조회 5개 + 입력 3개(발주/입고/피킹) + 설정·관리 3개

---

## 알려진 이슈 및 개선 포인트

### 바코드 스캐너 — 현황 및 주의사항

바코드 스캔 기능 자체(OrderInput → 바코드 탭)는 구현 완료.  
**단, 동작하려면 상품마다 `model_code`가 등록되어 있어야 함.**

- `model_code` 입력 UI: `Settings.tsx` 상품 추가/수정 폼에 이미 존재 ✅
- 현재 DB 상태: 야크커뮤트 3종(백팩/힙색/슬링백)만 model_code 있음, 의류 상품은 빈값
- **운영 전 필수 작업**: Settings 페이지에서 각 상품 수정 → 모델코드 란에 스캐너로 바코드 찍어 등록

### 기능 부재
- [ ] 재고 부족 임박 시 알림(이메일/카카오) 없음
- [ ] 다중 창고: 현재 "뉴페이스" 단일 창고만 지원
- [ ] 상품 CSV 일괄 등록 기능 없음 (seed_products.json으로만 가능)
- [ ] 매핑 규칙 자동 학습 없음 (수동 등록만)
- [ ] 출고현황 캘린더 모바일: 포함/제외 키워드 필터 미지원

### 성능
- [ ] 전체 상품 목록을 매 페이지마다 fresh fetch (캐싱 없음)
- [ ] 대량 데이터(수백 건) 시 필터/매칭 연산이 메인 스레드에서 실행됨

### DB
- [ ] SQLite 단일 파일 → 동시 접속 많아지면 bottleneck (현재 소규모라 문제 없음)
- [ ] 마이그레이션 시스템 없음 (스키마 변경 시 ALTER TABLE 수동 실행)

### 향후 확장 아이디어 (미구현)
- **전자 가격표(ESL) 연동**: 마트용 전자잉크 가격표(Electronic Shelf Label). Pricer·Hanshow 등 벤더 API 또는 BLE/WiFi 허브를 통해 재고/가격 변동 시 자동 업데이트 가능. 현재 아키텍처에서는 백엔드에 ESL 벤더 webhook 수신 엔드포인트 + 상품별 ESL 기기 ID 매핑 테이블 추가가 필요함. 별도 에이전트 협업 예정.

---

## 파일 구조

```
yak-inventory/
├── backend/
│   ├── main.py              # FastAPI 앱, 모든 API 엔드포인트, JWT 인증
│   ├── models.py            # SQLAlchemy 모델 (Product, Order, InventoryItem, MappingRule)
│   ├── seed_products.json   # 최초 상품 시드 데이터
│   └── requirements.txt     # fastapi, sqlalchemy, uvicorn, openpyxl, python-jose
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 라우터, 레이아웃, 인증 진입점, 모바일 네비
│   │   ├── context/
│   │   │   └── AdminContext.tsx   # JWT 기반 뷰어/관리자 인증 상태 관리
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # 대시보드
│   │   │   ├── StockCalendar.tsx  # 출고현황 (히트맵 + 모바일 캘린더)
│   │   │   ├── StockStatus.tsx    # 현재 재고
│   │   │   ├── InboundStatus.tsx  # 입고현황
│   │   │   ├── Analytics.tsx      # 판매 분석
│   │   │   ├── OrderInput.tsx     # 발주 입력 — 낱개/대량/그리드/바코드 (관리자)
│   │   │   ├── InventoryManage.tsx # 입고 관리 (관리자)
│   │   │   ├── PickingList.tsx    # 피킹 리스트 — 일별 출고 합산, 인쇄용 (뷰어+)
│   │   │   ├── History.tsx        # 내역 관리 (관리자)
│   │   │   ├── Settings.tsx       # 상품목록 + 매핑규칙 (관리자)
│   │   │   └── Backup.tsx         # 백업·복원 (관리자)
│   │   ├── components/
│   │   │   ├── ProductSearch.tsx  # 제품 검색 컴포넌트
│   │   │   └── ProductCascade.tsx # 제품 계단식 선택 (이름→색상→사이즈)
│   │   ├── utils/
│   │   │   ├── matcher.ts         # 퍼지 매칭 엔진 (Fuse.js 기반)
│   │   │   ├── colors.ts          # 색상 HEX 매핑
│   │   │   └── exportXlsx.ts      # Excel 내보내기
│   │   ├── api/index.ts           # API 클라이언트 (axios + JWT 인터셉터)
│   │   └── types/index.ts         # TypeScript 타입 정의
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile               # 단일 컨테이너 (React 빌드 + FastAPI)
├── .github/workflows/       # Cloud Run 자동 배포
└── PROJECT.md               # 이 파일
```

---

## 검수 체크리스트 (다른 에이전트용)

### 인증
- [ ] `ADMIN_PASSWORD`, `VIEWER_PASSWORD`, `JWT_SECRET` 환경변수 Cloud Run에 설정 확인
- [ ] `VITE_SKIP_AUTH` 프로덕션에서 미설정(false) 확인

### 날짜 형식
- [ ] 모든 신규 입력은 `dayjs().format('YYYY-MM-DD')` 사용
- [ ] API `month` 파라미터는 `YYYY-MM` 형식 (`dayjs().format('YYYY-MM')`)
- [ ] 기존 M.DD 데이터는 `_migrate_dates()` 자동 처리 (앱 시작 시 1회)

### 필수 검수
- [ ] `backend/main.py` — `/stock/summary` 재고 계산: `defective` 타입 제외 확인
- [ ] `frontend/src/pages/OrderInput.tsx` — 바코드 모드: `model_code` 없는 상품은 등록 불가
- [ ] `frontend/src/pages/PickingList.tsx` — 인쇄 시 체크박스 열 표시, 불필요 UI 숨김 확인
