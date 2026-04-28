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
| 라이브러리 | Fuse.js (퍼지 매칭), xlsx (엑셀 처리), dayjs (날짜), lucide-react (아이콘) |

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

`frontend/src/context/AdminContext.tsx`

두 가지 모드:

| 모드 | 비밀번호 | 접근 가능 |
|------|----------|-----------|
| 뷰어 | `blackyak` | 대시보드, 출고현황, 재고, 입고현황, 분석 (읽기 전용) |
| 관리자 | `newface` | 전체 (발주 입력, 입고 관리, 내역 관리, 상품목록, 백업) |

- 세션 저장: `sessionStorage` (`yak-entered` 키)
- 비밀번호는 `AdminContext.tsx`에 하드코딩 (`ADMIN_PASSWORD`, `VIEWER_PASSWORD`)
- 환경변수 `VITE_SKIP_AUTH=true`로 인증 건너뜀 (개발용)

**개선 포인트:** 비밀번호 서버 검증 없음 (클라이언트 측 비교). 보안 강화가 필요하면 백엔드 인증 엔드포인트 추가 필요.

---

## 데이터베이스 스키마

### products (상품 SKU)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동 증가 |
| name | STRING | 제품명 (예: "H티아고 자켓") |
| color | STRING | 색상 (예: "블랙") |
| size | STRING | 사이즈 (예: "90", "FREE") |
| model_code | STRING | 모델코드 (예: "8BYABF3902") |
| active | BOOLEAN | 활성 여부 (비활성 상품은 그리드 입력에서 숨김) |

복합 유니크: `(name, color, size)`

### orders (발주/출고)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| date | STRING | 출고일 (형식: "M.DD", 예: "4.17") |
| product_id | FK → products | |
| quantity | INTEGER | 수량 |
| order_date | STRING | 발주일 |
| storage | STRING | 보관창고 (기본값: "뉴페이스") |
| mall | STRING | 판매몰 (스마트스토어, 쿠팡 등) |
| orderer | STRING | 주문자 |
| recipient | STRING | 수령인 |
| phone | STRING | 연락처 |
| address | STRING | 배송주소 |
| memo | STRING | 메모 |
| created_at | DATETIME | 등록시각 |

### inventory (입고)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | |
| date | STRING | 입고일 (형식: "M.DD") |
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

### 상품 `/products`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/products` | 전체 상품 목록 (name/color/size 정렬) |
| POST | `/products` | 상품 등록 (중복 시 400) |
| PUT | `/products/{id}` | 상품 수정 |
| DELETE | `/products/{id}` | 상품 삭제 |
| PATCH | `/products/{id}/toggle-active` | 활성/비활성 토글 |

### 발주 `/orders`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/orders?month=4&date=4.17` | 발주 목록 (월별/날짜별 필터) |
| POST | `/orders` | 단건 발주 등록 |
| PUT | `/orders/{id}` | 발주 수정 |
| DELETE | `/orders/{id}` | 발주 삭제 |
| POST | `/orders/bulk` | 대량 발주 등록 (최대 500건) |
| POST | `/orders/batch-delete` | 대량 삭제 `{ids: [1,2,3]}` |

### 입고 `/inventory`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/inventory?month=4` | 입고 목록 (월별 필터) |
| POST | `/inventory` | 단건 입고 등록 |
| PUT | `/inventory/{id}` | 입고 수정 |
| DELETE | `/inventory/{id}` | 입고 삭제 |
| POST | `/inventory/bulk` | 대량 입고 등록 (최대 500건) |
| POST | `/inventory/batch-delete` | 대량 삭제 |

### 재고/분석
| Method | Path | 설명 |
|--------|------|------|
| GET | `/stock/summary?month=4` | 재고 요약 (월별이면 해당 월 출고 기준) |
| GET | `/stock/daily-outbound?month=4` | 날짜별 출고 집계 (출고현황 캘린더용) |
| GET | `/analytics?month=4` | 판매 분석 (월별 통계) |

### 매핑 규칙
| Method | Path | 설명 |
|--------|------|------|
| GET | `/mapping-rules` | 전체 규칙 |
| POST | `/mapping-rules` | 규칙 추가 |
| PUT | `/mapping-rules/{id}` | 규칙 수정 |
| DELETE | `/mapping-rules/{id}` | 규칙 삭제 |

### 백업·복원
| Method | Path | 설명 |
|--------|------|------|
| GET | `/backup/download` | DB 파일 다운로드 |
| POST | `/backup/restore` | DB 파일 업로드 복원 |
| POST | `/backup/excel/export` | 전체 데이터 Excel 내보내기 |
| POST | `/backup/excel/import` | Excel에서 데이터 가져오기 |

---

## 프론트엔드 페이지

모든 페이지는 `frontend/src/pages/` 위치. 모바일 반응형 적용 완료 (Tailwind `md:` 프리픽스).

### Dashboard.tsx — 대시보드
- 금일/금주/이번달 출고 요약 카드 4개 (모바일: 2열)
- 오늘 출고 발주 목록 테이블
- 재고 부족/품절 품목 경고 리스트
- 최근 30일 일별 출고 바차트 (recharts)

### StockCalendar.tsx — 출고현황
- **데스크탑**: 날짜×제품 히트맵 테이블 (월별, 수량 기반 색상 강도)
  - 오늘 날짜 열: 헤더 + 데이터셀 모두 파란 배경 강조
  - 날짜 클릭 → 우측 슬라이드 패널에 해당 날짜 발주 목록
  - 키워드 포함/제외 필터 (다중 태그)
  - Excel 다운로드 기능
- **모바일**: 탭 가능한 월별 캘린더 그리드
  - 각 날짜 셀에 일별 출고 합계 표시
  - 탭 → 해당 날짜 발주 목록 인라인 표시

### StockStatus.tsx — 현재 재고
- SKU별 재고 현황 테이블 (가로 스크롤, 모바일 대응)
- 컬럼: 제품명, 색상, 사이즈, 총입고, 총출고, 현재고, 일평균, 소진예상D-day, 상태
- 재고부족/품절 필터 버튼, 경고기준 슬라이더 (localStorage 저장)
- 검색 필터 (제품명/색상/사이즈)
- 요약 카드: 전체SKU, 총재고, 재고부족, 품절 수

### InboundStatus.tsx — 입고현황
- 월별 입고 내역 조회
- 요약 카드 4개: 총입고건수, 총입고수량, 변심반품, 불량입고
- 날짜별 그룹화 테이블
- 입고 타입 배지: 정상(파랑), 변심반품(주황), 불량(빨강)

### Analytics.tsx — 판매 분석
- 월별 매출 분석 (recharts 차트)
- 상품별/색상별/사이즈별 판매 분포
- 모바일: 1열 세로 레이아웃

### OrderInput.tsx — 발주 입력 (관리자 전용)
3가지 입력 모드:
1. **낱개 입력**: 폼으로 개별 발주 등록
2. **텍스트 대량 입력**: 스프레드시트 붙여넣기 → 자동 파싱 → 상품 퍼지 매칭
3. **그리드 대량 입력**: 제품 매트릭스 (이름→색상→사이즈) 그리드에 직접 수량 입력

**파싱 로직:**
- 탭 구분(엑셀 복사) + 다중 공백 구분(텍스트) 자동 감지
- 헤더 행 자동 감지 (HEADER_MAP 키워드 검사)
- 발주 스프레드시트 14열 형식 지원 (발주일, 상품명, 수량 위치 고정)
- 단순 형식: 상품명 · 수량 · 날짜 · 메모

### InventoryManage.tsx — 입고 관리 (관리자 전용)
3가지 입력 모드:
1. **낱개 입력**: 폼으로 개별 입고 등록
2. **텍스트 대량**: 스프레드시트/텍스트 붙여넣기 → 파싱 (OrderInput과 동일 로직)
3. **그리드 대량**: 제품 매트릭스 그리드로 수량 일괄 입력

**입고 유형 (InvTypeSelector 컴포넌트):**
- 정상 입고: 재고에 합산
- 변심반품 입고: 재고에 합산 (재판매 가능)
- 불량 입고: 재고에 **미포함** (불량품 별도 보관)

최근 50건 입고 내역 표시 (체크박스 선택 → 일괄 삭제, 수량 수정).

### History.tsx — 내역 관리 (관리자 전용)
- 발주/입고 전체 내역 탭 전환
- 날짜 범위 필터, 제품명 검색
- 인라인 수정(수량, 유형) + 삭제
- 입고 유형 배지: 정상(초록), 변심반품(주황), 불량(빨강)

### Settings.tsx — 상품목록 (관리자 전용)
- 전체 상품 SKU 목록 (이름/색상/사이즈 기준 정렬)
- 상품 추가/수정/삭제
- 활성/비활성 토글 (비활성 상품은 그리드 입력에서 숨김)
- 매핑 규칙 관리 (키워드 AND/OR 매핑)

### Backup.tsx — 백업·복원 (관리자 전용)
- DB 파일 직접 다운로드/업로드
- Excel 전체 내보내기/가져오기

---

## 핵심 유틸리티

### `frontend/src/utils/matcher.ts` — 상품 매칭 엔진
대량 입력 시 텍스트 상품명 → DB 상품 자동 매칭:

1. **autoMatch()**: 완전 일치 → 모델코드 포함 순으로 즉시 매칭
2. **findCandidates()**: Fuse.js 퍼지 검색 (제품명을 쿼리, 주문텍스트를 문서로)
3. **stripNoise()**: 브랜드명("블랙야크"), 괄호, 사이즈 레이블 제거
4. **normalizeColors()**: 영문/이형 색상 → 정식 한글 색상명 변환

### `frontend/src/utils/colors.ts` — 색상 HEX 매핑
한글 색상명 → CSS 색상값 변환 (`getColorHex(color: string)`)

### `frontend/src/utils/exportXlsx.ts` — Excel 내보내기 헬퍼

### `frontend/src/api/index.ts` — API 클라이언트
모든 백엔드 통신 함수 정의. Base URL은 `VITE_API_URL` 환경변수.

---

## 모바일 네비게이션 구조

**공통 하단 탭 (뷰어/관리자 동일):**
대시보드 | 출고현황 | 재고 | 입고현황 | 분석 | [모드전환]

**관리자 전용 추가 탭 (2번째 줄, 주황 배경):**
발주 입력 | 입고 관리 | 내역 관리

**데스크탑 사이드바:**
- 뷰어: 5개 조회 페이지
- 관리자: 조회 5개 + 입력 2개 + 설정·관리 3개

---

## 알려진 이슈 및 개선 포인트

### 보안
- [ ] 비밀번호가 클라이언트 코드에 하드코딩됨 → 백엔드 `/auth/login` 엔드포인트로 이전 권장
- [ ] API 엔드포인트에 인증 미들웨어 없음 (URL 알면 누구나 호출 가능)

### 기능 부재
- [ ] 알림/푸시: 재고 부족 임박 시 알림 없음
- [ ] 다중 창고: 현재 "뉴페이스" 단일 창고만 지원
- [ ] 발주서 PDF 출력 기능 없음
- [ ] 상품 CSV 일괄 등록 기능 없음 (현재 seed_products.json으로만 가능)
- [ ] 매핑 규칙 자동 학습 없음 (수동 등록만)

### UX
- [ ] 출고현황 캘린더 모바일: 필터(포함/제외 키워드)가 모바일에서 숨겨짐 → 모바일 검색 추가 필요
- [ ] 대량 입력 파싱 결과에서 매칭 실패 상품 퍼지 매칭 후보가 많을 때 스크롤이 길어짐
- [ ] OrderInput 그리드 모드에서 공통 메모 외 행별 메모 입력 불가

### 성능
- [ ] 전체 상품 목록을 매 페이지마다 fresh fetch (캐싱 없음)
- [ ] 대량 데이터(수백 건) 시 필터/매칭 연산이 메인 스레드에서 실행됨

### DB
- [ ] SQLite 단일 파일 → 동시 접속 많아지면 bottleneck (현재 소규모라 문제 없음)
- [ ] 마이그레이션 시스템 없음 (스키마 변경 시 ALTER TABLE 수동 실행)
- [ ] orders.date가 "M.DD" 문자열이라 연도 구분 불가 (2025년/2026년 데이터 혼재 가능)

---

## 파일 구조

```
yak-inventory/
├── backend/
│   ├── main.py              # FastAPI 앱, 모든 API 엔드포인트
│   ├── models.py            # SQLAlchemy 모델 (Product, Order, InventoryItem, MappingRule)
│   ├── seed_products.json   # 최초 상품 시드 데이터
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 라우터, 레이아웃, 인증 진입점, 모바일 네비
│   │   ├── context/
│   │   │   └── AdminContext.tsx   # 뷰어/관리자 모드 상태 관리
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # 대시보드
│   │   │   ├── StockCalendar.tsx  # 출고현황 (히트맵 + 모바일 캘린더)
│   │   │   ├── StockStatus.tsx    # 현재 재고
│   │   │   ├── InboundStatus.tsx  # 입고현황
│   │   │   ├── Analytics.tsx      # 판매 분석
│   │   │   ├── OrderInput.tsx     # 발주 입력 (관리자)
│   │   │   ├── InventoryManage.tsx # 입고 관리 (관리자)
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
│   │   ├── api/index.ts           # API 클라이언트 함수
│   │   └── types/index.ts         # TypeScript 타입 정의
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile               # 단일 컨테이너 (React 빌드 + FastAPI)
├── .github/workflows/       # Cloud Run 자동 배포
└── PROJECT.md               # 이 파일
```

---

## 검수 체크리스트 (다른 에이전트용)

다음 항목을 확인하고 개선해주세요:

### 필수 검수
- [ ] `backend/main.py` — `/stock/summary` 재고 계산 로직: `defective` 타입 제외 확인
- [ ] `frontend/src/pages/InventoryManage.tsx` — `parsePaste()`: 탭/공백 구분자 자동 감지 동작 확인
- [ ] `frontend/src/App.tsx` — 모바일 하단 탭: 뷰어/관리자 공통 탭 5개 동일 확인
- [ ] `frontend/src/pages/StockCalendar.tsx` — 오늘 날짜 데이터셀 하이라이트, 모바일 캘린더 뷰

### 추가 기능 제안
1. **발주일 연도 처리**: `orders.date`가 "M.DD" 형식이라 연도 경계(12월→1월)에서 오류 가능. YYYY-MM-DD로 마이그레이션 검토
2. **재고 알림**: 특정 임계값 이하 품목에 대한 이메일/카카오 알림
3. **발주 통계**: 몰별(스마트스토어/쿠팡 등) 월별 판매 추이
4. **상품 이미지**: 상품 썸네일 URL 필드 추가
5. **백업 자동화**: GCS에 일별 자동 백업 스케줄링
