# AI Workspace Architecture

## 1. Goal

AI Workspace는 하나의 AI 모델에게 코딩을 맡기는 도구가 아니라,

AI Agent가 실제 소프트웨어 개발 업무를 안전하고 반복 가능하게 수행하도록

조직 운영과 Repository 실행 환경을 연결하는 개발 시스템이다.

Human은 목표와 제약을 정의하고 중요한 의사결정을 승인한다.

상위 Control Plane은 작업을 분석하고 필요한 Agent를 구성하며,

업무를 분해하고 상태와 예산을 관리한다.

하위 Repository Harness는 각 Repository의 규칙과 Task Contract를 기반으로

코드를 조사하고 수정하고 검증하며 실행 결과를 Evidence로 반환한다.

---



## 2. Core Principle

### Workflow-first at the top

상위 계층은 다음을 담당한다.

- Intent Analysis
- Task Analysis
- Staffing
- Coordination
- Context Routing
- Budget Management
- Decision
- Escalation
- Executive Reporting

### Repository-first at the bottom

하위 계층은 다음을 담당한다.

- Repository inspection
- Repository-specific rules
- Scoped implementation
- Tool execution
- Verification
- Evidence collection

핵심 원칙:

> Horizontal Orchestration + Vertical Harness

그리고:

> Reliable Worker before Agent Team

여러 Agent를 구성하기 전에

단일 Worker가 Repository 안에서 안정적으로

읽기 → 수정 → 검증 → 보고를 수행할 수 있어야 한다.

---



## 3. System Boundary

AI Workspace는 개별 프로젝트 Repository에 포함되지 않는다.

각 Repository는 독립적으로 존재하며,

AI Workspace가 외부에서 연결한다.

```text

Human

  ↓

AI Workspace

  ├─ Control Plane

  ├─ Shared State

  ├─ Agent Runtime

  └─ Repository Harness

       ↓

       ├─ web-portfolio

       ├─ hyoit-FE

       ├─ Washer-Client-v2

       └─ other repositories
```

---

## 4. End-to-End Control Flow

AI Workspace의 제어 흐름은 Human의 Goal을 실행 가능한 작업으로 구체화하고,

Repository에서 검증된 결과를 다시 의사결정 계층으로 전달하는 순환 구조다.

```text
Human
  → Goal
  → CEO / Control Plane
  → Intent & Task Analysis
  → Staffing Proposal
  → Approval Gate
  → Task Contract
  → Repository Worker
  → Repository Rules + Relevant Context
  → Execution
  → Verification
  → Evidence + Telemetry
  → Shared State
  → CEO Evaluation
  → Executive Report
  → Human
```

이 흐름의 핵심 경계는 다음과 같다.

> Workflow-first → Task Contract → Repository-first

### 4.1 Goal

Human은 수행할 Goal과 함께 Constraints, Budget, Approval Policy,

Target Repository를 정의한다.

Human은 개별 Agent의 세부 행동을 직접 micromanagement하지 않는다.

대신 목표, 권한, 비용, 위험의 경계를 정하고 중요한 의사결정에 개입한다.

### 4.2 Analysis

CEO / Control Plane은 Goal을 Repository Worker에게 바로 전달하지 않는다.

먼저 해결해야 할 문제와 작업 단위를 분석하고,

필요한 역할, Repository Context, 위험, 불확실성을 식별한다.

이 분석은 Goal을 실행 가능한 범위로 좁히고,

필요한 승인과 검증 수준을 결정하는 기반이 된다.

### 4.3 Staffing Proposal

Control Plane은 분석 결과를 바탕으로 필요한 Agent 역할을 제안한다.

Staffing Proposal에는 각 역할이 필요한 이유, 책임, 예상 비용,

그리고 수행 범위가 포함된다.

Approval Gate는 Human이 Goal에서 정의한 Approval Policy를 기준으로

Staffing Proposal을 다음 중 하나로 판단하는 Governance 경계다.

- 자동 승인 가능한 변경
- Human approval이 필요한 변경
- 수정 또는 거절이 필요한 변경

작은 역할 추가는 자동 승인될 수 있지만,

Budget 확대, 중요한 Staffing 변경, 위험도가 높은 작업은

Approval Policy에 따라 Human approval을 요구할 수 있다.

### 4.4 Task Contract

Task Contract는 Workflow-first Control Plane과

Repository-first Execution 사이의 공식 경계다.

Task Contract에는 다음 항목이 포함된다.

- Objective
- Target Repository
- Allowed Scope
- Constraints
- Acceptance Criteria
- Verification Requirements

Control Plane의 분석과 의사결정은 Task Contract를 통해

Repository Worker가 수행할 수 있는 명확하고 제한된 작업으로 전달된다.

### 4.5 Repository Execution

Repository Worker는 Task Contract, Repository Rules,

Relevant Repository Context만 받아 작업을 수행한다.

Repository 전체를 무조건 Context에 넣지 않으며,

현재 작업의 범위와 판단에 필요한 정보만 선택적으로 사용한다.

Worker는 허용된 범위 안에서 Repository를 조사하고,

변경을 수행하며, 검증 가능한 실행 결과를 만든다.

### 4.6 Verification

Agent의 자기 보고만으로는 Task의 완료를 판단하지 않는다.

> Agent says "done" ≠ Task is actually done

완료 여부는 작업 성격에 맞는 실제 실행 결과를 기반으로 판단한다.

검증에는 다음과 같은 항목이 포함될 수 있다.

- lint
- typecheck
- test
- build
- diff inspection

Acceptance Criteria와 Verification Requirements를 충족했다는 Evidence가 있어야

작업을 완료 상태로 평가할 수 있다.

### 4.7 Result

Repository Execution의 결과는 Evidence와 Telemetry로 구분한다.

Evidence는 변경 내용, 명령 실행 결과, 테스트 결과, diff처럼

Task의 성공 여부를 판단하는 직접적인 근거다.

Telemetry는 소요 시간, 비용, 재시도 횟수, 실패 유형처럼

실행 과정의 상태와 효율을 관찰하기 위한 운영 데이터다.

두 결과는 Shared State에 반영되어 이후 판단과 작업의 공통 근거가 된다.

CEO는 Shared State를 평가한 뒤 다음 행동 중 하나를 결정한다.

- Complete
- Retry
- Re-plan
- Reviewer Assignment
- Human Escalation

결정과 근거는 Executive Report로 정리되어 Human에게 전달된다.

### 4.8 Human Boundary

다음 결정은 자동화 계층에 위임하지 않고 Human의 권한으로 유지한다.

- Goal 변경
- 중요한 Constraint 변경
- Approval Policy가 요구하는 Staffing 승인
- Budget 확대
- 위험한 작업 승인
- 최종 Merge / Release 판단

AI Workspace는 이 경계를 유지하면서 실행과 검증을 자동화하고,

Human이 중요한 판단에 집중할 수 있도록 충분한 Evidence와 요약을 제공한다.

---

## 5. Core Components & Responsibility Boundaries

AI Workspace는 Governance, 조직적 의사결정, 실행 조율,

Repository 작업, 검증, 상태 저장의 책임을 구분한다.

각 구성요소는 자신의 경계 안에서 작업하며,

다른 구성요소의 권한을 임의로 대체하지 않는다.

### 5.1 Human / Governance

Human은 조직의 Owner이자 Governance 주체다.

책임:

- Goal 정의
- Constraints 정의
- Budget과 Approval Policy 정의
- 중요한 Staffing / Scope / Risk 변경 승인
- 최종 Merge / Release 판단

하지 않는 일:

- 개별 Agent를 지속적으로 micromanagement
- Worker에게 세부 구현 방법을 직접 지시
- Shared State의 실행 상태를 직접 관리

Human은 조직의 방향과 허용 경계를 소유하지만,

일상적인 Agent 실행을 직접 조율하지 않는다.

### 5.2 CEO / Control Plane

CEO / Control Plane은 Human의 의도를 조직의 계획과 의사결정으로 변환한다.

책임:

- Human Intent 해석
- Goal 분석
- Task decomposition
- Staffing Proposal 생성
- Agent 간 Coordination
- Context Routing 결정
- Budget 관리
- Shared State를 기반으로 다음 행동 결정
- Complete / Retry / Re-plan / Escalation 판단
- Executive Report 생성

하지 않는 일:

- 일반적인 Repository 구현 작업을 직접 수행
- 모든 Repository 파일을 직접 읽고 수정
- Verification 없이 Worker의 완료 보고를 신뢰
- Human approval이 필요한 경계를 임의로 넘음

CEO는 모든 코드를 직접 작성하는 "super coder"가 아니라,

조직 운영과 의사결정을 소유하는 계층이다.

### 5.3 Shared State

Shared State는 Agent가 아니라 조직의 공통 상태 저장 계층이다.

다음과 같이 현재 조직이 알아야 할 최소한의 사실과 결론을 유지한다.

- Mission 상태
- Task 상태
- Decisions
- Open Questions
- Risks
- Dependencies
- Staffing 상태
- Budget 상태
- Evidence references
- Agent status

중요 원칙:

> Shared State ≠ 모든 Agent의 대화 로그

Shared State는 Agent의 긴 대화나 전체 reasoning을 저장하는 공간이 아니다.

다른 Agent와 CEO가 다음 판단을 내리는 데 필요한

정제된 상태, 결정, 참조만 유지한다.

### 5.4 Coordinator / Orchestration

Coordinator는 승인된 판단을 실제 Task 실행 흐름으로 조율한다.

책임:

- 승인된 Plan을 실제 Task 실행 순서로 조율
- Task dependency 관리
- Agent assignment 연결
- Shared State와 실행 상태 동기화
- 필요한 경우 CEO에게 Blocker / Conflict 전달

하지 않는 일:

- Human Goal 자체를 임의로 변경
- Repository 구현을 직접 담당
- Acceptance Criteria를 임의로 완화

CEO가 "무엇을 왜 할지"를 판단하는 계층이라면,

Coordinator는 승인된 판단을 "어떤 순서와 상태로 실행할지"

조율하는 계층이다.

### 5.5 Repository Worker

Repository Worker는 하나의 제한된 Task를 수행하는 실행 주체다.

책임:

- Task Contract 이해
- Repository Rules 확인
- Relevant Repository Context 조사
- 허용된 Scope 안에서 구현
- Repository-specific tools 실행
- 작업 결과와 필요한 정보를 반환

하지 않는 일:

- 자신의 Task Contract 범위를 임의로 확대
- Staffing 변경
- Human Goal 변경
- unrelated refactoring
- Verification 결과를 임의로 성공 처리

Worker는 조직 전체를 운영하는 Agent가 아니라,

주어진 Task Contract 경계 안에서 작업하는 실행 주체다.

### 5.6 Repository Harness

Repository Harness는 Worker가 Repository에서

안전하고 반복 가능하게 작업하도록 통제하는 실행 환경이다.

책임:

- Repository Rules 제공
- 작업 Scope 제한
- Tool 접근 제공
- Repository Context 접근
- Verification command 실행
- 실행 결과 수집
- Evidence 생성 지원

```text
Worker
  ↓
Repository Harness
  ↓
Repository
```

Repository Harness는 특정 Repository의 비즈니스 판단을 내리는 Agent가 아니라,

실행 범위와 접근을 통제하는 infrastructure layer다.

### 5.7 Verifier

Verifier는 Worker의 자연어 자기 보고와 독립적으로

실제 Evidence를 기준으로 작업 결과를 판단한다.

책임:

- Acceptance Criteria 확인
- lint / typecheck / test / build 등의 결과 확인
- diff inspection
- Evidence 평가
- 실패 및 불충분한 Evidence 식별

논리적으로 Worker와 Verifier의 책임은 분리된다.

다만 초기 v0에서는 동일한 runtime이나 Agent가

두 역할을 수행할 수도 있다.

> Logical responsibility separation ≠ 처음부터 반드시 별도 Agent 프로세스

### 5.8 Executive Reporting

CEO는 실행 로그 전체를 Human에게 그대로 전달하지 않는다.

Shared State, Decisions, Evidence, Risks를 기반으로

Human이 판단하는 데 필요한 내용만 Executive Report로 정리한다.

Report에는 개념적으로 다음이 포함될 수 있다.

- 무엇을 요청했는가
- 무엇을 수행했는가
- 어떤 결정이 내려졌는가
- 어떤 Evidence가 있는가
- 어떤 Risk / Open Question이 남아 있는가
- Human의 추가 판단이 필요한가

### 5.9 Responsibility Flow

```text
Human
  ↓ governance
CEO / Control Plane
  ↓ planning & decision
Coordinator
  ↓ Task Contract / assignment
Repository Worker
  ↓
Repository Harness
  ↓
Repository
  ↓
Verifier / Evidence
  ↓
Shared State
  ↓
CEO
  ↓
Human
```

주요 책임 원칙은 다음과 같다.

- Human owns governance.
- CEO owns orchestration and decisions.
- Worker owns scoped execution.
- Harness controls execution.
- Verifier evaluates evidence.
- Shared State stores organizational truth.

## 6. Source Architecture

현재 코드는 다음의 source 구조를 사용한다.

```text
src/
├── application/
├── contracts/
├── services/
└── infrastructure/
```

- `application`: Planning, Execution처럼 사용자의 목적을 수행하는 use-case와 application logic
- `contracts`: GoalSpec, TaskContract 등 특정 application 하나에 종속되지 않는 system-wide contract
- `services`: Scope, Verification, Evidence, Artifact 등 독립 capability
- `infrastructure`: Git, OS Process 등 기술적 실행 수단과 저수준 구현

### 6.1 Module Internal Structure

모든 모듈에 동일한 하위 폴더 구조를 강제하지 않는다.

현재 실행 모듈은 실행 흐름, 핵심 모델, Worker 역할 구현체를 분리한다.

```text
application/execution/
├── flow/
├── model/
├── worker/
└── index.ts
```

- `flow/`: Execution 과정에 직접 속하는 application logic
- `model/`: Execution 모듈의 핵심 상태와 결과 모델
- `worker/`: Execution Worker 역할 구현체
- `index.ts`: 외부 public API

`flow / model` 구조는 모든 모듈에 강제하지 않는다. 역할이 충분히 복잡해졌을 때만
내부 구조를 분리하며, 단일 책임 모듈은 불필요하게 깊게 만들지 않는다.

폴더 분리 기준은 타입의 존재 여부가 아니라 책임을 구조적으로 분리할 필요성이다.

현재 services 계층은 독립 capability별로 다음과 같이 구성한다.

```text
services/
├── scope/
├── verification/
├── evidence/
└── artifacts/
```

- `scope/`: 변경 경로 정책 검사
- `verification/`: verification command 실행
- `evidence/`: 실행 중 관찰된 사실 수집
- `artifacts/`: 실행 결과물 보존

### 6.2 Import and Public API Boundaries

- Cross-module imports use the `@/*` source alias and the target module's `index.ts`.
- Same-module internal imports use relative paths.
- 다른 모듈에 접근할 때는 해당 모듈의 `index.ts` public API를 사용한다.
- 같은 모듈 내부에서는 구현 파일을 직접 import한다.
- 모듈 내부에서 자기 모듈의 `index.ts`를 다시 import하지 않는다.
- `index.ts`에는 외부에 필요한 API만 export하고 내부 helper를 무분별하게 노출하지 않는다.
- 상위 mega barrel(`services/index.ts` 등)은 만들지 않는다.
- Layer dependency와 module boundary가 코드 구조에서 드러나도록 유지한다.
- circular dependency를 만들지 않는다.


## 7. Source Architecture & Responsibility Rules

앞의 시스템 책임 경계를 소스 코드 배치에 적용하는 기준은 다음과 같다.

> Architecture is responsibility-first.

폴더는 사용 기술, 파일 수, 구조적 대칭성, 막연한 미래 재사용 가능성으로 나누지 않는다.
어떤 use-case가 책임을 소유하는지, 그 과정에서 어떤 역할을 하는지,
독립 capability인지, 외부 기술을 다루는 구현 세부사항인지 판단한다.

### 7.1 Top-level Placement

6절의 네 source 영역은 다음 기준으로 구분한다.

- `application`: 사용자의 목적을 실제 workflow로 수행한다. 현재 Planning의
  `GoalSpec → TaskContract`, Execution의 `TaskContract → ExecutionResult`가 여기에 속한다.
  두 use-case는 각각의 진입점을 가지며, 자동으로 연결된 하나의 실행 흐름을 의미하지 않는다.
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

#### Flow Implementation Grouping

flow의 책임이 늘어나면 세부 작업별로 한 단계의 하위 디렉터리를 둘 수 있다.
현재 Planning은 다음처럼 구분한다.

```text
flow/
├─ plan-task.ts
├─ orchestration/
├─ inspection/
└─ transformation/
```

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
구체적인 import 규칙은 6.2절을 따른다.

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
├─ application/
│  ├─ planning/
│  │  ├─ flow/
│  │  │  ├─ plan-task.ts
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
