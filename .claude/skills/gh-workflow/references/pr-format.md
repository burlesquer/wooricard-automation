# PR Format

PR 은 두 종류 — **dev 대상 (light)** 과 **main 대상 (release-grade)**.

## dev 브랜치 PR

### 목적
feature 브랜치 1개의 변경을 dev 에 통합. unprotected → 자유 머지.

### 템플릿
`.github/PULL_REQUEST_TEMPLATE.md` (default) 또는 `?template=dev.md`

### 생성 명령
```bash
gh pr create --base dev \
  --title "feat: <subject>" \
  --body "$(cat <<'EOF_BODY'
## 📌 요약
- ...

## 🔗 Closes
Closes #12

## 🛠 변경 내역
- ...

## 🧪 테스트
- [x] syntax check
- [x] 동작 검증

## ⚠️ 위험도
- Scope: narrow
- Confidence: high
EOF_BODY
)"
```

### 머지 후
- 자동 dev 통합. 보호 없으니 self-merge OK.
- 머지 후 feature 브랜치는 GitHub 가 자동 삭제 권장 (저장소 설정 활성).

---

## main 브랜치 PR (release-grade)

### 목적
dev 의 누적 변경을 main 으로 통합 → 자동 release 트리거.

### 템플릿
`.github/PULL_REQUEST_TEMPLATE/main.md` (URL 에 `?template=main.md`)

### 생성 명령
```bash
# dev 머지된 PR 목록 추출 (지난 release 이후)
LAST_TAG=$(gh release view --json tagName --jq .tagName 2>/dev/null || echo "")
SINCE_DATE=$(git log -1 --format=%aI "${LAST_TAG}" 2>/dev/null | cut -d'T' -f1 || echo "1970-01-01")
gh pr list --base dev --state merged --search "merged:>=${SINCE_DATE}"

# main PR 생성
gh pr create --base main --head dev \
  --title "release: $(date +%Y.%m.%d)" \
  --body "$(cat .github/PULL_REQUEST_TEMPLATE/main.md)"
```

### 필수 섹션 채우기
1. **Release Summary** — 1-3 핵심 변경
2. **Included Changes** — Closes #N 형식으로 모든 머지 PR/이슈
3. **Features / Bug Fixes / Chores** — 분류해서 나열
4. **Breaking Changes** — 있으면 마이그레이션 가이드
5. **Verification** — daemon 24h 운영 + 전체 시나리오 PASS
6. **Impact** — production 영향, 데이터 호환성, 외부 시스템
7. **Rollback** — 문제 시 되돌리는 방법
8. **Release Notes Preview** — 자동 생성될 notes 의 초안

### 승인 (CODEOWNERS)
- `@burlesquer` review approval 필수.
- self-approval 불가 — 다른 계정 사용 또는 bypass 설정.
- branch protection 에 `Require review from Code Owners` 활성.

### 머지 후
- main push → `release.yml` 자동 발화 → tag + GitHub Release 생성.
