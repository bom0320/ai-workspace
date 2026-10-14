# AI Workspace Project Direction

이 문서는 North Star, Governance Ownership, Make vs Adopt, 설계 판단 기준과 외부 기술 도입 원칙의
canonical source다. 현재 사용법과 관찰 기록은 [README](../README.md), 구현 구조는
[Architecture](architecture.md), 다음 검증 질문은 [Roadmap](roadmap.md), Human 조작은
[CLI / Human Interface](cli-and-human-interface.md)에 둔다. 미래 원칙을 현재 기능으로 해석하지 않는다.

## What AI Workspace is

> AI Workspace는 개발자와 AI Coding Agent가 실제 Repository에서 함께 일하기 위한
> Agent Development Environment(ADE)이자 Development Governance Harness다.
> 기성 Coding Agent의 개발 능력을 다시 만드는 대신 개발자와 팀의 작업 방식·권한·검증 규칙을
> 코드화한다. 실제 Repository Evidence를 기반으로 Human이 판단 근거와 한계를 확인하도록 돕는다.

핵심 질문은 “Agent가 코딩을 할 수 있는가?”가 아니라 “Agent가 내가 원하는 개발 방식과 규칙 아래에서
일할 수 있는가?”다. 기존 Coding Agent의 능력과 통제 mechanism을 활용하되, 수정 범위·Repository
기준 상태·필수 검증·Evidence 인정 기준·Apply / Commit / Push 권한은 개발자와 팀의 policy로 명시한다.

```text
Coding Agent = 실제 개발 작업을 수행하는 주체
AI Workspace = Agent가 일하는 작업 환경 + 규칙 + 안전장치

범용 Agent 기능 → 기존 기술 활용
개발 Agent에 특화된 규칙 → AI Workspace가 직접 설계
```

### ADE와 Development Governance

ADE는 Agent가 어디에서, 어떤 Context와 도구를 가지고 Human과 개발하는지를 다룬다.
Development Governance는 그 환경에서 무엇을 허용하고, 무엇을 Evidence로 인정하며,
언제 Human에게 판단과 권한을 넘길지 정의한다. AI Workspace에서는 이 둘이 결합되어 있다.

```text
AI Workspace
├─ Agent Development Environment (ADE)
│  └─ Human과 AI Coding Agent가 실제 Repository에서 함께 일하는 환경
└─ Development Governance
   └─ 그 환경의 Authority / Context / Evidence / Verification / Human Approval 규칙
```

AI Workspace가 소유하는 Decision Assurance는 근거와 검증의 범위·한계를 드러내고 판단을 추적하도록
돕는 책임이다. 결정의 정확성을 보장한다는 뜻은 아니다. Agent 수보다 개발 행동과 판단의 신뢰 근거를
우선하며 Reliable Worker before Agent Team을 유지한다.

### 현재 구현과 확장 범위

현재 v0 Safe Execution, v1 Goal-to-Task Planning, v2 Governed Independent Decision이 구현되어 있다.
TaskContract와 승인 경계는 실행할 행동을, Snapshot / Context / Authority / AgentDecision과 Evidence
검증은 독립 판단의 조건을 명시한다. Planning 자체보다 실행 권한을 넘기기 전 explicit contract
boundary가 핵심이다. 상세 구현과 한계는 [Architecture](architecture.md#2-current-architecture)에 둔다.

현재 interface는 Node.js CLI이고 Agent integration은 외부 Codex CLI 하나다. 별도 GUI ADE,
여러 provider 지원, Decision comparison / synthesis, Human governance history는 현재 기능이 아니다.

현재는 Personal Development Harness에서 Custom ADE로 발전하는 단계다. 개인/팀 개발자의 작업
방식을 표현하는 것을 지향하되, 팀 공통 정책 배포와 Self-service Development Environment는 미구현이다.
향후 실제 요구에 따라 Personal ADE → Team AI Development Environment → Internal AI Development
Platform으로 일반화된다면 Platform Engineering 성격이 강화될 수 있다. 현재 완성된 ADE Platform이나
Platform Engineering 제품으로 규정하지 않는다.

## What AI Workspace is NOT

- 새로운 Coding Agent, 모델, Devin/Cursor clone
- 범용 Agent loop / workflow engine / Multi-Agent Framework / scheduler
- 범용 retry / guardrail / authorization engine / tracing backend
- 범용 memory / checkpoint / resume / durable execution / message transport
- generic tool protocol / terminal multiplexer / Agent process UI
- Agent personality framework, consensus chat 또는 CLI / TUI 자체를 목표로 하는 제품

현재 작은 application loop, process timeout, artifact 보존을 범용 엔진으로 확장하는 것이 목표는 아니다.
CLI는 operator/debug interface와 Human decision surface이며 core Governance Domain을 소유하지 않는다.

## Project Ownership Boundary

### AI Workspace가 직접 소유하는 의미

TaskContract, Repository execution boundary와 isolation / consistency rule, Context policy,
Specialist authority, Decision schema, Evidence semantics / provenance, Verification / Scope semantics,
Agreement / Conflict / Trade-off, Human approval / override / reject / escalation, decision traceability와
Single-Agent vs Governed Multi-Agent evaluation criteria는 프로젝트의 개발 도메인 책임이다.
이 목록에는 현재 구현과 미래 책임이 섞여 있으므로 구현 여부는 [모델 상태](architecture.md#6-current-and-conditional-domain-models)를 따른다.

구체적인 governance rule은 다음과 같다.

- 같은 비교 단위의 Specialist는 같은 Repository commit SHA를 기준으로 판단한다.
- Specialist의 Evidence는 실제 supplied Context 안에 존재해야 한다.
- Reviewer / read-only Specialist에는 Repository write authority를 부여하지 않는다.
- Conflict는 단순 문장·opinion 차이가 아닌 **evidence-backed disagreement**여야 한다.
- 최종 recommendation은 원래 AgentDecision / Evidence / Verification까지 추적 가능해야 한다.
- Human approval / override / reject는 서로 다른 권한과 의미이며 대상과 효과를 명시해야 한다.

마지막 세 항목의 comparison / synthesis / 확장된 Human governance는 미래 책임이다.
현재 v2 Evidence 존재·범위 검증이 이 책임 전체를 구현한 것은 아니다.

### 범용 메커니즘과의 경계

실행·저장·전송·관찰의 generic mechanism은 필요할 때 기존 기술을 먼저 평가한다.
AI Workspace는 governance semantics와 use-case의 순서·상태 제어를 소유하고, 외부 capability를
격리해 조합한다. 이를 위해 조직 역할, generic scheduler, retry engine, shared memory를 선행 구현하지 않는다.

## Build vs Adopt

이 문서의 **Make vs Adopt**는 다음 Build vs Adopt 원칙을 뜻한다.

> Build domain semantics. Adopt commodity infrastructure.
>
> Adopt when the problem exists, not because the tool exists.
>
> Keep governance ownership in the Harness.

Framework/SDK를 코어 orchestration의 주체로 먼저 도입하지 않는다. Harness가 Domain Language와
상태 제어를 정의한 뒤 범용 기능을 Library / Framework / Runtime / Infrastructure로 격리해 조합한다.
향후 외부 runtime이 실행 구조 일부를 맡더라도 Authority, Context, Evidence, Conflict, Human approval의
의미를 대신 정의해서는 안 된다.

순서는 Make vs Adopt 경계 정리 → v3 Domain 설계 → v3 구현 / E2E → 필요한 runtime spike 평가 →
v4부터 가치가 확인된 runtime의 선택적 채택이다. 모든 기술을 직접 만든 뒤 framework를 붙이는 전략도,
처음부터 framework의 domain model에 AI Workspace를 맞추는 전략도 아니다. 현재 필요한 commodity
capability는 v3 중에도 library로 활용할 수 있다.

### Library vs Framework / Runtime

| 구분 | 실행 흐름의 소유권 | 도입 판단 |
| --- | --- | --- |
| Library | Harness가 흐름을 계속 소유하며 필요한 capability만 호출 | 현재 필요가 생기면 기존 구현을 우선 평가해 사용 가능 |
| Framework / Runtime | Agent loop, workflow state, handoff, pause / resume 등 실행 구조 일부를 맡을 수 있음 | ownership과 실행 모델의 영향을 별도 architecture decision과 spike로 검증 |
| Infrastructure / Tool | 저장·관찰·policy evaluation·protocol·process 관찰 등의 수단 제공 | 실제 요구와 운영 부담, domain 경계 보존 여부로 선택 |

현재 Zod는 runtime schema validation library로 사용한다. Serialization / logging utility,
tracing instrumentation, retry utility, concurrency primitive도 필요가 생기면 평가할 library 예다.
이 목록이 현재 retry / concurrency 기능을 제공한다는 뜻은 아니다.

OpenAI Agents SDK는 단순 schema library가 아닌 Agent Runtime / Framework **평가 후보**다.
Pydantic AI 역시 단순 validation library로 분류하지 않으며 현재 TypeScript stack에 도입할 계획은 없다.
현재 사용하는 schema library는 Zod다.

### 외부 기술과의 관계 및 도입 시점

현재 stack은 Node.js, TypeScript, pnpm, tsx, Vitest, Zod와 외부 Codex CLI다.
OpenAI Agents SDK, OPA, Temporal, Restate, LangGraph, CrewAI, LangSmith는 현재 코드나
production dependency에 도입되어 있지 않다. 아래는 **채택 확정이 아닌 평가 시점과 후보**다.

| 범용 책임 | 현재 판단 | 평가가 필요한 조건 / 후보 |
| --- | --- | --- |
| Agent Runtime / Guardrails | 도입 보류 | tool-enabled Specialist 또는 종합·조율 역할이 실제로 필요할 때. v3 이후 OpenAI Agents SDK spike 등으로 평가하며 CEO / Coordinator Agent를 전제하지 않음 |
| Tracing / Observability | 현재 duration telemetry로 충분 | v3 이후 Specialist / Comparison / 제한된 Re-query 등 흐름이 복잡해질 때. 가장 빠른 외부 infrastructure 도입 후보이며 instrumentation과 backend를 구분. OpenTelemetry / LangSmith 등 평가 가능 |
| Generic policy evaluation | 현재 별도 engine 불필요 | Role × Action × Resource 권한 규칙이 동적이고 복잡해질 때 OPA 등 평가 |
| Durable workflow execution | 현재 요구에서는 확실히 불필요 | 장시간 Human approval, process/server restart 후 resume, multi-hour / multi-day workflow, durable scheduling / step retry / checkpoint가 실제 요구가 될 때 Temporal / Restate 등 평가 |
| Workflow / orchestration framework | 현재 도입·재작성 계획 없음 | 범용 실행 구조가 실제 문제일 때 LangGraph / Agent Framework / CrewAI 등 비교 가능 |
| Tool interoperability / process observation | 필요 시 검토 | MCP / tmux 등 도구를 활용할 수 있으나 자체 generic protocol이나 process UI를 제품 목표로 삼지 않음 |

AI Workspace는 이 기술들과 경쟁하는 범용 플랫폼을 만들지 않는다. 후보의 구체적 기능과 적합성은
실제 spike 시점에 조사한다. [Runtime Framework Evaluation](roadmap.md#runtime-framework-evaluation)의
진입·평가 조건을 통과하기 전에는 특정 runtime을 필수 dependency로 고정하지 않는다.

OPA가 필요해져도 “UX Specialist는 Repository write 불가”라는 Domain Rule은 AI Workspace가 정의한다.
OPA는 그 규칙의 representation / evaluation mechanism이 될 수 있고 runtime은 결과에 따라 action을
deny해야 한다. Engine 도입이 policy semantics나 실제 enforcement를 대신하지 않는다.

Agent RunState resume와 전체 Workflow durable execution도 구분한다. 개별 Agent 상태를 재개하는 것과
여러 단계·Human 대기·실패 후 재시작을 지속 실행하는 것은 다른 책임이다. 현재 CLI 실행, timeout 종료,
Execution artifact preservation을 durable execution이라고 부르지 않는다.

## Core Governance Principles

### 1. Authority & Boundary

권한 선언, runtime 통제 수단, Harness의 사후 검사를 구분한다. 현재 allowedPaths / forbiddenPaths는
Repository 상대 파일 경로의 정확한 문자열 일치다. Execution Scope Enforcement는 Worker와 Verification
이후 changed paths로 위반을 탐지하며 write-before prevention이나 완전한 sandbox가 아니다.

현재 Codex Specialist는 `read`와 `shellExecution: false`만 지원한다. 이 read는 제공 Context를 읽는 권한이며
target Repository filesystem 전체를 탐색하는 권한이 아니다. Reviewer / read-only 역할에 write 권한을
부여하지 않는 원칙은 향후 runtime에서도 선언과 실제 enforcement를 함께 검증해야 한다.

### 2. Right Agent × Right Context

Context의 범위·출처와 수정 권한을 구분한다. v2는 clean RepositorySnapshot을 capture하고 해당 commit의
Git blob을 읽으며, 모든 Specialist에 같은 Goal / commit SHA와 명시적 files를 제공한다. 다른 Specialist의
Decision을 Context에 넣지 않는다. 순차 실행이며 자동 Context selection이나 parallel execution은 없다.

Snapshot assert는 호출 시점의 HEAD / clean 상태 검사다. Repository lock이나 실행 중 모든 순간의
무변경 증명은 아니다. Snapshot의 provenance와 Specialist에게 제공한 Context가 무엇인지 함께 이해해야 한다.

### 3. Evidence over Claims

> Agent says "done" is not success evidence.

실행에서는 실제 diff / changed paths / verification command 결과를 근거로 삼는다. v2 Decision에서는
supplied Context에 대한 Evidence path exact match와 line 조건·범위를 확인한다. Worker output이나
Evidence description의 주장을 관찰 사실과 동일시하지 않는다.

Schema validation은 structural validity이며 semantic correctness나 hallucination 방지를 보장하지 않는다.
Evidence 존재·범위 검증도 description의 진실성이나 recommendation의 논리적 타당성을 증명하지 않는다.
Execution의 `passed`는 Scope와 구성된 Verification 및 실행 실패 여부에 관한 결과이며 자연어
objective / acceptance criteria 전체 충족의 증명이 아니다.

### 4. Explainable Governance

v3에서 Agreement / Conflict / Trade-off / uncertainty의 의미를 설계한다. 서로 다른 Concern이나 표현
차이를 Conflict로 취급하지 않고 Evidence에 근거한 disagreement인지 확인해야 한다. 근거 부족과 비교
불가능성도 표시해야 한다. 현재 v2는 독립 Decision을 표시할 뿐 비교·합의·종합하지 않는다.

v4의 recommendation은 원래 Decision / Evidence / Verification까지 추적 가능해야 한다.
종합 책임의 구현 방식은 runtime 평가 이후 선택하며 CEO라는 이름을 architecture commitment로 삼지 않는다.

### 5. Human Governance

Task Approval, Change Review, Apply, Commit, Push, Cleanup은 서로 다른 결정이다.
Task 승인이나 Review Continue는 후속 Git 작업의 포괄 승인이 아니다. 명시적 TaskContract JSON execute는
Planning / Task Approval을 거치지 않는 별도 경로다. v2 Decision은 변경 전달이나 승인 flow와 연결되지 않는다.

향후 approval / override / reject / escalation의 대상·권한·이유·효과를 구분해야 한다.
Human governance history와 장기 audit lifecycle은 미구현이며 현재 result.json은 후속 Human 이력 저장소가 아니다.

## Design Decision Filter

앞으로 새 기능과 기술 선택에는 다음 **세 질문을 공통 판단 기준**으로 사용한다.

### Question 1 — Domain Concept인가?

AI Workspace의 정체성이나 Development Governance 의미와 직접 연결되는가?
Same comparison unit → same commit SHA, Conflict → evidence-backed disagreement,
Reviewer → write authority 없음, Evidence → supplied Context / Repository observation 연결이 예다.

**그렇다면 AI Workspace가 직접 설계하고 구현한다.** 외부 기술로 실행해도 domain semantics는 넘기지 않는다.

### Question 2 — Commodity Technical Problem인가?

Agent Domain과 무관하게 대부분의 Software System에서 반복되는 범용 기술 문제인가?
Schema validation, serialization, retry, logging, tracing instrumentation, concurrency limit, timeout이 예다.

**그렇다면 기존 Library / Infrastructure를 먼저 평가한다.** 현재 요구에 필요한 capability만 사용하며
도구가 있다는 이유로 기능을 추가하지 않는다. 직접 구현이 필요하면 기존 기술의 부족한 경계나
검증할 연구 질문과 최소 범위를 기록한다.

### Question 3 — Execution Model을 바꾸는가?

Agent가 실행되고 멈추고 상태를 저장·재개하는 프로그램의 근본 실행 구조가 바뀌는가?
Agent loop, handoff, workflow state, pause / resume, checkpoint, durable execution, long-lived HITL이 예다.

**그렇다면 Framework / Runtime architecture decision으로 별도 평가한다.** 작은 spike에서 Harness control,
Context isolation과 coupling을 확인한다. 두 번째 runtime 구현의 실제 필요 전에는 generic SpecialistRunner,
provider registry, runtime abstraction layer를 미리 만들지 않는다.

세 질문은 배타적 분류가 아니다. Domain Rule을 library로 평가하거나 runtime으로 실행할 때도 의미의
소유권과 실행 모델의 영향을 각각 판단한다. 실제 결과로 검증할 수 있는 현재 최소 흐름부터 완성하며,
미래 재사용·역할명·폴더 대칭성만으로 abstraction을 만들지 않는다.
