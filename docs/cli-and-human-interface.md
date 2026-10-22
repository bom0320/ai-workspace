# CLI and Human Interface

이 문서는 사람이 현재 Development Governance Harness를 어떻게 관찰하고 조작하는지 설명한다.
실행 준비·TaskContract 예시·artifact 사용법은 [README](../README.md), 내부 책임 경계는
[Architecture](architecture.md), 미래 단계는 [Roadmap](roadmap.md)에 둔다.

## 1. CLI의 역할

> CLI is an operator/debug interface for the Harness, not the core product value.

CLI는 workflow 선택, Goal / 명시적 Context 입력, TaskContract / Decision / Comparison 표시, Approval, Review, Apply / Commit / Push,
Cleanup decision, telemetry / result 출력을 담당한다. Harness를 사람이 관찰하고 통제하는
operator/debug adapter이자 Human decision surface다. 전체 AI 조직의 orchestration과
Planning / Execution / Governance의 core logic은 application / Harness와 Workflow Runtime의 책임이며
CLI는 해당 책임을 소유하는 상위 계층이 아니다.
현재 Human gate와 후속 stage 연결은 CLI가 담당하고, 계약·실행·Git 안전 검사는 각 모듈에 남긴다.

```text
pnpm dev → src/cli/cli.ts → application use-case 호출
```

Human Interface는 웹 UI에 한정되지 않는다. 사람이 입력·판단·결과 확인을 하는 접점이며
현재는 terminal-based CLI다. `cli.ts`는 프로그램 entry이고 Human UI는 그 실행 중의 상호작용이다.
Fancy TUI나 Web UI 자체가 현재 프로젝트의 핵심 가치는 아니다.

## 2. 실행 경로

`pnpm dev`는 개발 서버라는 고정 의미가 아니라 package.json의 script를 실행한다.
현재 script는 `TSX_TSCONFIG_PATH=./tsconfig.json tsx src/cli/cli.ts`다.

```sh
# 인자 없음: workflow 선택 메뉴
pnpm dev

# selector 없이 direct Plan & Execute
pnpm dev . "README.md의 소개 문구를 더 명확하게 수정해줘"

# Planning only
pnpm plan . "README.md의 소개 문구를 더 명확하게 수정해줘"

# 독립 Decision → Structured Comparison, 명시적 Context files
pnpm decision . "Evaluate the current decision architecture" \
  src/application/decision/flow/run-decision.ts \
  src/application/decision/model/authority.ts

# 기존 TaskContract JSON Execution
pnpm dev execute tasks/example.json .
```

### Interactive entry

Selector는 `args.length === 0`일 때만 표시된다. 명시적 command와 direct Goal 인자는 메뉴를 거치지 않는다.

```text
AI Workspace

Select workflow:

1. Plan & Execute
2. Plan only
3. Decision
4. Execute existing task

>
```

숫자 1–4를 받으며 다른 입력은 `Please enter 1, 2, 3, or 4.`를 출력하고 재시도한다.
유효한 선택 전 EOF는 오류와 exit 1이다. 선택별 입력과 실행은 다음과 같다.

| 선택 | 입력 | 실행 / Human 접점 |
| --- | --- | --- |
| Plan & Execute | Repository → Goal | Planning → TaskContract → Task Approval → Execution → Review / Delivery / Cleanup |
| Plan only | Repository → Goal | Planning과 TaskContract 표시 후 종료. Approval / Execution 없음 |
| Decision | Repository → Decision Goal → Context Files | 독립 Decision → Structured Comparison → 두 결과 표시. Action governance gate 없음 |
| Execute existing task | Task path → Repository | 기존 JSON loader와 Execution → Review / Delivery / Cleanup. Planning / Task Approval 없음 |

Plan 두 경로는 같은 `askGoal()`을 사용하고 title은 selector만 출력한다. Interactive 입력은 trim하며
빈 Repository / Goal / Task path를 다시 묻는다. 필요한 값이 끝나기 전 EOF는 해당 prompt의 명확한 오류다.
명시적 argument의 빈 Repository / objective도 거부하지만 입력 값을 interactive하게 다시 묻지는 않는다.

Goal 기반 흐름은 Planning 실패나 Task Reject 시 Execution을 시작하지 않는다.
PlanningResult.task는 파일 저장·재로딩 없이 메모리에서 Execution에 전달한다.
`execute`는 task path / repository path 순서로 기존 TaskContract JSON을 읽으며 새 format은 없다.

## 3. 현재 Human Interaction Flow

### Goal-based Action Governance

```text
Goal
→ Planning
→ TaskContract 표시
→ Approve / Reject
→ Execution in isolated worktree
→ Scope / Verification / Evidence preservation
→ Review 자동 출력
→ Continue / Abort
→ Apply / Skip
→ Commit / Skip → Commit message
→ Push / Skip
→ Delete / Keep
```

이 도식은 성공 경로다. 각 단계의 Skip·실패·승인은 다음 단계 실행 조건과 구분한다.

| Human gate | 진행 조건 / 선택의 의미 |
| --- | --- |
| Task Approval | Approve만 Worker 실행 허가. Reject·다른 입력·EOF는 실행하지 않음 |
| Review | 항상 workspace·changed paths·diff·patch 위치·존재하는 Worker Result 표시. Continue만 Delivery 진행 허가 |
| Apply | Review Continue 및 Execution·Verification 성공, patch 보존 확인 후 표시. Apply만 원본 반영 |
| Commit | Apply 성공 후 표시. Commit 선택 시 메시지 입력·검증. Skip은 working tree 변경 유지 |
| Push | Commit 성공 후 표시. Push 선택 시 기존 upstream에만 전달. Skip·실패는 local commit 유지 |
| Cleanup | Review Abort·Delivery Skip/실패 후에도 별도 결정. Delete는 workspace만 제거, Keep·다른 입력·EOF는 유지 |

승인 입력은 공백·대소문자를 정리한 지정 단어만 인정한다. Commit message는 자동 보정하지
않으며 허용된 Conventional Commit 형태를 충족해야 한다. 자세한 Delivery 안전 조건과
메시지 예시는 [README](../README.md#review와-post-execution-delivery)를 따른다.

이 문서와 CLI의 `Review`는 Change Review를 뜻한다. “Review할지”를 묻는 선택 단계가 아니다. Execution 종료 후 workspace가 살아 있는
상태에서 diff를 자동 출력하고, 확인 완료 여부만 Continue / Abort로 받는다. Diff 출력은 64KiB,
Worker output은 16KiB로 제한한다. 전체 변경은 표시된 workspace나 patch artifact에서 확인한다.
Review에 필요한 workspace / base commit이 없거나 diff 조회에 실패하면 Delivery를 차단한다.
실패한 Execution도 사용 가능한 workspace를 Review할 수 있지만 원본 적용은 허용하지 않는다.

Review Abort, Apply·Commit·Push Skip/실패, Cleanup Keep/실패는 이미 성공한 Execution을
실패로 바꾸지 않는다. Cleanup 실패 시 경로를 출력하고 artifact는 삭제하지 않는다.
현재 result.json은 Execution snapshot이며 후속 Human 결정 이력 저장소는 아니다.

### Decision flow

```text
Repository:
> .

Decision Goal:
> Evaluate the current decision architecture

Context Files
Enter one repository-relative file path per line.
Submit an empty line when finished.

> src/application/decision/flow/run-decision.ts
> src/application/decision/model/authority.ts
>
```

Context files는 한 줄에 한 경로, 최소 1개가 필요하다. 파일 0개에서 빈 줄을 입력하면
`At least one context file is required.`를 출력하고 계속 입력받는다. 하나 이상 입력 후 빈 줄로 제출한다.
파일 목록 순서는 유지하며 path 검증은 prompt가 아닌 application에서 수행한다.

대상은 commit이 있는 clean Git Repository여야 한다. 수정·staged·untracked 변경은 capture를 막는다.
기존 Git clean 기준이므로 ignored 파일 전체 검사나 완전한 sandbox를 뜻하지 않는다.
명시적 파일은 repository-relative text path여야 하며 빈 path / absolute path / `..` traversal은 거부한다.
존재하지 않는 파일, directory, binary / invalid UTF-8 입력도 실패한다. 파일은 Snapshot commit에서 읽으며
전체 Repository를 자동 조사하거나 역할별로 파일을 자동 선택하지 않는다.

```text
Decision...
Snapshot: <commitSha>
Specialists: 2

[Frontend Specialist]
Recommendation / Evidence / Risks / Uncertainty

[UX Specialist]
Recommendation / Evidence / Risks / Uncertainty

Comparison

Findings:

[agreement] <concern>
- frontend: <statement>
- ux: <statement>
Rationale: <rationale>

Gaps:

[uncertainty] <concern>
Specialists: frontend, ux
Reason: <reason>

Decision Duration: X.Xs
```

두 Specialist는 독립적으로 순차 실행한다. CLI command는 `runDecision()` 결과의 동일 Goal 객체 /
Snapshot commit SHA / 원본 AgentDecision[]을 `compareDecisions()`에 전달한다.
Comparison은 기존 Decision의 Concern별 관계를 구조화하며 Specialist를 다시 실행하지 않는다.
CLI는 두 application이 모두 성공한 뒤 Snapshot / Decisions / Comparison을 표시하므로 실행 중에는
`Decision...`만 보일 수 있다. Evidence path와 optional line range를 표시하며 비어 있는 목록은
`- (none)`을 표시한다.

Comparison presenter는 Findings의 concern / relation / Position별 specialistId와 statement /
rationale, Gaps의 concern / kind / specialistIds / reason을 표시한다.
Findings와 Gaps가 모두 비면 `Comparison: no material relationships found.`를 출력한다.
비교 결과를 winner / final recommendation으로 합성하거나 자동 해결하지 않는다.

성공은 exit 0이다. Snapshot drift, Codex timeout/process 실패, JSON/schema 오류, Evidence invariant /
Comparison reference 위반은 `Error: ...`와 exit 1이며 partial Decision / Comparison을 표시하지 않는다.
Specialist는 각 15분, Comparator는 15분이 기본 timeout이며 현재 CLI의 별도 override 입력은 없다.
Decision Duration은 두 Specialist와 Comparison 실행·표시를 포함하고 interactive input 대기는 제외한다.
결과와 Human governance outcome은 저장하지 않으며 Task Approval / Review / Apply / Commit / Push /
Cleanup을 진행하지 않는다.

v2의 단일 실제 Codex 실행 기록과 v3의 fake Codex automated wiring / isolation 검증은
[README](../README.md#v2-실제-e2e-기록)에서 구분한다. Reference 검증은 모델의 relation /
rationale / statement 정확성 평가가 아니다.

## 4. 현재 CLI 파일 책임

테스트는 구현 파일과 함께 배치한다. 아래에서는 테스트와 feature local index.ts를 생략한다.

```text
src/cli/
├─ cli.ts
├─ commands/
│  ├─ plan/
│  │  └─ plan.ts
│  ├─ decision/
│  │  └─ decision.ts
│  ├─ execute/
│  │  └─ execute.ts
│  ├─ delivery/
│  │  ├─ delivery.ts
│  │  ├─ apply.ts
│  │  ├─ commit.ts
│  │  └─ push.ts
│  ├─ review/
│  │  └─ review.ts
│  └─ cleanup/
│     └─ workspace-cleanup.ts
├─ prompts/
│  ├─ decision/
│  │  └─ ask-decision.ts
│  ├─ planning/
│  │  └─ ask-goal.ts
│  ├─ execution/
│  │  └─ ask-execution.ts
│  ├─ cleanup/
│  │  └─ cleanup.ts
│  ├─ delivery/
│  │  ├─ apply-changes.ts
│  │  └─ delivery.ts
│  ├─ review/
│  │  └─ review.ts
│  └─ workflow/
│     ├─ approve-task.ts
│     └─ select-workflow.ts
└─ presenters/
   ├─ decision/
   │  ├─ decisions.ts
   │  └─ comparison.ts
   ├─ planning/
   │  └─ task-contract.ts
   └─ timing.ts
```

- `cli.ts`: interactive selector와 explicit plan / decision / execute / direct Goal routing.
  Planning / Decision은 입력 기반 helper를 interactive / explicit 경로가 재사용하며 string[]로
  재직렬화하지 않는다. Execute 선택은 기존 runExecutionCli의 task / repository 인자로 연결한다.
- `commands/plan/plan.ts`: GoalSpec 생성·검증, `planTask()` 호출, PlanningResult 반환.
- `commands/decision/decision.ts`: `runDecision()` → `compareDecisions()`를 CLI command layer에서
  조합하고 Comparison을 포함한 DecisionCommandResult를 반환한다. Snapshot / Goal / 파일 loading /
  Specialist 구성과 각 application의 validation은 중복하지 않는다.
- `commands/execute/execute.ts`: `executeTask()` 호출과 결과 출력, Review → Delivery → Cleanup 연결.
- `commands/review/`: 변경 presentation과 Review completion gate.
- `commands/delivery/`: Apply 성공 후 Commit, Commit 성공 후 Push의 승인·결과 연결.
- `commands/cleanup/`: Delete / Keep 결정에 따라 infrastructure의 worktree 제거 호출.
- `prompts/<feature>/`: 해당 CLI feature가 소유하는 입력·상호작용. Delivery는 Apply / Commit / Push를 포함한다.
- `prompts/workflow/`: workflow 선택과 Plan → Execute 사이 Human Task Approval. 승인 입력은 실행 로직을 소유하지 않는다.
- `presenters/`: TaskContract, 개별 Decision / Comparison과 timing을 보여주며 입력·승인 판단을 하지 않는다.

현재 Review와 Execution 결과 presentation 일부는 해당 command에 있다. 모든 출력을
새 presenter로 추출하거나 구현되지 않은 파일을 미리 나열하지 않는다.
Git command는 CLI에 직접 넣지 않고 `infrastructure/git` API를 사용한다.

## 5. 관찰할 결과와 Timing

아래 stage timing은 Action flow 기준이다. Decision은 위의 Decision Duration만 표시하며 별도 tracing
backend나 전체 telemetry framework 통합은 없다. Interactive input 대기 시간은 Decision Duration 밖이다.

CLI는 Worker 완료, Scope / Verification 결과, changed paths, run artifact 경로를 출력한다.
Timing에는 Planning, Approval Wait, Workspace, Worker와 내부 setup / Codex process /
output processing, Verification, 실행한 Cleanup, Total이 포함될 수 있다.
수행되지 않은 단계의 값은 생략될 수 있다.

Approval Wait는 Human interaction이며 system latency와 구분한다. Goal 기반 Total은 입력 완료
이후 Review / Delivery / Cleanup의 대기도 포함한다. 개별 Human gate의 시간을 모두 따로
측정하는 것은 아니다. Execution snapshot telemetry와 CLI의 end-to-end timing은 범위가 다르다.

## 6. 인터페이스 경계

```text
CLI → Application
Application → CLI를 모름
```

`planTask()` / `executeTask()` / `runDecision()` / `compareDecisions()`의 실제 use-case logic은 application에 유지한다.
UI가 바뀌어도 계약과 실행 정책은 UI에 종속되지 않아야 한다. 향후 Web UI / API adapter는
같은 application logic을 사용할 수 있지만 현재 구현된 인터페이스는 아니다.
Human 권한을 새 interface가 우회하지 않아야 한다.

Revise, re-plan, 복잡한 approval policy, fancy TUI는 현재 제공하지 않는다.
v4의 Phase A(해결 방향 판단·승인) / Phase B(상세 설계·실행)는
[Target Architecture](architecture.md#5-target-responsibility-model)의 목표 흐름이다. Human Staffing Approval,
해결 방향의 Approve / Override / Reject, 개별 Task Approval과 Change Review / Delivery는 각각 별도 접점이
필요하다. 다중 직원의 진행·재작업·재배치·Escalation을 관찰할 인터페이스도 후속 설계 대상이다.
현재 CLI에는 Staffing / CEO / Human Governance 명령이나 화면이 없으며, 기존 Decision 명령은 독립 판단과
비교까지만 수행한다. 구현된 v4 기반 API도 아직 CLI에 연결되지 않았다. 인터페이스 형태와 구현 순서는
[Roadmap](roadmap.md)에 두며 새로운 명령·화면을 현재 기능으로 확정하지 않는다.
