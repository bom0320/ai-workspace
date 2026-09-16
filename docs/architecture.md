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