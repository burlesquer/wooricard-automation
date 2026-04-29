# Issue Format

## 템플릿 위치
`.github/ISSUE_TEMPLATE/{bug_report,feature_request,chore}.md`

## 발행 명령

### CLI
```bash
# Bug
gh issue create --template bug_report.md \
  --title "fix: <한 줄 요약>" \
  --label bug

# Feature
gh issue create --template feature_request.md \
  --title "feat: <한 줄 요약>" \
  --label enhancement

# Chore
gh issue create --template chore.md \
  --title "chore: <한 줄 요약>" \
  --label chore
```

### Web UI
https://github.com/burlesquer/wooricard-automation/issues/new/choose

## 필수 섹션

### Bug
- 재현 단계, 기대 동작, 실제 동작, 환경, 로그, 영향도

### Feature
- 동기, 수용 기준 (AC), 구현 범위, 범위 제외, 테스트 방안

### Chore
- 목적, 작업 분류 (refactor/deps/docs/CI/...), 위험도

## 작성 원칙

- **제목 prefix 필수:** `fix:` / `feat:` / `chore:` (커밋 type 과 동일)
- **assignee 자동:** `burlesquer`
- **labels 자동:** template 별 (bug/enhancement/chore)
- **AC 는 구체적으로:** "잘 동작" 같은 모호한 기준 금지. 측정 가능한 조건 작성.
