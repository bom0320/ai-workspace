# AI Workspace Architecture

## 1. Architecture Scope

이 문서는 현재 코드의 구성과 책임 경계, 향후 목표 아키텍처를 구분한다.
프로젝트의 North Star는 [Project Direction](project-direction.md), 단계별 계획은
[Roadmap](roadmap.md), 실행 방법은 [README](../README.md), Human 조작은
[CLI and Human Interface](cli-and-human-interface.md)를 참조한다.

현재 구현은 이 repository에서 확인 가능한 v0 / v1 코드 기준이다. 브랜치명만으로
미래 기능의 구현 여부를 판단하지 않는다. Target Architecture는 배치해야 할 코드 폴더나
이미 존재하는 런타임을 의미하지 않는다.

## 2. Current Architecture

현재 구현은 기존 Codex CLI를 Planning과 scoped execution 역할로 사용하는 Harness다.
AI Workspace는 독립적인 대상 Git Repository에 연결하며, 대상 Repository가 이 시스템의
코드나 조직 구조를 포함할 필요는 없다.

```text
Terminal operator interface (CLI)
  ├─ Goal input / Task Approval
  ├─ application/planning → TaskContract
  ├─ application/execution → ExecutionResult
  └─ Review → Delivery → Workspace Cleanup
           ↓
Contracts / Scope / Verification / Evidence / Artifacts
           ↓
Git worktree / Process → Target Repository
```

- Planning: GoalSpec, repository overview와 initial inspection, PlanningState,
  Fast Path 또는 Codex Planner / Planning loop, TaskDraft, TaskContract.
- Execution: isolated Git worktree, Codex Worker, scope check, verification,
  execution evidence, artifacts, duration telemetry.
- Human interaction: Task approval, 필수 Review, 승인 기반 Apply / Commit / Push,
  별도 Delete / Keep cleanup.

현재 Agent integration은 Codex이며 여러 provider의 registry나 generic Codex layer는 없다.
CEO, Staffing, Coordinator runtime, Durable Shared State, 자동 retry/recovery, Specialist 협업은
현재 구현이 아니다. 개별 실행 artifact를 조직의 공통 상태 저장소로 해석하지 않는다.

## 3. Current End-to-End Flow

```text
Natural Language Goal
↓
Repository Inspection → Initial exact-match inspection
↓
Adaptive Planning
├─ Conservative Fast Path → TaskDraft (0 rounds / no Planner call)
└─ Codex Planner ↔ inspect / complete (Planning limits enforced)
↓
Harness buildTaskContract() → TaskContract
↓
Human Task Approval
↓
Isolated Git Worktree → Codex Worker
↓
Scope Enforcement → Verification → Final Scope Check
↓
Artifacts / Evidence → ExecutionResult (workspace remains alive)
↓
Human Review
├─ Abort / failed → Delivery not attempted
└─ Continue + successful Execution / Verification / preserved patch
     ↓
   Apply → Commit → Push (separate approvals; Skip/failure stops later steps)
↓
Workspace Cleanup: Delete / Keep
```

명시적 TaskContract JSON 실행은 Planning과 Task Approval을 거치지 않는 기존 v0 경로다.
Goal 기반 경로는 `PlanningResult.task`를 메모리에서 Execution에 직접 전달하며 파일 저장·재로딩으로
연결하지 않는다. Planning 실패나 Task Reject는 Execution을 시작하지 않는다.
생성된 workspace는 실패한 실행에서도 확인·cleanup할 수 있으며 setup 실패는 경로가 없을 수 있다.

## 4. Current Responsibility Boundaries

| 소유자 | 현재 책임 | 경계 |
| --- | --- | --- |
| Human / CLI adapter | Goal 입력, Task approval, Review, Delivery와 Cleanup 선택, 결과 표시 | use-case core logic을 CLI로 이동하지 않는다 |
| Planning application | Repository 조사, Planner protocol, loop limits, Fast Path, 계약 생성 | 파일 수정·Execution 호출을 하지 않는다 |
| Codex Planner | 제공된 PlannerContext로 inspect / complete 결정 | 직접 Repository를 탐색하거나 수정하지 않도록 제한한다 |
| Harness contract transformation | ID 주입, Human constraints 보존, Goal의 targetRepository 사용, schema validation | AI가 시스템 ID나 Human 제약을 소유하지 않는다 |
| Execution application | workspace 생성, Worker·scope·verification·evidence·artifact orchestration | 정상 종료 시 workspace를 제거하지 않는다 |
| Codex Worker | TaskContract 범위의 수정, optional warm-start context 활용 | Task의 verification command는 Harness가 실행한다 |
| Services | scope, verification, evidence, artifacts의 독립 capability | Worker 자기 보고를 성공 Evidence로 대체하지 않는다 |
| Git / Process infrastructure | worktree, diff, apply·commit·push, process lifecycle | Human 승인과 workflow 결정을 소유하지 않는다 |

Inspection paths는 조사 대상이며 TaskContract.allowedPaths는 수정 범위다. 둘은 자동 변환하거나
같은 권한으로 취급하지 않는다. AI-facing PlannerContext에는 repositoryRoot를 포함하지 않는다.
현재 파일 접근 정책은 일반-purpose symlink sandbox가 아니다. Scope enforcement도 변경 후
탐지이며 모든 쓰기를 사전에 차단하는 정책은 아니다.

Evidence는 diff, changed paths, verification command의 stdout/stderr·exit code 같은 관찰 사실이다.
Telemetry는 duration 같은 운영 데이터이며 Evidence와 구분한다. `passed`는 실행 Scope와
구성된 Verification의 통과이며 objective / acceptance criteria의 의미적 충족을 보장하지 않는다.
별도 Verifier Agent가 acceptance criteria를 평가하는 구조는 아직 없다.

Workspace는 실제 실행용 worktree, artifacts는 `task.json`, `base-commit.txt`, `changes.patch`,
`result.json`의 영구 기록이다. ExecutionResult는 workspace.path를 포함하는 완료 시점 snapshot이다.
Review / Delivery / Cleanup 결과는 Execution 성공과 별개이며 result.json에 후속 상태를 저장하지 않는다.
CLI는 이후 cleanup duration을 표시하지만 Execution snapshot의 timing에는 이후 Human gate를 포함하지 않는다.

## 5. Target Architecture

> Planned architecture. Not implemented yet.

다음은 조직적 협업의 목표 구조다. 현재 Planning / Execution 일부 책임이 토대가 되지만,
이 plane들이 독립 컴포넌트로 모두 존재한다는 뜻은 아니다.

```text
Human Governance
        ↓
Control Plane
        ↓
Shared State / Evidence Plane
        ↓
Execution Plane
        ↓
Repository
```

- Human Governance: Goal, Approval, Review, Override, Escalation decision.
- Control Plane (planned): Agent Selection, Authority Policy, Context Routing,
  Conflict handling, Decision synthesis, CEO Governance.
- Shared State / Evidence Plane (planned): Decisions, Claims, Evidence references,
  Rounds, Failures, Recovery history, Agent status.
- Execution Plane: Worktree, Worker, Scope, Verification, Patch, Evidence는 현재 구현과
  직접 연결된다. 다중 Agent assignment나 조직적 recovery는 planned다.

상위는 workflow와 결정을, 하위는 Repository별 계약 실행을 소유한다.
Workflow-first → TaskContract → Repository-first라는 기존 경계를 유지하며
Reliable Worker before Agent Team을 따른다. 단계별 검증 질문은 [로드맵](roadmap.md)에 둔다.

## 6. Target Responsibility Boundaries

이 절의 조직 역할과 flow는 모두 **planned**다. 현재 CLI와 단일 Worker에 같은 이름의
상위 조직 runtime이 존재한다고 가정하지 않는다.

### Human / CEO / Coordinator

Human은 Goal, Constraints, Budget, Approval Policy와 중요한 scope / risk 변경,
최종 merge / release를 소유한다. 현재 GoalSpec은 objective, targetRepository,
optional constraints이며 Budget·Approval Policy 모델이 구현됐다는 뜻은 아니다.

CEO / Control Plane은 Intent / Task Analysis, decomposition, 역할과 필요한 Context,
위험·불확실성 판단, decision synthesis, escalation을 담당할 계획이다. CEO는 직접 모든
Repository 코드를 작성하는 super coder가 아니라 governance 역할이다.

Staffing Proposal은 필요한 역할의 이유, 책임, 예상 비용, 수행 범위를 제안한다.
향후 Approval Policy에 따라 Staffing / Budget 변경의 승인 수준을 정하되 Human 권한을
임의로 확대하거나 대체하지 않는다. 현재 staffing 또는 자동 승인 policy는 없다.

Coordinator는 승인된 Plan의 순서, task dependency, agent assignment, 상태 동기화,
Blocker / Conflict 전달을 조율하는 목표 역할이다. CEO의 판단이나 Human Goal을 바꾸지 않는다.
이 구분을 이유로 현재 별도 Coordinator class나 application 계층을 만들지 않는다.

### Shared State / Evidence Plane

> Shared State ≠ raw conversation log

공통 상태는 전체 reasoning이나 모든 대화를 저장하는 공간이 아니다. Decisions, Claims,
Evidence references, Run / Round, Failures, Recovery history, Agent status와 함께
필요한 Mission / Task 상태, Open Questions, Risks, Dependencies, Staffing / Budget 상태를
구조화할 계획이다. 현재 단일 실행의 artifact persistence와 구분한다.

### Worker / Harness / Verifier

Worker는 scoped execution을 소유하고 자신의 계약 범위를 확대하지 않는다.
Harness는 Authority, Context 접근, Repository isolation, verification 실행과 Evidence 생성을
통제한다. Harness는 개념적 통제 책임이며 `infrastructure/` 한 폴더만을 의미하지 않는다.

Verifier는 Claims와 독립적으로 실제 Evidence의 충분성과 acceptance criteria를 평가하는
목표 역할이다. Logical responsibility separation은 반드시 별도 Agent process를 의미하지
않는다. 현재는 Harness가 configured verification command를 실행하며 의미적 평가 Agent는 없다.

### Executive Reporting and Responsibility Flow

CEO는 장문의 실행 로그를 그대로 전달하지 않고 요청·수행 내용, Decisions, Evidence,
Risks / Open Questions, Human 판단 필요 여부를 Executive Report로 요약할 계획이다.
실패 후 Complete / Retry / Re-plan / Reviewer Assignment / Human Escalation 판단도 목표이며,
현재 자동 retry/re-plan은 구현되어 있지 않다.

```text
Human → CEO / Control Plane → Coordinator → TaskContract / assignment
  → Worker + Repository Harness → Repository
  → Verifier / Evidence → Shared State → CEO → Executive Report → Human
```

Human owns governance. CEO owns orchestration and decisions. Worker owns scoped execution.
Harness controls execution. Verifier evaluates evidence. Shared State stores organizational truth.
이 원칙들은 목표 책임 경계이며 현재 구현 여부는 2~4절을 따른다.

## 7. Application Structure Convention

현재 application과 module의 소스 배치 기준은 다음과 같다.

> Architecture is responsibility-first.

폴더는 사용 기술, 파일 수, 구조적 대칭성, 막연한 미래 재사용 가능성으로 나누지 않는다.
어떤 use-case가 책임을 소유하는지, 그 과정에서 어떤 역할을 하는지,
독립 capability인지, 외부 기술을 다루는 구현 세부사항인지 판단한다.

### 7.1 Top-level Placement

Source 영역은 다음 기준으로 구분한다.

- `application`: 사용자의 목적을 실제 workflow로 수행한다. 현재 Planning의
  `GoalSpec → TaskContract`, Execution의 `TaskContract → ExecutionResult`가 여기에 속한다.
  두 use-case는 각각의 진입점을 가지며 CLI adapter가 Human gate를 통해 연결한다.
- `contracts`: 특정 application 하나에 종속되지 않는 system-wide contract를 둔다.
  현재 GoalSpec과 TaskContract의 runtime schema와 그 schema에서 파생된 타입이 해당한다.
- `services`: use-case 내부의 특정 단계가 아니라, use-case를 떠나도 독립 capability로
  의미가 있는 기능을 둔다. 단순히 실제 작업을 수행한다는 이유만으로 service가 되지 않는다.
- `infrastructure`: Git, Process, filesystem 접근 등 기술적 실행 수단을 다룬다.
  기술을 사용하는 모든 코드가 이곳에 속하는 것은 아니다. Planning/Execution 전용 판단을
  포함하는 구현은 그 application에 남긴다.

### 7.2 Application Internal Responsibilities

```text
application/
└─ <use-case>/
   ├─ flow/
   ├─ model/
   ├─ protocol/   # 명확한 component boundary가 있을 때
   ├─ <role>/     # 명확한 application 역할이 있을 때
   └─ index.ts
```

현재 use-case는 `planning`과 `execution`이다. 모든 application에 위 폴더를 미리 만들거나
같은 파일 수와 폴더 모양을 강제하지 않는다. 같은 책임 분류 기준을 적용하는 것이 중요하다.

#### flow

> `flow` = 해당 use-case가 실제로 진행되는 과정의 application logic

flow는 orchestration만 담는 폴더가 아니다. 다음 과정에 직접 속하는 logic을 포함한다.

```text
Planning:
Goal → Repository 조사 → Planner 판단 → 추가 inspection → TaskDraft → TaskContract

Execution:
TaskContract → workspace 생성 → Worker 실행 → scope 검사
             → verification → artifacts → ExecutionResult
```

flow root에는 가능한 한 public use-case entry를 둔다.
현재 `planning/flow/plan-task.ts`와 `execution/flow/execute-task.ts`가 해당한다.

#### flow/orchestration

workflow의 순서와 진행 상태를 제어한다. 다음 단계 결정, 반복 제어, stage 진행,
실패 누적, workflow 종료 처리가 여기에 속한다.
현재 `planning-loop.ts`, `stages.ts`, `result-finalizer.ts`가 해당한다.
Review / Delivery / Cleanup의 Human interaction 연결은 현재 CLI가 소유한다.

#### Flow Implementation Grouping

flow의 책임이 늘어나면 세부 작업별로 한 단계의 하위 디렉터리를 둘 수 있다.
현재 Planning은 다음처럼 구분한다.

```text
flow/
├─ plan-task.ts
├─ adaptive/
├─ orchestration/
├─ inspection/
└─ transformation/
```

- `adaptive`: 보수적인 trivial task 판정과 Fast Path draft 생성.
- `inspection`: workflow 진행에 필요한 사실 수집.
  `inspectRepository`, `inspectFiles`가 Repository를 read-only로 조사한다.
- `transformation`: workflow를 제어하지 않고 데이터 표현을 변환하거나 확정한다.
  `createPlannerContext`는 AI-facing projection을 만들고,
  `buildTaskContract`는 Draft에 Harness 식별자와 Human 제약을 반영한다.

`inspection`, `transformation`은 flow 내부의 implementation grouping이다.
`model`, `protocol`과 같은 application 최상위 분류가 아니므로,
단순히 별도 책임이라는 이유로 `planning/inspection`, `planning/transformation`처럼
use-case root로 올리지 않는다. 분류 축을 일관되게 유지한다.

#### model

해당 use-case가 소유하는 상태, 설정, 결과를 둔다.
Planning의 PlanningState, PlanningLimits, PlanningResult, RepositoryInfo와
Execution의 ExecutionState, ExecutionResult가 해당한다.

> model ≠ 모든 타입을 넣는 곳

system-wide contract는 `contracts`, 역할 간 message contract는 `protocol`에 둔다.

#### protocol

컴포넌트나 역할 사이에서 주고받는 구조화된 message contract를 둔다.
Planning에는 PlannerContext, PlannerDecision, InspectRequest, InspectResult, TaskDraft가 있다.

```text
Harness → PlannerContext → Planner
Planner → PlannerDecision → Harness
Planner → InspectRequest → Harness inspectFiles() → InspectResult → PlanningState update
```

PlanningResult는 Planning use-case의 최종 결과이고,
PlannerDecision은 Planner ↔ Harness 사이의 communication contract다.
이 둘을 같은 책임으로 분류하지 않는다.
protocol은 항상 필요한 폴더가 아니며, 명확한 component boundary가 있을 때만 둔다.

#### Role Folder

명확한 application 역할의 구현체를 둔다.
현재 `planning/planner/codex-planner.ts`와 `execution/worker/codex-worker.ts`가 해당한다.

Codex Planner는 Codex 기술을 사용하기 때문에 planner에 있는 것이 아니라,
Planning의 Planner 역할을 구현하기 때문에 그곳에 있다.
Codex Worker도 Execution의 Worker 역할 구현체이므로 Execution이 소유한다.
기술보다 역할 소유권을 우선한다.

#### index.ts

해당 use-case의 public boundary다. `planTask`, `executeTask`, PlanningResult,
ExecutionResult 등 외부에 필요한 API를 제공한다.
내부 파일 위치가 바뀌어도 외부 사용자가 그 배치에 직접 의존하지 않도록 한다.
Cross-module은 `@/*` alias와 대상 module의 `index.ts`, same-module 내부는 상대경로를 사용한다.
  현재 contracts는 개별 schema 파일에서 import한다. 자기 module의 index를 내부에서 다시 import하거나
  상위 mega barrel을 만들지 않으며 public API에는 외부에 필요한 항목만 노출한다.

### 7.3 Codex Implementation Placement

```text
Planner ≠ Codex      Planner can use Codex
Worker ≠ Codex       Worker can use Codex
```

역할을 구현하는 코드는 각 application의 planner/worker에 둔다.
Planner와 Worker에 실제 공통 실행 책임이 생길 때에만,
`codex exec`, sandbox, timeout, stdout/stderr 수집, process error handling,
config 같은 기술적 메커니즘을 `infrastructure/codex/`로 추출할 수 있다.
현재 이 모듈은 구현되어 있지 않으며, 사용 기술이 같다는 이유만으로 만들지 않는다.

```text
Planning 개념을 안다       → application/planning
Execution 개념을 안다      → application/execution
Codex 실행 방법만 안다     → infrastructure
```

### 7.4 Services Promotion

> 해당 use-case를 떠나도 독립 capability로 의미가 있는가?

그렇다면 services 후보가 된다. 현재 scope 검사, verification 실행,
artifact 저장, evidence 수집이 여기에 속한다.

반면 `PlanningState → PlannerContext`, `TaskDraft → TaskContract`처럼
Planning 전용 언어를 강하게 아는 변환은 Planning flow 내부에 둔다.
다른 곳에서도 쓸 것 같다는 예상만으로 service나 abstraction을 먼저 추출하지 않는다.

### 7.5 Finalizer Responsibility

workflow가 끝난다는 이유만으로 finalizer를 만들지 않는다.

> 종료 처리 자체가 독립 책임일 정도로 복잡한가?

Execution의 `finalizeExecutionResult`는 state 조립, passed 계산,
evidence/scope/failures와 artifacts 반영, result persistence 시도,
report failure 처리, 최종 ExecutionResult 반환을 담당한다.
따라서 workflow 종료 orchestration으로서 독립 책임이 있다.

Planning의 현재 종료 처리는 단순하다. `buildTaskContract`는 데이터 변환과 정책 강제이며,
구조적 대칭성을 위해 `finalizePlanningResult` 같은 abstraction을 추가하지 않는다.

> 구조적 대칭성보다 실제 책임을 우선한다.

### 7.6 Current Source Layout

현재 브랜치의 주요 배치는 다음과 같다. 테스트는 구현 파일과 함께 배치되며,
아래 예시에서는 CLI entry와 세부 파일을 생략한다.

```text
src/
├─ cli/  # operator adapter; 세부 구조는 CLI 문서 참조
├─ application/
│  ├─ planning/
│  │  ├─ flow/
│  │  │  ├─ plan-task.ts
│  │  │  ├─ adaptive/
│  │  │  ├─ orchestration/
│  │  │  ├─ inspection/
│  │  │  └─ transformation/
│  │  ├─ model/
│  │  ├─ protocol/
│  │  ├─ planner/
│  │  └─ index.ts
│  └─ execution/
│     ├─ flow/
│     │  ├─ execute-task.ts
│     │  └─ orchestration/
│     ├─ model/
│     ├─ worker/
│     └─ index.ts
├─ contracts/
├─ services/
│  ├─ artifacts/
│  ├─ evidence/
│  ├─ scope/
│  └─ verification/
└─ infrastructure/
   ├─ git/
   └─ process/
```

Execution의 일부 단계는 이미 services의 독립 capability로 분리되어 있다.
Planning의 inspection과 transformation은 아직 Planning flow와 강하게 결합되어 있다.
따라서 두 application의 구조가 대칭이 아니거나 Planning flow가 더 커 보이는 것은 문제가 아니다.
맞춰야 하는 것은 파일 개수, 폴더 개수, 모양이 아니라 책임을 판단하는 기준이다.

### 7.7 Placement Checklist

새 기능이나 리팩토링의 파일 배치는 다음 질문으로 판단한다.

1. 어떤 use-case가 이 코드를 소유하는가?
   → planning / execution / system-wide
2. 해당 use-case가 진행되는 과정에 직접 속하는가?
   → flow
3. 흐름의 순서와 상태를 제어하는가?
   → flow/orchestration
4. flow 안의 특정 작업 단계인가?
   → flow/<responsibility>
5. use-case 전체가 소유하는 상태/설정/결과인가?
   → model
6. 역할 또는 컴포넌트 사이 message contract인가?
   → protocol
7. 명확한 역할 구현체인가?
   → planner / worker
8. 다른 use-case에서도 독립 capability로 의미가 있는가?
   → services
9. Git / Process / Codex CLI 같은 기술적 실행 방법인가?
   → infrastructure
10. 미래에 재사용될 것 같다는 예상만 있는가?
    → 아직 추출하지 않는다

## 8. Architectural Invariants

- Architecture is responsibility-first. 기술·파일 수·구조적 대칭성보다 책임 소유권을 우선한다.
- Agent는 교체 가능한 역할 구현체다. Harness의 가치와 특정 모델·CLI를 동일시하지 않는다.
- Application은 UI를 모른다. CLI는 operator adapter이며 다른 UI로 바뀌어도 use-case 경계를 유지한다.
- Planning과 Execution은 서로 직접 호출하지 않는다. 현재 연결과 Human gate는 CLI adapter에 있다.
- Human Task Approval, Review, Apply, Commit, Push, Cleanup은 서로 다른 결정이다.
- Apply는 Execution·Verification 성공과 patch 보존 확인 뒤에만 가능하다. Dirty repository를 차단하고
  pre-check를 수행한다. Commit은 changedPaths만 stage하고 Push는 기존 upstream에만 수행한다.
- Workspace lifecycle과 Execution lifecycle을 분리한다. Artifact 보존은 workspace 삭제와 독립적이다.
- Evidence와 Telemetry, TaskContract와 file content, 내부 상태와 역할 간 protocol을 구분한다.
- Scope / verification 통과를 자연어 요구 충족의 증명으로 과장하지 않는다.
- 미래 Shared State / CEO / recovery 계획을 현재 구현 사실로 서술하지 않는다.
- Runtime boundary는 Zod validation을 사용하며 현재 요청에 필요하지 않은 추상화를 만들지 않는다.
