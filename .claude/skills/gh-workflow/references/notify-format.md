# Notify Format

main release 직후 Slack DM 으로 변경 내역을 다중 수신자에게 일괄 통보하는 절차.

## 위치 / 의존성

- 발송 스크립트: `.claude/skills/gh-workflow/scripts/notify-release.js`
- 봇 토큰: `config.json` 의 `slackBotToken`
- 수신자 리스트: 우선순위
  1. `config.json.releaseNotifyRecipients` (배열) — admin + 선택된 사용자 IDs
  2. fallback: `config.json.accounts[].slackId` 전부

## 발송 명령

```bash
# 환경변수로 메시지 본문 + 수신자 모두 전달 (권장)
NOTIFY_MESSAGE="$(cat <<'EOF'
... 본문 ...
EOF
)" node .claude/skills/gh-workflow/scripts/notify-release.js
```

옵션 환경변수:
- `NOTIFY_MESSAGE` (필수) — Slack mrkdwn 형식 본문
- `NOTIFY_RECIPIENTS` (선택) — 콤마 구분 user ID 리스트. 지정 시 config 무시.
- `NOTIFY_DRY_RUN=1` (선택) — 본문 + 대상만 출력하고 실제 발송 skip.

## 메시지 템플릿

다음 골격을 채워서 발송한다. `{}` 자리만 변경:

```
🚀 *우리카드 daemon 릴리즈 안내* — `{TAG}`

*[수정 내용]*
{한두 문단으로 무엇이 / 왜 바뀌었는지}

*[변경 영향]*
• {운영/사용자 관점 영향 1}
• {영향 2}
• state schema / cron 스케줄: {변경 여부}

*[적용 시점]*
• Release 직후 (지금부터)
• {다음 cron tick 또는 daemon 재시작 필요 여부}

*[관련 링크]*
• Issue #{N}: https://github.com/burlesquer/wooricard-automation/issues/{N}
• Dev PR #{N}: https://github.com/burlesquer/wooricard-automation/pull/{N}
• Release PR #{N}: https://github.com/burlesquer/wooricard-automation/pull/{N}
• Release tag: https://github.com/burlesquer/wooricard-automation/releases/tag/{TAG}

*[Root cause 요약]*
{왜 발생했는지 한 단락. 코드 위치 백틱 인용 권장}

문의나 이슈 발견 시 회신 부탁드립니다 🙏
```

## 작성 원칙

- **Slack mrkdwn 사용:** `*굵게*`, `` `코드` ``. Markdown 의 `**굵게**` 는 Slack 에서 안 통함.
- **링크는 풀 URL:** Slack 자동 unfurl 활용. `[label](url)` 변환 안 됨.
- **단일 메시지 < 4000 char:** 길면 분할 또는 첨부.
- **수신자별 개인화 X:** 모두 동일 본문. 개인화 필요 시 `for` 루프에서 본문 가공 후 별도 호출.
- **Tone:** 운영팀/사용자 대상이라 한국어 비격식 + 기술 용어 혼용 OK. 너무 캐주얼 X.

## 수신자 정책

`config.json` 에 다음 필드 추가:

```json
{
  "releaseNotifyRecipients": [
    "U05NNK25V7A",
    "U04QC9K14TA"
  ],
  "releaseNotifyIncludeAccounts": true
}
```

- `releaseNotifyRecipients`: admin / 외부 stakeholder 만 명시적으로 등재
- `releaseNotifyIncludeAccounts` (default `true`): account 보유자 (`accounts[].slackId`) 자동 포함 여부
- 두 set 의 union 을 최종 수신자로 사용. 중복 ID 는 dedup.

## 트리거 조건

다음 중 하나 만족 시 8단계 (notify) 실행:
1. 사용자가 명시적으로 "릴리즈 알림" / "DM 발송" / "공지" / "알려줘" / "통보" 요청
2. main PR merge 직후 자동 (단, `[skip notify]` 가 PR body 에 있으면 건너뜀)
3. release tag 발화 후 사용자에게 "DM 보낼까요?" 한 번 물어보고 yes 시 실행

기본 정책: **자동이 아닌 ask-and-confirm**. release 가 hotfix/silent 일 수 있으므로 매번 자동 발송하지 않음.

## Dry run / 검증

발송 전 본문 확인:

```bash
NOTIFY_DRY_RUN=1 NOTIFY_MESSAGE="..." node .claude/skills/gh-workflow/scripts/notify-release.js
```

출력에 수신자 ID 목록 + 본문 첫 200자가 표시됨. OK 면 `NOTIFY_DRY_RUN` 제거 후 재실행.

## Edge cases

| 상황 | 처리 |
|------|------|
| `slackBotToken` 누락 | 즉시 에러 종료. config.json 확인 메시지 |
| 수신자 리스트 0명 | 에러 종료. 추가 안 하고 반환 |
| 일부 user ID 발송 실패 | continue, 마지막에 실패 ID 리스트 출력 + exit code 2 |
| `chat.postMessage` rate limit | 120ms 간격 sleep 으로 회피 (script 내부 처리) |

## 사후 추적

발송 결과 (성공/실패 ID + 본문 first line) 는 stderr 로 출력. 필요 시 `2> notify.log` 로 보관.
