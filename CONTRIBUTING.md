# Contributing Guide

> 우리카드 자동화 프로젝트 — 단일 contributor (burlesquer) 환경 기준 워크플로우.

## 7-Step Workflow

```
1. Issue 발행 → 2. feature 브랜치 → 3. 커밋 → 4. dev PR → 5. main PR → 6. admin 승인 → 7. Release
```

### 1. Issue 발행
- [Issues 탭](https://github.com/burlesquer/wooricard-automation/issues/new/choose) 에서 템플릿 선택:
  - 🐛 **Bug Report** → 동작 이상
  - ✨ **Feature Request** → 신기능
  - 🧹 **Chore** → 리팩터/문서/CI
- 제목 prefix: `fix:` / `feat:` / `chore:` (커밋 타입과 동일)
- assignee 는 burlesquer 자동 지정

### 2. Feature 브랜치
- **이름 규칙:** `<type>/<issue#>-<slug>` (issue 번호 권장)
- 예시:
  - `feat/12-marker-cleanup`
  - `fix/15-transkey-uppercase`
  - `chore/18-deps-bump`
- 분기 시작점: `dev` (없으면 `main` 에서 분기 + dev 도 같이 만들기)

```bash
git fetch origin
git checkout -b feat/12-marker-cleanup origin/dev
```

### 3. 커밋 메시지 (template)
- 로컬에 `.gitmessage` 활성화:
  ```bash
  git config commit.template .gitmessage
  ```
- Conventional Commits + trailers 사용:
  ```
  <type>(<scope>): <subject>

  <body — WHY 중심>

  Closes #<issue>
  Constraint: ...
  Rejected: ... | reason
  Confidence: high|medium|low
  Scope-risk: narrow|moderate|broad
  ```
- Type: `feat | fix | refactor | chore | docs | test | perf | ci`

### 4. dev 브랜치로 PR
- **dev 는 unprotected** — 자유롭게 머지 가능, 승인 불필요.
- 템플릿: 자동 (default `PULL_REQUEST_TEMPLATE.md`)
- `gh pr create --base dev` 또는 web UI

### 5. main 브랜치로 PR
- **release-grade** — 누적 변경 모아서 한 번에 머지.
- 템플릿: `?template=main.md` 쿼리 추가
- 권장 빈도: 주 1-2회 또는 의미 있는 변경 묶음 단위

```bash
gh pr create --base main --head dev \
  --title "release: v2026.MM.DD" \
  --body "$(cat <<EOF_BODY
... main.md 템플릿 채워서 ...
EOF_BODY
)"
```

### 6. 관리자 승인 (CODEOWNERS)
- main PR 은 `@burlesquer` 의 review approval 필수.
- self-approval 불가 (GitHub 정책).
- → 다른 GitHub 계정으로 approve 하거나, branch protection 에 `Allow specified actors to bypass required pull requests` 설정 필요.

### 7. Release (자동)
- main push → `.github/workflows/release.yml` 자동 trigger
- tag 형식: `v<YYYY.MM.DD>-<NNN>` (당일 N번째 release)
- 직전 tag 이후 커밋 모아서 release notes 자동 생성
- 건너뛰려면 커밋 메시지에 `[skip release]` 포함

## 첫 셋업

리포 첫 사용 시 한 번 실행:

```bash
# 1. 커밋 템플릿 활성화
git config commit.template .gitmessage

# 2. dev 브랜치 생성 (없으면)
git checkout main && git pull
git checkout -b dev && git push -u origin dev

# 3. main 브랜치 보호 규칙 설정 (gh CLI 필요)
bash scripts/setup-branch-protection.sh
```

## Branch Protection 요약

| Branch | Protected | PR 필수 | Code Owner Review | Force Push | Delete |
|--------|-----------|---------|-------------------|------------|--------|
| main   | ✅        | ✅      | ✅ (@burlesquer)  | ❌         | ❌     |
| dev    | ❌        | ❌      | ❌                | ✅         | ❌     |

## 트러블슈팅

- **dev PR 후 main 갈 때 충돌:** `git checkout dev && git rebase main` 으로 main 변경 흡수 후 다시 PR.
- **Release workflow 실패:** Actions 탭에서 로그 확인. tag 충돌이면 수동으로 `git tag -d`.
- **Self-approval 안 됨:** burlesquer 외 다른 계정으로 approve 하거나 bypass 설정.
