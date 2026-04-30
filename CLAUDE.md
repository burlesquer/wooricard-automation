# CLAUDE.md — wooricard-automation 프로젝트 지침

> 이 파일은 새 Claude Code 세션마다 자동 로드된다. 하네스 포인터 + 변경 이력만 담는다.

---

## 하네스: GitHub Workflow

**목표:** 7-step GitHub 워크플로우 (issue → branch → commit → dev PR → main PR → admin approval → release) 를 일관되게 자동화.

**트리거:** issue/branch/commit/PR/release 관련 요청 시 `gh-workflow` 스킬을 사용하라.
- 키워드 예: "이슈 만들어", "커밋 메시지", "PR 만들어 (dev/main)", "release", "main 으로 머지"
- 단순 질문 (예: "현재 브랜치 뭐야?") 은 직접 응답.

**주요 규칙:**
- Conventional Commits + custom trailers (Constraint/Rejected/Confidence/Scope-risk/Directive)
- 브랜치 이름: `<type>/<issue#>-<slug>` (예: `feat/12-marker-cleanup`)
- dev = unprotected (light review), main = CODEOWNERS @burlesquer 승인 필수
- main push → 자동 release tag (`v<YYYY.MM.DD>-<NNN>`)
- 자세한 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-29 | 초기 구성 | 전체 (.github/, .claude/skills/gh-workflow/, .claude/agents/, CONTRIBUTING.md, scripts/setup-branch-protection.sh) | 7-step GitHub 워크플로우 자동화 |
| 2026-04-30 | step 8 (Slack release notify) 추가 | .claude/skills/gh-workflow/{references/notify-format.md, scripts/notify-release.js, SKILL.md} | release 직후 변경 내역을 다중 사용자에게 일괄 DM 공지하는 절차를 공식화 (ad-hoc 인라인 호출 → 재사용 스크립트) |

---

## 첫 셋업 (한 번만)

```bash
git config commit.template .gitmessage         # 로컬 커밋 템플릿
git checkout -b dev && git push -u origin dev  # dev 브랜치 (없으면)
bash scripts/setup-branch-protection.sh        # main 보호 규칙
```

자세한 워크플로우는 [CONTRIBUTING.md](./CONTRIBUTING.md) 참조.
