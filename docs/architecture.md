# AI Workspace Architecture

## 1. Architecture Scope

이 문서는 현재 코드의 구성과 책임 경계, 향후 목표 아키텍처를 구분한다.
프로젝트의 North Star는 [Project Direction](project-direction.md), 단계별 계획은
[Roadmap](roadmap.md), 실행 방법은 [README](../README.md), Human 조작은
[CLI and Human Interface](cli-and-human-interface.md)를 참조한다.

현재 구현은 이 repository에서 확인 가능한 v0 / v1 코드 기준이다. 브랜치명만으로
미래 기능의 구현 여부를 판단하지 않는다. Target Responsibility Model은 배치해야 할 코드 폴더나
이미 존재하는 런타임을 의미하지 않는다.

## 2. Current Architecture

현재 구현은 기존 Codex CLI를 Planning과 scoped execution 역할로 사용하는
Development Governance Harness다. Runtime 구현은 교체 가능하지만 현재 integration은 Codex뿐이다.
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

현재 stack은 Node.js / TypeScript / pnpm / tsx / Vitest / Zod다. Codex CLI는 외부 실행 도구이며
package dependency로 포함되어 있지 않다. 여러 provider의 registry나 generic Codex layer는 없다.
AgentDecision / RepositorySnapshot domain model, Specialist 협업, decision comparison / synthesis,
Human override / escalation 이력, 자동 retry / crash resume는 현재 구현이 아니다.
개별 실행 artifact를 governance records 전체나 durable workflow state로 해석하지 않는다.

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
탐지이며 모든 쓰기를 사전에 차단하는 정책은 아니다. allowedPaths / forbiddenPaths는 정확한
문자열 일치이며 glob이나 directory prefix가 아니다. forbiddenPaths에 포함된 경로는
allowedPaths에도 포함되어 있더라도 위반이다.

Evidence는 diff, changed paths, verification command의 stdout/stderr·exit code 같은 관찰 사실이다.
Telemetry는 duration 같은 운영 데이터이며 Evidence와 구분한다. `passed`는 실행 Scope와
구성된 Verification의 통과이며 objective / acceptance criteria의 의미적 충족을 보장하지 않는다.
Zod는 runtime boundary의 구조를 검증하며 의미적 정확성을 보장하지 않는다.
별도 Verifier Agent가 acceptance criteria를 평가하는 구조는 아직 없다.

Workspace는 실제 실행용 worktree, artifacts는 `task.json`, `base-commit.txt`, `changes.patch`,
`result.json`의 영구 기록이다. ExecutionResult는 workspace.path를 포함하는 완료 시점 snapshot이다.
Review / Delivery / Cleanup 결과는 Execution 성공과 별개이며 result.json에 후속 상태를 저장하지 않는다.
CLI는 이후 cleanup duration을 표시하지만 Execution snapshot의 timing에는 이후 Human gate를 포함하지 않는다.

## 5. Target Responsibility Model

이 절은 **미래 책임 모델**이며 독립 plane, 조직 Agent 또는 새 폴더를 구현하라는 명세가 아니다.
Ownership과 Build vs Adopt의 canonical 기준은 [Project Direction](project-direction.md#project-ownership-boundary)에 둔다.

```text
Human — Goal / constraints / approval / review / override
   ↕ Human decision surface (현재 CLI)
Development Governance — AI Workspace-owned semantics
   ├─ Contract / Authority / Context policy
   ├─ Repository consistency / Decision / Evidence provenance
   ├─ Scope / Verification / Comparison / Synthesis
   └─ Approval / Escalation / Decision traceability
   ├─ 실행 위임 → Agent Runtime / Orchestration (현재 Codex CLI)
   └─ 관찰·검증 → Execution Infrastructure (현재 Git / Process)
                         ↓
                     Repository
   ↑ Decision / Repository observation / Verification result
```

화살표는 책임과 정보 흐름이다. Runtime과 Infrastructure는 단순 직렬 계층이 아니다.
현재 Planning / Execution application과 services가 일부 governance 책임을 구현하며,
CLI가 Human gate를 연결한다. 나머지 책임은 검증 질문이 생길 때 점진적으로 추가한다.

Human과 AI Workspace, Agent Runtime, Git / Process infrastructure, Repository의 연결이
Agent Development Environment(ADE)를 구성한다. 그 환경의 governance semantics는 AI Workspace가
소유하며 실행 mechanism은 기존 runtime과 도구를 활용한다. ADE는 이 책임들의 결합을 설명하는
관점이며 새로운 ADE / Platform layer나 폴더를 요구하지 않는다. 정의와 현재·미래 범위는
[Project Direction](project-direction.md#ade와-development-governance)을 따른다.

### Governance와 replaceable runtime

AI Workspace는 계약·권한·Context·Evidence 인정 기준·검증 결과의 의미·Human gate를 소유한다.
Agent runtime은 주어진 역할과 실행 조건 아래 판단이나 작업을 수행한다. Workflow graph,
scheduling, parallel execution, message transport, checkpoint / durable resume가 필요해지면
[Build vs Adopt](project-direction.md#build-vs-adopt)에 따라 기존 기술을 먼저 평가한다.
현재 작은 use-case orchestration을 범용 workflow engine으로 키우지 않는다.

Runtime implementation은 replaceable이다. 다만 현재 여러 runtime이 지원된다는 뜻은 아니다.
External framework adoption은 필요한 경우 외에는 framework-specific run/session/step 개념을
core domain으로 누출시키지 않아야 한다. 외부 ID를 provenance와 연결할 수 있지만 별도 domain
모델이 필요한 이유를 검증해야 한다. 실제 두 번째 implementation 또는 실제 중복 책임이 생기기
전에는 infrastructure abstraction이나 provider registry를 만들지 않는다.

## 6. Future Domain Models and Boundaries

다음은 **미구현 제안과 채택 조건**이다. 이름이 존재한다는 이유로 모델이나 runtime을 유지하지 않는다.
단계별 검증 질문과 exit criteria는 [Roadmap](roadmap.md)에 둔다.

| 개념 | 개발 도메인 의미 / 판단 | 제외하거나 위임할 범위 |
| --- | --- | --- |
| RepositorySnapshot | Decision의 실제 repository provenance. 동일 비교 단위의 기준 commit과 관찰 상태를 식별하고 consistency를 확인 | generic checkpoint와 동일시하지 않는다. 현재 base-commit.txt만으로 전체 비교 조건을 증명하지 않는다 |
| AgentDecision | recommendation / evidence references / risk / uncertainty를 담는 structured decision record로 유지 | raw response나 현재 PlannerDecision의 이름 변경으로 대체하지 않는다 |
| DecisionRound | 동일 RepositorySnapshot을 기준으로 생성한 독립 Decision들의 비교 단위가 실제로 필요할 때만 채택 | 단순 workflow step / 반복 횟수라면 runtime에 맡긴다 |
| DecisionRun | Goal → Decision / Evidence → Human governance result의 audit lifecycle이 실제로 필요할 때만 채택 | framework run/session ID를 복제하는 수준이면 만들지 않는다 |
| Governance records | Decision records, Evidence references, repository provenance, Human governance history의 의미와 연결을 소유 | generic Durable Shared State / memory / checkpoint engine을 구현하는 목표로 삼지 않는다 |
| Decision synthesis | Evidence 기반 종합, conflict / trade-off 표현, explainable recommendation과 escalation | CEO / Coordinator / Staffing을 필수 별도 Agent나 조직 runtime으로 고정하지 않는다 |

### Repository consistency / Context / Specialist authority

같은 비교 단위의 Specialist는 동일 commit과 명시된 Context / authority 조건 아래 판단해야 한다.
Dirty state, 관찰 이후 변경, 제공 파일의 출처가 비교 가능성에 미치는 영향을 기록하고 확인한다.
현재 Planning inspection은 원본 작업 디렉터리에서 읽고 Execution worktree는 HEAD에서 생성한다.
따라서 현재 inspection / warm-start만으로 동일 Snapshot 기준 판단이 보장된다고 쓰지 않는다.
Worker에게도 workspace가 실제 변경의 source of truth이며 필요할 때 상태를 재확인하도록 안내한다.

Reviewer는 Repository write authority를 갖지 않아야 한다. Specialist independence는 서로의
Decision을 보기 전에 판단한다는 조건이며 process 수나 병렬 scheduling 자체가 성공 기준은 아니다.
이 정책의 enforcement 방법은 실제 runtime 선택과 함께 검증한다.

### Evidence / Verification / Comparison / Synthesis

Worker는 scoped execution을 수행하며 자신의 계약을 확대하지 않는다. Harness의 통제 책임은
application / services / runtime configuration에 걸쳐 있으며 infrastructure 한 폴더를 뜻하지 않는다.
Verification의 실행 수단과 Evidence의 충분성을 판단하는 책임을 구분한다. 후자는 반드시 별도
Verifier Agent process를 요구하지 않으며, 현재 configured command 통과보다 넓은 미래 책임이다.

Decision의 Evidence reference는 실제 repository observation 또는 verification 결과까지 연결한다.
Agreement / Conflict / Trade-off 비교는 같은 문제와 비교 조건을 명시하고 incompatible recommendation,
evidence 해석, trade-off를 식별한다. 최종 recommendation도 원래 Decision / Evidence / Verification으로
추적 가능해야 한다. 종합은 deterministic function, 하나의 LLM call, framework supervisor, 별도 Agent
중 실제 요구와 평가 결과로 선택한다. 역할명 자체를 architecture commitment로 만들지 않는다.

### Human governance records / Recovery boundary

Task Approval, Change Review, Apply, Commit, Push, Cleanup을 서로 다른 권한으로 유지한다.
미래 approve / override / reject / escalation의 대상, 이유, 권한과 결과를 기록할 필요는 있지만,
현재 result.json에는 후속 Human 결정 이력이 없다. 저장 형식과 backend는 아직 결정하지 않았다.
Repository 변경이 되돌려져도 판단 근거와 Human 이력의 추적 가능성은 유지해야 한다.

Process crash recovery, durable scheduling, resumable workflow는 별도 범용 실행 문제다.
필요할 때 Temporal / Restate / framework checkpoint 같은 기존 기술을 평가한다.
실패 Evidence를 보존하는 현재 동작이나 timeout 종료 처리를 crash resume로 설명하지 않는다.
자동 retry / rollback / re-plan과 Human escalation policy도 현재 기능이 아니며, 실패 처리 runtime을
먼저 만드는 것이 목표가 아니다.

## 7. Application Structure Convention

현재 application과 module의 소스 배치 기준은 다음과 같다.

> Architecture is responsibility-first.

폴더는 사용 기술, 파일 수, 구조적 대칭성, 막연한 미래 재사용 가능성으로 나누지 않는다.
어떤 use-case가 책임을 소유하는지, 그 과정에서 어떤 역할을 하는지,
독립 capability인지, 외부 기술을 다루는 구현 세부사항인지 판단한다.
Build vs Adopt도 같은 책임 기준을 따른다. Governance semantics와 외부 실행 메커니즘의
경계를 먼저 확인하며, 후보 framework를 도입하기 위해 폴더나 interface를 미리 만들지 않는다.

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
- 미래 governance records / Specialist / comparison / synthesis를 현재 구현 사실로 서술하지 않는다.
- Generic runtime 문제는 기존 기술을 먼저 평가한다. Runtime은 교체 가능하며 governance 의미는 프로젝트가 소유한다.
- 실제 domain 의미 없는 Run / Round 복제나 CEO / Coordinator 역할명을 구현 약속으로 만들지 않는다.
- Runtime boundary는 Zod validation을 사용하며 현재 요청에 필요하지 않은 추상화를 만들지 않는다.
