#!/usr/bin/env bash
# main 브랜치 보호 규칙 일괄 설정 — gh CLI 필요.
# 사용: bash scripts/setup-branch-protection.sh
#
# 효과:
#   - main: PR 필수, CODEOWNERS 1명 승인 필수, force-push 금지, delete 금지
#   - dev: 보호 없음 (별도 설정 안 함)

set -euo pipefail

REPO="${REPO:-burlesquer/wooricard-automation}"

echo "▶ Setting up branch protection for main on ${REPO}..."

gh api -X PUT "repos/${REPO}/branches/main/protection" \
  --header "Accept: application/vnd.github+json" \
  -f "required_status_checks=" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "required_pull_request_reviews[require_code_owner_reviews]=true" \
  -F "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -F "restrictions=" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false" \
  -F "required_linear_history=false" \
  -F "required_conversation_resolution=true"

echo "✅ main protection done."

# dev 브랜치 생성 (없으면)
if ! gh api "repos/${REPO}/branches/dev" >/dev/null 2>&1; then
  echo "▶ dev branch not found — creating from main..."
  MAIN_SHA=$(gh api "repos/${REPO}/git/refs/heads/main" --jq .object.sha)
  gh api -X POST "repos/${REPO}/git/refs" \
    -f "ref=refs/heads/dev" \
    -f "sha=${MAIN_SHA}"
  echo "✅ dev branch created."
else
  echo "✓ dev branch already exists, skipping creation."
fi

echo ""
echo "📌 다음 작업:"
echo "  1. git fetch && git checkout dev"
echo "  2. git config commit.template .gitmessage"
echo "  3. CONTRIBUTING.md 참조하여 첫 PR 생성"
