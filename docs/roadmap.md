# AI Workspace Roadmap

이 문서는 다음에 무엇을 검증할지 기록한다. North Star와 ownership / Build vs Adopt 기준은
[Project Direction](project-direction.md), 현재 구현과 domain model 채택 조건은
[Architecture](architecture.md), 사용법은 [README](../README.md)에 둔다.
버전은 검증 질문을 구분하며 미래 runtime이나 조직 Agent의 구현 약속이 아니다.
이 roadmap은 더 좋은 generic Agent Framework를 만드는 계획이 아니라 Human과 AI Coding Agent가
함께 개발하는 Agent Development Environment(ADE)의 governance capabilities를 검증하는 계획이다.
ADE 관점은 기존 단계의 목적을 설명하며 별도 단계나 플랫폼 구현을 추가하지 않는다.

| 단계 | 검증 주제 | 상태 |
| --- | --- | --- |
| v0 | Safe Execution | Implemented |
| v1 | Goal-to-Task Planning | Implemented |
| Foundation | Governance Decision Records | Planned |
| v2 | Governed Independent Decisions | Planned |
| v3 | Decision Comparison | Planned |
| v4 | Explainable Synthesis / Human Governance | Planned |
| v5 | Evaluation | Planned |

## v0 — Safe Execution

> Agent에게 실제 Repository 변경을 맡기면서 Human이 정한 행동 경계를 시스템이 강제할 수 있는가?

상태: **Implemented**. Development action governance의 기반이다.

TaskContract, isolated Git worktree, Scope Enforcement, Verification, Evidence와 artifact preservation을
제공한다. Agent의 자기 보고만으로 성공을 판단하지 않고 실제 변경과 명령 결과를 보존한다.
명시적 TaskContract JSON 실행 경로는 v1에서도 유지한다.

여기서 Scope Enforcement는 파일 쓰기 전 차단이 아니라 시작 commit 대비 실제 changed paths에
대한 위반 탐지다. Worker 이후 Scope가 통과하면 Verification을 실행하고 이후 Scope를 다시 검사한다.
`passed`는 실행 실패 없이 Scope와 구성된 Verification을 통과한 결과이며 자연어 acceptance criteria
전체를 증명하지 않는다. 격리·검증·artifact 보존의 상세 한계는 [README](../README.md#v0--v1의-판단-범위와-제한)를 따른다.

## v1 — Goal-to-Task Planning

> Human Goal을 바로 실행하지 않고 명시적이고 검증 가능한 TaskContract로 변환한 뒤 Human approval을 거칠 수 있는가?

상태: **Implemented**. 실행 권한을 넘기기 전 explicit contract boundary를 만든다.

GoalSpec, repository inspection, adaptive planning / conservative Fast Path, Codex Planner와 Planning loop,
TaskDraft → TaskContract, Human constraints preservation, Human Task Approval을 제공한다.
Harness가 ID와 Goal의 targetRepository를 확정하고 Human constraints를 보존한다.
Zod validation은 계약의 structural validity이며 semantic correctness 보장은 아니다.

확실한 단일 textual edit는 0-round Fast Path를 사용하고 나머지는 Planner로 fallback한다.
Goal flow는 승인 전 실행하지 않으며 명시적 JSON execute 경로는 별도 Task Approval을 거치지 않는다.
실행 후 Change Review / Apply / Commit / Push / Cleanup은 서로 다른 결정으로 제공된다.
Planning 자체를 범용 planning engine의 차별점으로 과장하지 않는다.

## Foundation — Governance Decision Records

> 판단의 Repository 기준, Evidence와 Human 결정 근거를 실행 로그와 구분하여 추적할 수 있는가?

상태: **Planned**. 범용 Durable Shared State를 자체 구현하는 단계가 아니다.

우선 필요한 것은 repository provenance, structured AgentDecision, Evidence references,
Human governance history다. 현재 base commit / patch / result.json은 출발점이지만 Decision 모델이나
후속 Human 이력 저장소는 아니다. 저장되는 개발 도메인 의미와 generic persistence mechanism을 구분한다.

### Exit Criteria

- RepositorySnapshot이 기준 commit과 비교에 영향을 주는 실제 상태·Context 출처를 식별할 수 있다.
- AgentDecision의 recommendation / evidence references / risk / uncertainty를 구조화할 수 있다.
- Evidence reference가 실제 repository observation 또는 verification 결과까지 이어진다.
- Human 결정의 대상·권한·이유·결과를 추적하며 Repository rollback과 판단 이력 보존을 구분한다.
- DecisionRound / DecisionRun은 각각 비교 단위 / audit lifecycle의 고유 의미가 필요할 때만 채택한다.
  단순 runtime step / session ID의 복제라면 만들지 않는다.

저장 형식·backend·ID 설계는 미정이다. Database, generic memory, queue, scheduler,
checkpoint / crash resume, automatic retry / rollback을 선행 구현하지 않는다.

## v2 — Governed Independent Decisions

> 동일 Repository state와 명시된 Context / authority 조건 아래 여러 Specialist의 판단을 독립적이고 추적 가능한 record로 만들 수 있는가?

상태: **Planned**. Multi-agent scheduling이나 parallel execution 자체는 목표가 아니다.

같은 비교 단위의 Specialist가 같은 RepositorySnapshot을 기준으로 판단하고, 서로의 Decision을
보기 전에 독립 record를 생성하는 조건을 검증한다. Context는 역할과 Task에 필요한 범위로 제공하고
출처를 기록한다. 전체 대화 로그의 공유를 협업 기반으로 삼지 않는다.

### Exit Criteria

- 2개 이상의 Specialist 판단이 동일 commit과 비교 가능한 실제 Repository state에 연결된다.
- 각 역할의 Context / authority 조건과 독립 판단 여부를 확인할 수 있다.
- Reviewer 역할에는 Repository write authority가 없다. Prompt 설명과 실제 enforcement를 구분한다.
- 각 결과가 AgentDecision으로 기록되고 Evidence provenance와 uncertainty를 추적할 수 있다.
- 순차 실행으로도 domain 조건을 검증할 수 있다. 병렬 scheduling이 필요하면 기존 기술을 먼저 평가한다.

Specialist 수, 역할 목록, runtime과 호출 방식은 미정이며 별도 Coordinator 구현을 전제하지 않는다.

## v3 — Decision Comparison

> 동일 문제의 독립 Decision들을 Evidence 기준으로 비교하여 Agreement / Conflict / Trade-off / uncertainty를 설명할 수 있는가?

상태: **Planned**.

Conflict는 단순 문장 차이가 아니라 incompatible recommendation, evidence 해석 또는 trade-off의
충돌이다. 비교 조건이 다른 Decision이나 근거 부족을 억지로 합의·충돌로 분류하지 않는다.

### Exit Criteria

- Agreement / Conflict / Trade-off / uncertainty가 원래 Decision과 비교 대상 문제에 연결된다.
- Evidence의 출처·검증 범위·충분성 차이를 표현하고 비교 불가능한 조건을 표시할 수 있다.
- Raw response 나열보다 Human 판단에 필요한 차이를 설명할 수 있다.
- 알려진 충돌과 표현만 다른 사례로 분류의 유용성과 오류를 확인한다.

## v4 — Explainable Synthesis / Human Governance

> 여러 Decision과 Evidence를 종합한 recommendation의 근거와 Human 판단이 필요한 이유를 설명할 수 있는가?

상태: **Planned**. CEO Agent 구현 자체를 성공 기준으로 삼지 않는다.

Evidence 기반 recommendation, conflict / trade-off, unresolved uncertainty, escalation과
Human approve / override / reject를 다룬다. 종합 책임은 필요하지만 구현은 deterministic function,
하나의 LLM call, framework supervisor, 별도 Agent 중 나중에 선택한다.

### Exit Criteria

- Recommendation이 원래 AgentDecision / Evidence / Verification까지 추적 가능하다.
- 해결되지 않은 conflict, 근거 부족, scope / authority 변경 등 Human escalation 조건을 설명한다.
- Human approve / override / reject의 대상과 이유를 기록하고 후속 권한과 구분한다.
- 기존 Task Approval / Change Review / Apply / Commit / Push의 권한 분리를 보존한다.
- Human merge / release authority를 대체하지 않으며 구현 방식의 이득과 비용을 확인한다.

CEO / Staffing / Control Plane / Coordinator를 독립 조직 runtime으로 구현하는 목표는 두지 않는다.

## v5 — Evaluation

> 어떤 작업과 조건에서 Governed Multi-Agent가 Single-Agent 대비 판단 품질과 Human 신뢰에 기여하며, 그 비용은 무엇인가?

상태: **Planned**. Multi-Agent 우위를 가정하지 않는다.

동일한 Repository 기준, Goal, Context / authority 조건, verification과 평가 기준을 명시한다.
Agent 수 외에 모델·Context·예산이 달라지는 경우 그 차이를 기록하고 효과를 혼동하지 않는다.

### Exit Criteria

- Single-Agent와 Governed Multi-Agent를 재현 가능한 비교 조건 아래 평가할 수 있다.
- Quality / acceptance 충족 평가, verification pass rate, scope violation, 변경 범위의 적절성을 구분한다.
- Latency, token-cost, Human intervention과 conflict detection value를 실제 데이터로 평가한다.
- 충돌을 더 많이 보고하는 것만으로 성공을 판단하지 않고 유용한 발견과 오탐의 비용을 확인한다.
- 이득이 없거나 비용이 더 큰 조건도 기록해 Single-Agent 유지 여부를 판단할 수 있다.

현재 duration telemetry와 README의 관찰된 E2E 기록은 있지만 이 비교 평가 전체는 미구현이다.
README 수치를 Multi-Agent 효과나 일반적인 생산성 보장의 증거로 사용하지 않는다.

## Cross-cutting Adoption Checkpoint

각 단계에서 generic infrastructure 필요가 생기면 custom implementation 전에
[Design Decision Filter](project-direction.md#design-decision-filter)를 적용한다.

- 현재 막힌 검증 질문과 필요한 범용 capability를 먼저 기록한다.
- 기존 framework / library / infrastructure / tool 후보가 domain boundary를 보존하는지 평가한다.
- Framework의 run / step / checkpoint를 그대로 domain model로 복제하지 않는다.
- 실제 요구가 없으면 도입을 미룬다. 직접 구현은 고유한 governance 의미나 연구 질문을 근거로 제한한다.
- Process crash recovery / durable scheduling / resumable workflow가 필요해지면 기존 실행 기반을 평가한다.
  Governance records의 보존을 generic durable execution engine 구축으로 확대하지 않는다.

후보 기술 목록은 Project Direction에서만 관리한다. 특정 vendor, 저장소, runtime, supervisor 방식은
현재 필수 dependency가 아니며 이번 roadmap으로 채택하지 않는다.
