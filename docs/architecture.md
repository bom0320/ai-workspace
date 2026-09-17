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
