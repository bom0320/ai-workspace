# AI Workspace Roadmap

이 문서는 다음에 무엇을 검증할지 기록한다. North Star와 Make vs Adopt의 판단 기준은
[Project Direction](project-direction.md), 현재 구현과 모델은 [Architecture](architecture.md),
실행 방법과 관찰 기록은 [README](../README.md)에 둔다. 범용 Agent Framework 자체를 만드는 계획이
아니라 Human과 AI Coding Agent가 함께 개발하는 ADE의 governance capabilities를 검증하는 계획이다.

| 단계 | 검증 주제 | 상태 |
| --- | --- | --- |
| v0 | Safe Execution | Implemented |
| v1 | Goal-to-Task Planning | Implemented |
| v2 | Governed Independent Decision | Implemented |
| v3 | Agreement / Conflict — Structured Decision Comparison | Next / Planned |
| Architecture checkpoint | Runtime Framework Evaluation | Planned, v3 구현 / E2E 이후·v4 구현 방식 선택 전 |
| v4 | CEO Governance / Explainable Synthesis / Human Governance | Planned, 별도 CEO Agent는 미확정 |
| v5 | Evaluation | Planned |

## v0 — Safe Execution

> Agent에게 실제 Repository 변경을 맡기면서 Human이 정한 행동 경계를 시스템이 강제할 수 있는가?

상태: **Implemented**.

TaskContract, isolated Git worktree, Scope Enforcement, Verification, Evidence와 artifact preservation이
Development action governance의 기반이다. 명시적 TaskContract JSON 실행은 이후 버전에서도 유지한다.
Scope는 Worker / Verification 후 실제 changed paths의 위반 탐지이며 쓰기 전 차단이 아니다.
Verification 통과도 자연어 acceptance criteria 전체의 증명은 아니다.
상세 한계는 [README](../README.md#v0--v1의-판단-범위와-제한)를 따른다.

## v1 — Goal-to-Task Planning

> Human Goal을 바로 실행하지 않고 명시적 계약으로 변환한 뒤 Human approval을 거칠 수 있는가?

상태: **Implemented**.

GoalSpec, repository inspection, adaptive planning / Fast Path, Codex Planner와 Planning loop,
TaskDraft → TaskContract, Human constraints preservation, Human Task Approval을 제공한다.
Planning 자체보다 실행 전 explicit contract boundary가 핵심이다. Zod는 structural validity를 검증한다.
Goal flow의 Task Approval과 실행 후 Review / Apply / Commit / Push / Cleanup을 구분한다.
명시적 JSON execute는 Planning / Task Approval을 거치지 않는 별도 경로다.

## v2 — Governed Independent Decision

> 동일 RepositorySnapshot과 Goal, 제한된 Context / authority 아래 Specialist들의 독립 판단을 구조화하고 근거를 확인할 수 있는가?

상태: **Implemented**. 실제 interactive Codex E2E도 확인되었으며 단일 관찰 기록은
[README의 v2 E2E](../README.md#v2-실제-e2e-기록)에만 둔다.

RepositorySnapshot, commit 기반 Context loading, SpecialistDefinition / Authority / Context,
Zod 기반 AgentDecision / EvidenceReference와 Codex Specialist runtime이 구현되었다.
`runDecision()`은 명시적 파일과 Frontend / UX 역할을 구성하고 `runIndependentDecisions()`로 연결한다.
현재 CLI는 두 Specialist를 순차 실행하며 같은 Goal / commit과 supplied files를 제공한다.

### 확인된 조건과 한계

- Clean Repository에서 Snapshot을 capture하고 해당 commit의 Git blob에서 Context를 읽는다.
- 각 Specialist 실행 전후 Snapshot을 assert하며 다른 Specialist의 Decision을 Context에 넣지 않는다.
- Runtime은 read-only / context-only authority와 제한된 capability 설정으로 실행한다.
- Harness가 Specialist identity를 주입하고 strict JSON schema 및 supplied Context의 Evidence path / line을 검증한다.
- 실패 시 이후 실행을 중단하며 partial result를 반환하지 않는다. 결과는 터미널에 표시한다.
- Same Goal / Same Snapshot / Limited Context / Read-only Authority / Independent Decisions /
  Structured AgentDecision / Validated Evidence / CLI integration이 연결되었다.

현재 Comparison / Synthesis, 병렬 실행, 자동 Context selection, discussion, Decision persistence는 없다.
Snapshot assert는 시점 검사이며 lock이 아니고 Evidence 존재 검증은 판단 정확성 검증이 아니다.
정확한 runtime 경계는 [Architecture](architecture.md#4-current-responsibility-boundaries)에 둔다.

## Cross-cutting Foundation

기존 별도 Planned Foundation의 Repository provenance, AgentDecision, EvidenceReference와 Context /
Authority 기반은 **v0–v2를 통해 부분적으로 확립**되었으므로 v2 앞의 별도 단계로 두지 않는다.
Execution artifacts와 메모리상의 Decision 결과를 장기 governance record 저장소로 혼동하지 않는다.

Human governance history, long-lived governance records는 아직 미구현이다. DecisionRound는 같은 Snapshot
아래 Decision을 묶는 고유 비교 단위가 실제로 필요할 때, DecisionRun은 Goal부터 Human governance
결과까지의 고유 audit lifecycle이 필요할 때만 검토한다. Framework run/session/step의 복제라면 만들지 않는다.
이름·schema·저장 backend를 미래 구현 약속으로 확정하지 않는다.

## v3 — Agreement / Conflict — Structured Decision Comparison

> Independent AgentDecision[]을 근거 중심으로 비교하여 Agreement / Conflict / Trade-off / Uncertainty를 표현할 수 있는가?

상태: **Next / Planned**. Multi-Agent 실행 자체보다 비교의 Domain Language가 과제다.

```text
Independent AgentDecision[]
           ↓
Structured Comparison
├─ Agreement
├─ Conflict
├─ Trade-off
└─ Uncertainty
```

### 먼저 답할 Domain 질문

- Agreement는 어떤 동일 문제·판단·Evidence 조건에서 성립하는가?
- Conflict는 어떤 조건에서 성립하며 표현 차이와 실제 판단 충돌을 어떻게 구분하는가?
- 서로 다른 Concern을 말하는 Decision은 충돌인가, 비교 대상이 다른가?
- Evidence가 다르면 어떻게 비교하고 근거의 차이를 드러내는가?
- Evidence 부족은 Conflict 대신 Uncertainty로 표시해야 하는가?
- Trade-off를 어떤 구조로 표현하고 비교 불가능한 Decision을 어떻게 표시하는가?

> Conflict는 단순 textual disagreement가 아니라 evidence-backed disagreement여야 한다.

### Exit Criteria

- 비교 단위·Concern·근거와 조건을 명시하고 Agreement / Conflict / Trade-off / Uncertainty의 의미를 검증한다.
- 비교 결과가 원래 Decision과 Evidence로 이어지고, 근거 부족·비교 불가능성을 표시한다.
- 알려진 실제 충돌, 표현만 다른 판단, 서로 다른 Concern, 불충분한 Evidence 사례로 유용성과 오류를 확인한다.
- 현재 독립 판단 입력에서 구조화된 비교 출력까지 E2E로 확인한다.

Agreement / Conflict / Trade-off schema와 ComparisonResult라는 이름은 아직 미확정이다.
CEO / Coordinator, free-form discussion, shared memory, consensus chat, generic graph runtime,
automatic conflict resolution, unbounded re-query, OPA / Temporal 도입이나 LangGraph / CrewAI 재작성은
v3 구현 목표로 확정하지 않는다. 필요 범위를 Domain 설계에서 먼저 정한다.

## Runtime Framework Evaluation

상태: **향후 architecture checkpoint**. 별도 제품 version이나 현재 구현 작업이 아니다.

Make vs Adopt 경계 정리 → v3 Domain 설계 → v3 구현 / E2E → 작은 runtime spike →
v4부터 가치가 확인된 runtime의 선택적 채택 순서를 따른다.

> v3까지 AI Workspace의 Domain Language를 확정하고, v4부터 범용 Agent Runtime 문제가 실제로
> 등장하는 시점에 Framework를 평가·도입한다.

실행 모델을 맡길 구체적인 요구가 있어야 채택한다. 모든 범용 기술을 직접 만든 뒤 붙이는 전략도,
처음부터 framework의 domain model에 맞추는 전략도 아니다. 필요한 library는 v3 중에도 평가·사용할 수 있다.
공통 판단 기준은 [Design Decision Filter](project-direction.md#design-decision-filter)를 따른다.

예를 들어 향후 `spike/agents-sdk-runtime` 같은 격리된 실험에서 현재 `runCodexSpecialist()`와 같은
Domain Input / Output 책임을 가진 Agents SDK prototype을 비교할 수 있다. 이 branch나 prototype은
아직 만들지 않았고 OpenAI Agents SDK를 채택한 것도 아니다.

### 평가 기준

- Harness control ownership과 Domain Input / Output 보존
- Context isolation, structured output, tool governance와 guardrails
- Tracing, HITL과 실제 workflow 요구 충족 여부
- Framework coupling, runtime complexity, performance, maintainability

가치가 확인되지 않으면 현재 구현을 유지한다. 두 번째 runtime의 실제 필요 전에는 generic
SpecialistRunner interface, provider registry, runtime abstraction layer를 만들지 않는다.
기술별 평가 시점은 [도입 원칙](project-direction.md#외부-기술과의-관계-및-도입-시점)에 둔다.

## v4 — CEO Governance / Explainable Synthesis / Human Governance

> Comparison 결과로 설명 가능한 recommendation을 만들고 Human이 판단할 대상과 이유를 드러낼 수 있는가?

상태: **Planned**. CEO Governance는 종합 책임을 가리키며 별도 CEO Agent 구현이 성공 기준은 아니다.

```text
Decision Comparison
→ Evidence-backed recommendation
→ Unresolved conflict / trade-off / uncertainty 표시
→ 필요한 Human escalation
→ approve / override / reject
```

### Exit Criteria

- Recommendation이 원래 AgentDecision / Evidence / 관련 Verification까지 추적 가능하다.
- 해결되지 않은 충돌, 근거 부족, scope / authority 변경 등 escalation 조건을 설명한다.
- Approve / override / reject의 대상·권한·이유·결과를 구분한다.
- 기존 Task Approval / Change Review / Apply / Commit / Push의 권한 분리와 Human merge / release 권한을 보존한다.

구현은 deterministic function, single LLM call, Agents SDK runtime, framework supervisor, 별도 CEO Agent
중 미정이다. v3 이후 평가 결과와 tool guardrail / HITL 등의 실제 요구로 선택한다.
Coordinator나 Staffing을 독립 조직 runtime으로 만드는 약속도 아니다.

## v5 — Evaluation

> 어떤 조건에서 Governed Multi-Agent가 Single-Agent 대비 판단 품질과 Human 신뢰에 기여하며, 비용은 무엇인가?

상태: **Planned**. Multi-Agent 우위를 가정하지 않는다.

동일 Repository 기준, Goal, Context / authority, verification과 평가 조건을 명시한다.
Agent 수 외에 모델·Context·예산이 다르면 차이를 기록하고 효과를 혼동하지 않는다.

### Exit Criteria

- 재현 가능한 조건 아래 Single-Agent와 Governed Multi-Agent를 비교한다.
- Quality / acceptance 충족, verification pass rate, scope violation과 변경 범위의 적절성을 구분한다.
- Latency / token-cost / Human intervention / conflict detection value를 실제 데이터로 평가한다.
- 충돌 보고 수보다 유용한 발견과 오탐의 비용을 확인하고 이득이 없는 조건도 기록한다.

현재 duration telemetry와 단일 E2E 관찰은 있지만 이 비교 평가 전체는 미구현이다.
E2E 수치를 협업 우위나 생산성 보장의 증거로 사용하지 않는다.

## Later — Requirement-driven Infrastructure

OPA는 authority 규칙의 동적 복잡성이 증가할 때, Temporal / Restate는 장기 HITL, crash recovery,
durable scheduling / retry / checkpoint 요구가 생길 때만 평가한다. 현재 도입하지 않는다.
메모리상 Agent 상태 재개와 전체 workflow durability를 구분하며, domain records 보존을 generic durable
engine 구축으로 확대하지 않는다. Ownership과 시점은 Project Direction을 기준으로 판단한다.
