# AI Workspace Roadmap

이 문서는 다음에 무엇을 검증할지 기록한다. 프로젝트의 이유는
[Project Direction](project-direction.md), 현재 구현은 [Architecture](architecture.md),
사용법은 [README](../README.md)에 둔다. 버전은 검증 질문을 구분하며 모든 기능이
동시에 구현됐다는 의미가 아니다.

| 단계 | 검증 주제 | 상태 |
| --- | --- | --- |
| v0 | Safe Execution | Implemented |
| v1 | Goal-to-Task Planning | Implemented |
| Foundation | Durable Shared State | Planned |
| v2 | Independent Specialist Decisions | Planned |
| v3 | Conflict / Agreement | Planned |
| v4 | CEO Governance | Planned |
| v5 | Evaluation | Planned |

## v0 — Safe Execution

> Agent 하나에게 실제 Repository 작업을 안전하게 맡길 수 있는가?

상태: **Implemented**.

TaskContract, isolated worktree, scope enforcement, verification, evidence가 기반이다.
변경과 검증 결과를 보존하며 Agent의 자기 보고만으로 성공을 판단하지 않는다.
명시적 TaskContract JSON 실행 경로는 v1에서도 유지한다.

## v1 — Goal-to-Task Planning

> Human이 TaskContract를 직접 작성하지 않고 Goal만 줘도 안전한 실행 계약을 만들 수 있는가?

상태: **Implemented**.

GoalSpec, repository inspection, Planner / Planning loop, conservative adaptive Fast Path,
TaskDraft → TaskContract 변환, Human Task Approval, Review / Delivery를 제공한다.
단순한 textual edit는 0-round Fast Path를 사용하고 나머지는 기존 Planner로 fallback한다.
실행 전 승인과 실행 후 Review / Apply / Commit / Push / Cleanup을 구분한다.

## Foundation — Durable Shared State

> 이전 Round의 판단과 실행 결과를 보존하고 다음 Round가 필요한 상태를 활용할 수 있는가?

상태: **Planned**. 별도 제품 목표가 아니라 멀티에이전트 협업을 위한 기반이다.

Run / Round, Decision, Evidence, Failure, Outcome을 구조화된 공통 상태로 유지해
다음 Round가 이전 판단과 실행 결과를 활용하게 만드는 것이 목적이다.
향후 복구 판단이나 다음 Round의 입력으로 사용할 수 있는 기반을 마련한다.

> Repository state can rollback.
> Decision history should not disappear.

Verification 실패 후에도 이전 Agent 판단, 선택된 결정, 실행 결과, 실패 Evidence를
다음 Round가 사용할 수 있어야 한다. 현재 artifact persistence는 개별 실행의 기록이며,
이런 구조화된 공통 판단 이력이나 다음 Round 활용 flow를 구현한 것은 아니다.

초기 Foundation 범위에는 process crash resume, database, queue, distributed execution,
automatic rollback, automatic retry를 포함하지 않는다.

### Exit Criteria

- 하나의 Run 안에서 Round별 Decision / Evidence / Failure / Outcome을 구조적으로 보존할 수 있다.
- 다음 Round가 이전 Round의 필요한 상태를 참조할 수 있다.
- Repository rollback 여부와 관계없이 판단 이력은 유지된다.

## v2 — Independent Specialist Decisions

> 동일한 Goal에 대해 서로 다른 전문 Agent가 독립적으로 판단하게 만들 수 있는가?

상태: **Planned**.

Shared repository snapshot, context isolation, authority isolation, structured AgentDecision,
independent reasoning을 다룬다. Specialist는 서로의 답을 보지 않고 판단한다.
전체 Repository나 모든 Agent의 대화 로그를 Context로 공유하는 방식은 목표가 아니다.

### Exit Criteria

- 동일한 repository snapshot을 기준으로 2개 이상의 Specialist가 독립적으로 판단할 수 있다.
- Specialist는 다른 Specialist의 Decision을 보지 않고 판단한다.
- 각 판단 결과가 공통 AgentDecision 구조로 저장된다.
- Agent별 authority / context 경계가 명시된다.

## v3 — Conflict / Agreement

> 두 Agent의 판단 차이를 긴 대화 로그가 아니라 구조화된 데이터로 표현할 수 있는가?

상태: **Planned**.

Agreement, Conflict, Uncertainty, Trade-off를 표현하고 비교한다. 단순히 두 응답을
나란히 출력하는 것보다, 어떤 판단이 어디에서 일치하거나 충돌하는지 기록하는 것이 핵심이다.

### Exit Criteria

- 여러 AgentDecision 간 Agreement / Conflict / Uncertainty / Trade-off를 구조화해 표현할 수 있다.
- Raw response를 단순 나열하지 않고 판단 차이를 데이터로 비교할 수 있다.

## v4 — CEO Governance

> 여러 Agent 판단과 Evidence를 종합해 하나의 설명 가능한 결정을 만들 수 있는가?

상태: **Planned**.

Decision synthesis, evidence-based recommendation, failure history, escalation,
Executive Report를 다룬다. CEO는 super coder가 아니라 governance 역할이며,
Human의 승인·override·merge/release 권한을 대체하지 않는다.

### Exit Criteria

- 여러 Decision과 Evidence를 기반으로 하나의 recommendation을 만들 수 있다.
- Recommendation의 근거를 원래 Decision / Evidence까지 추적할 수 있다.
- Human approval / override / merge / release authority는 유지된다.

## v5 — Evaluation

> Governed Multi-Agent가 Single Agent보다 실제로 더 나은가?

상태: **Planned**.

비교 항목 후보는 success rate, verification pass rate, scope violation, changed files
precision, latency, token/cost, retries, conflict detection, Human intervention, result quality다.
측정 기준과 비교 조건을 정의하고 Single / Multi-Agent의 이득과 비용을 함께 평가한다.

현재는 duration telemetry가 있으며 위 항목 전체의 수집·비교가 구현된 것은 아니다.
측정하지 않은 비용 절감률이나 생산성 수치를 주장하지 않는다. Multi-Agent가 항상
Single Agent보다 낫다고 가정하지 않으며, 기존 README E2E 기록도 협업 효과의 증거가 아니다.

### Exit Criteria

- Single Agent와 Governed Multi-Agent를 동일한 조건에서 비교할 수 있다.
- Success rate, verification pass rate, scope violation, latency, token/cost 등 핵심 metric을 실제 데이터로 수집할 수 있다.
- Multi-Agent의 이득과 비용을 함께 평가할 수 있다.
