# 우리카드 법인카드 자동화

우리카드 웹사이트에서 법인카드 이용내역을 자동 수집해 로컬 JSON + xlsx에 기록하고, Slack DM + Gmail로 알림을 보냅니다. Puppeteer 기반 headless Chrome으로 TransKey 가상 키패드까지 자동화.

## 주요 기능

| 기능 | 설명 |
|---|---|
| **이용내역 자동 수집** | 계정 순회 로그인 → 현재월 거래 스크랩 |
| **신규 거래 감지** | 승인번호(`approvalNo`) 기반 diff, 중복 알림 없음 |
| **가맹점 상세 수집** | 각 거래 가맹점명 클릭 → 사업자번호/업종/주소/전화번호 수집 |
| **잔액 롤링** | 월별 이월 자동 (xlsx H열 수식 + 로컬 archive) |
| **Slack DM** | 변동 시 개인 상세 DM, 매일 9시 브리핑 DM |
| **Gmail 개별 알림** | 신규 거래 1건당 메일 1통 (구독 계정만) |
| **월말 캡처** | 매월 1일 09시 전달 이용내역 전체 페이지 PNG → Slack |
| **xlsx 자동 관리** | 매월 1일 00:01 새 월 시트 자동 생성 + H열 수식 갱신 |
| **데이터 보존** | state/captures 각 사용자별 3개월치 유지, 자동 정리 |

## 파일 구조

```
복리후생비/
├── .gitignore
├── README.md
├── package.json
├── config.json              🔒 시크릿 (계정/비번/토큰) — gitignore
├── config.example.json      템플릿
├── 복리후생비.xlsx          원장 (H/I/J/K 수식 포함)
├── wooricard-main.js        오케스트레이션 엔트리
├── daemon.js                스케줄러 (node-cron)
├── state/                   월별 JSON archive (3개월 retention) — gitignore
│   └── {name}/{YYYY-MM}.json
├── captures/                월별 이용내역 PNG (3개월 retention) — gitignore
│   └── {name}/{YYYY-MM}.png
└── lib/
    ├── cdp.js               puppeteer 세션 + DOM 헬퍼
    ├── transkey.js          우리카드 보안키패드 자동 입력
    ├── login.js             로그인 + 팝업 처리
    ├── history.js           이용내역 조회/파싱 + 가맹점 상세 enrich
    ├── state.js             월별 archive R/W + retention
    ├── captures.js          PNG archive R/W + retention
    ├── xlsx.js              exceljs 기반 원장 읽기/쓰기/시트 복제
    ├── slack.js             Slack DM + 파일 업로드
    └── gmail.js             Gmail SMTP (nodemailer) 건별 알림
```

## 요구사항

- Node.js 18+
- Windows / macOS / Linux
- Slack 앱 (Bot Token with `chat:write`, `files:write`, `im:write`)
- Gmail 계정 + 앱 비밀번호 (2단계 인증 필수)

## 설치

```bash
npm install
cp config.example.json config.json
# config.json 실제 값 채우기
```

## 설정 (`config.json`)

```json
{
  "slackBotToken": "xoxb-...",
  "gmail": {
    "user": "your@gmail.com",
    "password": "xxxx xxxx xxxx xxxx"
  },
  "monthlyCredit": 300000,
  "urls": {
    "login": "https://pc.wooricard.com/dcpc/yh2/bp/bmm/bmm01/H2BMM201S01.do",
    "history": "https://pc.wooricard.com/dcpc/yh2/bp/bcv/bcv04/apvhisinq/H2BCV204S01.do"
  },
  "xlsx": {
    "path": "./복리후생비.xlsx",
    "columns": {
      "prevBalance": "H",
      "availableAmount": "I",
      "usage": "J",
      "remainingBalance": "K"
    }
  },
  "accounts": [
    {
      "name": "홍길동",
      "id": "hongid",
      "pw": "우리카드비번",
      "sheetRow": 8,
      "cardSuffix": "1234",
      "slackId": "U...",
      "email": "person@example.com"
    }
  ]
}
```

### 필드 설명

| 필드 | 설명 |
|---|---|
| `slackBotToken` | Slack Bot OAuth Token (`xoxb-...`) |
| `gmail.user` / `gmail.password` | Gmail 계정 + 앱 비밀번호 (2FA 필수) |
| `monthlyCredit` | 월 크레딧 (전원 동일) |
| `xlsx.columns` | 원장의 컬럼 매핑 (레이아웃 변경 시 조정) |
| `accounts[].sheetRow` | 원장에서 해당 사람의 행 번호 |
| `accounts[].slackId` | Slack 사용자 ID (`U...`), 변동 DM 수신 |
| `accounts[].email` | Gmail 수신자 (옵션 — 있는 계정만 이메일 발송) |

## 실행

### 수동 1회

```bash
npm start                  # 현재월 전체 계정 스크랩
npm test                   # 드라이런 (--no-slack --dry-run)
```

### 스케줄러 상시 실행 (권장)

```bash
npm run daemon             # 상시 실행 (PM2 또는 작업 스케줄러로 관리)
npm run daemon:now         # 시작 즉시 1회 실행 후 상시 대기
```

### CLI 플래그

| 플래그 | 용도 |
|---|---|
| `--month 02` | 특정 월 조회 (과거 데이터) |
| `--account burlesquer` | 특정 계정만 실행 |
| `--briefing` | 브리핑 DM 모드 (매일 9시용) |
| `--monthly-capture` | 전달 캡처 모드 (매월 1일 09시용) |
| `--capture-month 2026-04` | monthly-capture 대상월 명시 |
| `--headful` | 브라우저 창 표시 (디버깅) |
| `--no-slack` | Slack 전송 스킵 |
| `--no-gmail` | Gmail 전송 스킵 |
| `--dry-run` | 아카이브/xlsx 쓰기 스킵 |

## 자동 스케줄 (daemon)

| cron | 시각 | 동작 |
|---|---|---|
| `59 * * * *` | 매시간 :59 (9시대/1일 00시대 skip) | hourly — 변동 감지, 조용한 run 기본 |
| `0 9 * * *` | 매일 09:00 | briefing + (1일엔 monthly-capture 선행) |
| `1 0 1 * *` | 매월 1일 00:01 | 새 xlsx 시트 자동 생성 |

### 환경변수 오버라이드

```bash
DAEMON_HOURLY_SCHEDULE="*/10 * * * *" npm run daemon
DAEMON_BRIEFING_SCHEDULE="30 8 * * *" npm run daemon
```

## Slack 알림 조건

| 상황 | DM 유형 |
|---|---|
| 신규 거래 감지 | 📋 변동 상세 DM (본인) |
| 매일 09:00 | ☀️ 브리핑 DM (본인) |
| 매월 1일 09:00 | 📸 전달 캡처 파일 + 메시지 |
| 변동 없음 | 🤫 조용한 run (DM 없음) |

## Gmail 알림

**신규 거래 1건당 메일 1통**. `email` 필드 있는 계정만.

```
Subject: [우리카드 법인] 박성준 04.17 능이감자탕 40,000원

[법인카드]

이름: 박성준
카드: 5532-****-****-2679
일자: 2026.04.17
가맹점: 능이감자탕
금액: 40,000원

가맹점 정보

사업자번호: 1171054948
업종: 일반한식
주소: ...
전화: ...
```

## 사용자 추가

`config.json` 의 `accounts` 배열에 엔트리 추가 + `복리후생비.xlsx` 에 해당 행 준비. **코드 수정 불필요**.

## 데이터 흐름

```
우리카드 웹 → Puppeteer 스크랩 → 로컬 archive JSON (truth source)
                                        ↓
                                   xlsx J열 업데이트
                                        ↓
                              신규 거래 diff (approvalNo)
                                        ↓
                              enrichMerchant (가맹점 상세)
                                        ↓
                              Slack DM + Gmail (건별)
```

## 데이터 보존

- **state/**: 3개월 retention (save 시 자동 cleanup)
- **captures/**: 3개월 retention
- **xlsx**: 전체 히스토리 영구 보존 (사람 검토용)

## 보안 주의사항

- `config.json` 은 `.gitignore` 에 포함 (비밀번호/토큰 포함)
- Gmail 앱 비밀번호는 Google 계정 설정에서 별도 생성 (2FA 필수)
- Slack Bot Token 재발급 시 `config.json` 만 수정

## 트러블슈팅

| 문제 | 해결 |
|---|---|
| `EBUSY: xlsx resource busy` | Excel 에서 `복리후생비.xlsx` 닫고 재실행 |
| 로그인 실패 (비밀번호 오류) | 우리카드 계정 잠금 가능 — 즉시 stop, config.json 비번 확인 |
| `No archive ... no xlsx data` | state 지웠는데 xlsx 도 없을 때 발생 — xlsx H열 수식 확인 |
| Gmail 전송 실패 | 2FA + 앱 비밀번호 확인. 일반 비밀번호 X |
| 새 월 시트 생성 안 됨 | daemon 실행 중인지 확인. 또는 수동 `createMonthSheet` 호출 |

## License

Private project.
