<!--
PR 대상: main 브랜치 (release-grade, CODEOWNERS 승인 필수)
사용: https://github.com/burlesquer/wooricard-automation/compare/main...dev?template=main.md
-->

## 🚀 Release Summary
<!-- 이번 release 의 핵심 변경 사항 1-3 bullet -->
- 
- 
- 

## 📦 Included Changes (Closed Issues / PRs)
<!-- dev 머지된 모든 작업 나열. `gh pr list --base dev --state merged --search "merged:>=YYYY-MM-DD"` 로 추출 -->
- Closes #
- Closes #
- Refs #

## ✨ Features (신규 기능)
- 

## 🐛 Bug Fixes (버그 수정)
- 

## 🧹 Chores (리팩터/문서/CI)
- 

## ⚠️ Breaking Changes (호환성 깨짐)
- [ ] 없음
- [ ] 있음 → 영향 범위:
- [ ] 마이그레이션 필요 → 가이드:

## 🧪 검증 (Verification)
- [ ] dev 에서 daemon 24시간 무중단 운영 확인
- [ ] hourly / briefing / sheet-create cron 모두 정상 fire
- [ ] 5명 계정 로그인 + history 추출 PASS
- [ ] xlsx 출력 검증
- [ ] Slack DM 검증

## 📊 영향도 (Impact)
- Production daemon: <!-- 즉시 영향 / 다음 재시작 시 / 영향 없음 -->
- 데이터 호환성: <!-- 기존 state/json 그대로 사용 가능? -->
- 외부 시스템: <!-- Slack/Sheet/Gmail 영향 -->

## 🔄 Rollback 계획
<!-- 문제 발생 시 어떻게 되돌리는가? -->
- 

## 📸 Release Notes Preview
<!-- main push 후 자동 생성될 release notes 의 초안. 수정하고 싶으면 여기서 확정 -->
```
v2026.MM.DD-N
- ✨ ...
- 🐛 ...
```

## 👤 Approval
<!-- main 브랜치는 CODEOWNERS (@burlesquer) 승인 필수. self-merge 불가 -->
- [ ] @burlesquer 리뷰 완료
