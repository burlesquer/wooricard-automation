#!/usr/bin/env bash
# main 브랜치 보호 규칙 일괄 설정 — gh CLI 필요.
set -euo pipefail

REPO="${REPO:-burlesquer/wooricard-automation}"

echo "▶ Setting up branch protection for main on ${REPO}..."

cat <<'JSON' | gh api -X PUT "repos/${REPO}/branches/main/protection" --input -
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": true
}
JSON

echo ""
echo "✅ main protection done."

if ! gh api "repos/${REPO}/branches/dev" >/dev/null 2>&1; then
  echo "▶ dev branch not found — creating from main..."
  MAIN_SHA=$(gh api "repos/${REPO}/git/refs/heads/main" --jq .object.sha)
  gh api -X POST "repos/${REPO}/git/refs" -f "ref=refs/heads/dev" -f "sha=${MAIN_SHA}"
  echo "✅ dev branch created."
else
  echo "✓ dev branch already exists, skipping creation."
fi

echo ""
echo "📌 다음 작업:"
echo "  1. git fetch && git checkout dev"
echo "  2. (자동) npm install 시 commit.template 활성화"
echo "  3. CONTRIBUTING.md 참조하여 첫 PR 생성"
