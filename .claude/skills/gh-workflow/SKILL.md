---
name: gh-workflow
description: 우리카드 자동화 프로젝트 GitHub 워크플로우 (.gitmessage / issue templates / PR templates / CODEOWNERS / release.yml) 를 강제하는 가이드. **반드시 이 스킬을 사용해야 하는 요청 키워드:** "커밋해줘" / "commit" / "커밋 메시지" / "이슈 만들어" / "issue 발행" / "버그 리포트" / "기능 요청" / "PR 만들어" / "PR 올려" / "dev 로 PR" / "main 머지" / "main 으로 PR" / "release" / "릴리즈" / "버전 올려" / "tag" / "워크플로우" / "푸시해줘" / "브랜치 만들어". 단순 코드 수정/리팩터/디버그 요청이라도 마지막에 commit/push 가 따라오면 이 스킬을 사용해 .gitmessage 형식 (Conventional Commits + Constraint/Rejected/Confidence/Scope-risk/Directive trailers) 을 강제할 것. dev 는 unprotected, main 은 CODEOWNERS @burlesquer 승인 필수, main push → 자동 release 트리거됨을 항상 인지.
---

# GitHub Workflow Skill

이 프로젝트의 7-step GitHub 워크플로우를 자동화하는 스킬. 사용자가 워크플로우 어느 단계든 요청하면 해당 단계의 reference 를 읽고 실행한다.

## 7-Step Flow

```
1. Issue 발행          → references/issue-format.md
2. Feature 브랜치       → 이 SKILL.md 본문
3. 커밋                → references/commit-format.md
4. dev 브랜치 PR        → references/pr-format.md (dev section)
5. main 브랜치 PR       → references/pr-format.md (main section)
6. CODEOWNERS 승인      → 자동 (burlesquer)
7. Release             → references/release-format.md
```

## 단계별 디스패치

사용자 요청에 따라 적절한 reference 파일을 읽고 실행:

| 요청 키워드 | Read | 실행 |
|------------|------|------|
| "이슈 만들어" / "issue 발행" / "버그 리포트" | `references/issue-format.md` | `gh issue create` |
| "커밋 메시지" / "commit message" | `references/commit-format.md` | 메시지 생성 (실행은 사용자) |
| "PR 만들어" / "dev 로 PR" / "feature 끝남" | `references/pr-format.md` (dev section) | `gh pr create --base dev` |
| "main 으로 머지" / "release PR" | `references/pr-format.md` (main section) | `gh pr create --base main --head dev` |
| "release 해줘" / "tag" / "버전" | `references/release-format.md` | release.yml 트리거 (자동) |

## 핵심 규칙 (모든 단계 공통)

1. **dev 브랜치는 unprotected** — light review, 자유 머지.
2. **main 브랜치는 CODEOWNERS (@burlesquer) 승인 필수** — release-grade.
3. **Conventional Commits** + 커스텀 trailers (Constraint/Rejected/Confidence/Scope-risk/Directive).
4. **브랜치 이름:** `<type>/<issue#>-<slug>` — 예: `feat/12-marker-cleanup`.
5. **모든 변경에 issue 선행** — 예외: 한 줄 typo 수정, 긴급 hotfix (사후 issue 발행).
6. **main push 마다 자동 release** — `.github/workflows/release.yml` 가 처리. 건너뛰려면 커밋 메시지에 `[skip release]`.

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-29 | 초기 구성 | 7-step GitHub 워크플로우 자동화 |
