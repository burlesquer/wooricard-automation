# Commit Format

## 템플릿
`.gitmessage` (프로젝트 루트)

## 활성화
```bash
git config commit.template .gitmessage
```

## 구조

```
<type>(<scope>): <subject>          # 50자 이내, 마침표 X

<body — WHY 중심, 72자 줄바꿈>

Closes #<issue>
Constraint: <이 결정을 강제한 제약>
Rejected: <대안> | <기각 이유>
Confidence: high | medium | low
Scope-risk: narrow | moderate | broad
Directive: <이 코드 수정자에게 남기는 경고>
Not-tested: <테스트 안 한 엣지 케이스>
```

## Type

| Type | 의미 |
|------|------|
| `feat` | 신기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 동일, 구조만 |
| `chore` | 잡일 (deps, tooling, .gitignore) |
| `docs` | 문서만 |
| `test` | 테스트만 |
| `perf` | 성능 개선 |
| `ci` | CI/CD 변경 |

## Scope (선택)

`daemon`, `history`, `transkey`, `login`, `slack`, `gmail`, `sheet`, `xlsx`, `cdp`, `state`, `captures`, `github`, `readme` ...

## Trailer 사용 가이드

- **Constraint/Rejected/Confidence/Scope-risk/Directive/Not-tested** 는 trivial commit (typo, formatting) 에서는 생략.
- 의사결정이 있는 commit 에서는 최소 `Confidence:` + `Scope-risk:` 필수.
- breaking change 면 body 에 `BREAKING CHANGE:` prefix 도 포함.

## 작성 원칙

- subject: WHAT (간결한 동작 요약)
- body: WHY (왜 필요했는지, 어떤 제약을 고려했는지)
- 코드를 읽으면 알 수 있는 HOW 는 적지 않는다
- Co-Authored-By 자동 추가는 비활성 (~/.claude/settings.json 에서 처리)

## 예시

```
fix(transkey): uppercase 후 lowercase 입력 실패 해결

tk.cap() 이 keyType 만 바꾸고 DOM 안 바꾸는 것 확인 (probe 검증).
sticky upper 상태에서 lowercase 입력 시 DOM 라벨이 '대문자q' 형태라
못 찾아 실패하던 문제. live DOM scan 으로 shift 키 클릭하여 toggle off.

Closes #12
Constraint: TransKey 외부 tk.cap() 호출은 DOM 갱신 안 함
Rejected: tk.cap() 3회 retry | DOM 안 바뀜
Confidence: high
Scope-risk: narrow
Directive: cached keys 배열 절대 shift 검색에 사용 금지
```
