# Release Format

main push → 자동 release. 수동 개입 거의 없음.

## 자동화

`.github/workflows/release.yml` 가 처리:
1. main push 감지
2. tag 계산: `v<YYYY.MM.DD>-<NNN>` (당일 N번째)
3. 직전 tag 이후 커밋 모아서 release notes 자동 생성
4. tag push + GitHub Release 생성

## Tag 형식

```
v2026.04.29-001    # 2026/04/29 첫 번째 release
v2026.04.29-002    # 같은 날 두 번째
v2026.05.01-001    # 다음 release
```

**선택 사유:** 단일 contributor 환경에서 semver 의 major/minor 결정 부담 제거. 날짜 + 카운트로 충분히 시계열 추적 가능.

## Release Notes 형식

```markdown
## Changes since v2026.04.28-003

- fix(transkey): uppercase 후 lowercase 입력 실패 해결 (a51c9ef)
- chore(daemon): briefing marker 30일 retention 추가 (8cf7b1f)
- fix(daemon): 일별 briefing watchdog 추가 (3-layer fallback) (bf79a01)
```

git log oneline 그대로 가져옴. 더 보기 좋게 하고 싶으면 main PR body 의 "Release Notes Preview" 섹션에 작성한 것을 수동으로 release 페이지에 복사 붙여넣기.

## 건너뛰기

특정 커밋이 release 트리거하지 않게 하려면:
```
chore: typo 수정 [skip release]
```

## 수동 release

자동화 실패 시:
```bash
TAG="v$(date +%Y.%m.%d)-001"
git tag "$TAG"
git push origin "$TAG"
gh release create "$TAG" \
  --title "$TAG" \
  --notes "$(git log --pretty=format:'- %s (%h)' v2026.04.28-003..HEAD)"
```

## 이전 tag 확인

```bash
gh release list --limit 10
git tag -l | sort -V | tail -10
```

## Rollback

release 잘못 만들었을 때:
```bash
gh release delete v2026.04.29-002 --cleanup-tag
```
