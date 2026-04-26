# 로컬 LAN 배포 가이드 — 뉴페이스 창고 관리

## 구조 개요

코드는 GitHub 레포 하나로 관리, 배포 환경만 다르게 운영한다.

```
GitHub (polaris13111-bot/yak-inventory)
│
├── Cloud Run 배포 (GitHub Actions 자동)
│   ├── 이름: 야크 재고관리 / 블랙야크 위탁판매
│   ├── 인증: 로그인 화면 있음 (뷰어/관리자 구분)
│   └── 데이터: Google Cloud Storage (GCS) → yak.db
│
└── 로컬 LAN 배포 (사무실 PC에서 docker compose)
    ├── 이름: 뉴페이스 창고 관리
    ├── 인증: 없음 (항상 관리자 모드)
    └── 데이터: 사무실 PC 하드디스크 → ./data/yak.db
```

---

## 로컬 배포 환경변수

| 변수 | Cloud Run | 로컬 |
|---|---|---|
| `VITE_APP_NAME` | `야크 재고관리` | `뉴페이스 창고 관리` |
| `VITE_APP_SUB` | `블랙야크 위탁판매` | `뉴페이스` |
| `VITE_SKIP_AUTH` | `false` | `true` |
| `DATABASE_URL` | `sqlite:////data/yak.db` (GCS) | `sqlite:////data/yak.db` (로컬 볼륨) |

---

## 로컬 PC 최초 설치

### 1. 사전 준비
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치
- Git 설치

### 2. 코드 받기
```bash
git clone https://github.com/polaris13111-bot/yak-inventory.git
cd yak-inventory
```

### 3. 실행
```bash
docker compose up --build -d
```

브라우저에서 `http://localhost:8000` 접속 → 바로 관리자 화면으로 진입

### 4. 사무실 내 다른 PC에서 접속
이 PC의 IP 주소 확인 (예: `192.168.0.5`):
```bash
ipconfig   # Windows
```
다른 PC 브라우저에서 `http://192.168.0.5:8000` 접속

---

## IP 고정 (공유기 설정)

PC를 껐다 켜도 IP가 바뀌지 않도록 공유기에서 DHCP 고정 설정 필요.

- **ipTIME**: 관리도구 → 고급설정 → 네트워크 관리 → DHCP 서버 설정 → 정적 IP 할당
- **ASUS**: LAN → DHCP 서버 → 수동 할당 목록에 이 PC의 MAC 주소 추가

---

## 코드 업데이트 방법

```bash
git pull
docker compose up --build -d
```

GitHub에 새 기능이 푸시되면 이 명령어 한 번으로 로컬도 업데이트됨.

---

## 데이터 백업

### 방법 1: 앱 내 Excel 내보내기 (권장)
앱 → 백업·복원 → "Excel 내보내기" → 파일 구글 드라이브에 저장

**주 1회 권장.**

### 방법 2: DB 파일 직접 복사
```bash
# yak-inventory 폴더 안의 data/yak.db 파일을 구글 드라이브에 복사
```

---

## 데이터 위치

| 환경 | 저장 위치 |
|---|---|
| Cloud Run | Google Cloud Storage bucket |
| 로컬 | `yak-inventory/data/yak.db` (PC 하드) |

두 환경의 데이터는 완전히 독립적. 공유되지 않음.
