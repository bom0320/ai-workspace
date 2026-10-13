# AI Workspace Project Direction

이 문서는 AI Workspace의 North Star와 ownership boundary, 설계 판단 기준의 canonical source다.
현재 사용법은 [README](../README.md), 실제 구현과 책임 배치는 [Architecture](architecture.md),
검증 단계는 [Roadmap](roadmap.md), Human 접점은 [CLI / Human Interface](cli-and-human-interface.md)에 둔다.
아래 원칙과 미래 domain model이 모두 구현됐다는 뜻은 아니다.

## What AI Workspace is

> AI Workspace는 기존 AI Coding Agent / Agent Runtime 위에서 개발 Agent의 행동과 판단을
> 개발 도메인의 규칙으로 통제하고, 실제 Repository Evidence를 기반으로 Human이
> 신뢰 가능한 결정을 내리도록 돕는 Development Governance Harness다.

Agent를 더 많이 실행하는 것보다 Agent의 개발 행동과 판단을 더 신뢰할 수 있게 만드는 것이 목적이다.
Agent Framework / Runtime이 Agent를 어떻게 실행할지 다룬다면, AI Workspace는 무엇을 허용하고,
무엇을 Evidence로 인정하며, 어떤 조건에서 Human에게 결정을 넘길지 정의한다.

현재 v0 / v1의 TaskContract, 격리된 Git worktree, Scope / Verification / Evidence와
Human approval은 이 방향의 기반이다. Planning의 가치는 새로운 planning engine 자체가 아니라,
Human Goal을 바로 실행 권한으로 바꾸지 않고 명시적인 계약과 승인 경계를 만든다는 데 있다.
Reliable Worker before Agent Team을 유지하며, 여러 Agent의 필요성과 효과는 평가로 판단한다.

## What AI Workspace is NOT

- 새로운 Coding Agent, 모델, Devin/Cursor clone
- 범용 Multi-Agent Framework, workflow engine, scheduler, message transport
- 범용 memory, checkpoint/resume, durable execution 또는 policy engine
- tracing platform, generic tool protocol, terminal multiplexer, Agent process UI
- multi-agent chat demo, personality framework, CLI / TUI 자체를 목표로 하는 제품

CLI는 governance의 operator/debug adapter와 Human decision surface다.
Runtime이나 UI의 풍부함이 governance의 정확성과 효과를 대신하지 않는다.

## Project Ownership Boundary

### AI Workspace가 소유하는 개발 도메인 의미

| 영역 | 프로젝트가 정의하고 검증할 책임 | 현재 구현 / 미래 범위 |
| --- | --- | --- |
| Contract / Authority | TaskContract, Repository execution boundary, allowedPaths / forbiddenPaths와 Scope 의미 | v0/v1 구현. Specialist authority policy는 미래 |
| Isolation / Provenance | Repository isolation policy, RepositorySnapshot과 repository consistency rule | worktree와 base commit 기록은 구현. 비교 판단용 Snapshot은 미래 |
| Context | 조사 Context와 수정 권한의 구분, 역할·Task별 Context policy | inspection policy와 제한된 warm-start 구현. Specialist별 정책은 미래 |
| Decision / Evidence | AgentDecision schema, Evidence semantics / provenance, Verification 의미 | 실행 Evidence와 command verification 구현. Decision과 Evidence reference는 미래 |
| Comparison / Synthesis | Agreement / Conflict / Trade-off / uncertainty, 근거를 추적할 수 있는 recommendation | 미래 |
| Human Governance | approval / override / escalation 의미, 권한 분리, decision traceability | 현재 Task Approval / Review / Delivery / Cleanup. override·escalation·이력 모델은 미래 |
| Evaluation | Single-Agent와 Governed Multi-Agent를 비교하는 조건과 판단 기준 | duration telemetry 구현. 비교 평가는 미래 |

이 표는 ownership의 범위이며 미래 모델의 이름이나 필드를 확정한 구현 명세가 아니다.
AgentDecision은 자유 형식 답변이 아니라 recommendation, evidence references, risk, uncertainty를
후속 governance에 사용할 수 있는 structured decision record로 정의할 계획이다.
현재 PlannerDecision은 inspect / complete protocol이며 이 AgentDecision과 다른 개념이다.

### 기본적으로 직접 만들지 않는 범용 기능

Generic agent runtime, workflow graph, multi-agent scheduling / parallel execution, message passing,
generic memory, checkpoint engine, durable workflow execution, tracing backend, generic authorization /
policy engine, tool protocol, terminal multiplexer는 기존 기술을 먼저 평가한다.
현재의 작은 Planning loop, process timeout, artifact persistence는 필요한 실행 흐름을 연결하는
구현이며, 이를 범용 엔진으로 확장하는 것을 목표로 삼지 않는다.

외부 기술이 실행을 맡더라도 허용 권한, Evidence 인정 기준, repository consistency,
Human gate의 의미는 프로젝트가 소유한다. 저장·전송·스케줄링 메커니즘과 저장되는 기록의
개발 도메인 의미를 구분한다.

## Build vs Adopt

> Build domain semantics. Adopt commodity infrastructure.
>
> Adopt when the problem exists, not because the tool exists.

개발 도메인 규칙은 직접 설계·구현한다. 범용 runtime / infrastructure 문제는 기존 기술을 먼저
평가한다. 도입이 governance 의미를 보존하는지 확인하고, 현재 필요하지 않은 framework를
미리 추가하지 않는다. 직접 구현이 필요한 경우에도 기존 기술이 충족하지 못하는 경계나
검증할 연구 질문, 최소 범위를 기록한다.

### Existing Framework / Runtime / Tool과의 관계

AI Workspace는 외부 기술을 경쟁 대상으로 삼지 않는 development governance layer다.
다음은 책임과 위임 관계이며 현재 dependency graph나 필수 stack이 아니다.

```text
Human: Goal / constraints / approvals / review
                    ↕
AI Workspace: development governance semantics
       ├─ 실행 위임 → Agent Framework / Runtime
       └─ 관찰·검증 → Execution Infrastructure → Repository
                    ↑
             Decision / Evidence
```

Framework는 workflow와 실행 구조, library는 특정 capability, infrastructure는 지속 실행·저장·관찰의
운영 기반, tool은 protocol이나 개발자 작업 수단을 제공할 수 있다. 구분보다 실제 책임을 기준으로
선택하며, framework의 run/step을 domain model로 그대로 복제하지 않는다.

| 실제 문제가 생겼을 때 평가할 범용 책임 | 후보 기술 예시 — 미도입 |
| --- | --- |
| Orchestration / workflow | LangGraph / Agent Framework |
| Agent runtime / guardrails / HITL | OpenAI Agents SDK |
| Policy evaluation | OPA |
| Durable execution / crash recovery | Temporal / Restate / framework checkpoint 기능 |
| Observability | OpenTelemetry / LangSmith |
| Tool interoperability | MCP |
| Developer process observation | tmux 등 |

후보는 비교 출발점일 뿐 채택 결정이나 기능 보장이 아니다. LangGraph의 workflow, OPA의 generic
policy evaluation, Temporal의 durable execution, LangSmith의 tracing, tmux/Orca의 Agent process UI를
자체 제품 목표로 재구현하지 않는다. 후보의 적합성은 실제 요구가 생길 때 다시 조사한다.

현재 stack은 Node.js, TypeScript, pnpm, tsx, Vitest, Zod이며 Agent integration은 외부 Codex CLI다.
위 후보 framework / infrastructure는 package.json과 현재 코드에 도입되어 있지 않다.

## Core Governance Principles

### 1. Authority & Boundary

읽기·수정·실행 권한은 명시하고, runtime이 제공하는 통제 수단과 Harness의 검사를 구분한다.
현재 allowedPaths / forbiddenPaths는 Repository 상대 파일 경로의 정확한 문자열 일치다.
Scope Enforcement는 Worker 이후와 Verification 이후 실제 changed paths로 위반을 탐지하며,
파일 쓰기를 사전에 막는 완전한 sandbox가 아니다.

미래 Reviewer 역할에는 Repository write authority를 부여하지 않는다. 이 규칙은 prompt의
역할 설명만으로 충족됐다고 보지 않고 runtime 권한 설정과 실제 관찰로 확인해야 한다.

### 2. Right Agent × Right Context

역할과 Task에 필요한 Context와 그 출처를 명시한다. Inspection 대상과 수정 허용 경로는 다른
권한이다. 현재 repository inspection과 제한된 Worker warm-start는 기반이며 완전한
role-aware context routing은 구현되어 있지 않다.

미래 같은 비교 단위의 Specialist는 동일 Repository commit을 기준으로 판단해야 한다.
Commit만 같아도 dirty files나 제공 Context가 다르면 같은 조건이 아닐 수 있으므로,
RepositorySnapshot에는 비교에 영향을 주는 실제 상태와 Context provenance를 연결해야 한다.
실행 중 기준이 바뀌면 서로 비교 가능한 판단인지 다시 확인한다.

### 3. Evidence over Claims

> Agent says "done" is not success evidence.

실제 Repository observation, diff, changed paths, verification command 결과와 exit code를
판단 근거로 삼는다. Worker output도 보존하지만 그 안의 주장을 관찰 사실과 동일시하지 않는다.
Decision이 사용한 Evidence는 실제 observation 또는 verification 결과까지 추적 가능해야 한다.

Zod schema validation은 structural validity를 검사하며 semantic correctness나 hallucination 방지를
보장하지 않는다. 현재 `passed`는 실행 실패 없이 Scope와 구성된 Verification을 통과한 결과이지,
자연어 objective / acceptance criteria 전체의 충족 증명이 아니다.

### 4. Explainable Governance

미래 Agreement / Conflict / Trade-off는 동일 문제에 대한 recommendation과 Evidence를 비교하는
모델이다. Conflict는 문장 표현의 차이가 아니라 incompatible recommendation, evidence 해석,
또는 trade-off가 존재하는 경우로 정의한다. 비교 조건과 uncertainty를 함께 남긴다.

최종 recommendation은 원래 AgentDecision / Evidence / Verification까지 추적 가능해야 한다.
종합 책임의 구현은 deterministic function, 하나의 LLM call, framework supervisor, 별도 Agent 중
나중에 선택한다. CEO라는 역할명을 architecture commitment로 삼지 않는다.
현재 Review는 실제 변경과 Worker output을 보여주며 이 종합 기능은 구현되어 있지 않다.

### 5. Human Governance

Human Task Approval, Change Review, Apply, Commit, Push, Cleanup은 서로 다른 권한이다.
Task 승인이나 Review Continue가 후속 Git 작업의 포괄 승인이 되지 않는다. 현재 명시적
TaskContract JSON 실행은 Planning / Task Approval을 거치지 않는 별도 입력 경로다.

미래 scope / authority 변경, 위험·불확실성·Evidence 부족에 대한 escalation 조건과
Human approve / override / reject의 대상과 효과를 명시해야 한다. Human 결정과 근거를
추적할 governance records가 필요하며, 현재 result.json은 후속 Human 이력 저장소가 아니다.
Merge / release 권한을 자동 부여하는 계획도 아니다.

## Design Decision Filter

새 기능을 구현하거나 기술을 도입하기 전에 다음을 묻는다.

1. 이것은 AI Workspace의 개발 도메인 규칙인가?
2. 아니면 범용 Agent runtime / infrastructure 문제인가?
3. 기존 framework / library / tool이 이미 해결하는가?
4. 기존 기술을 사용하면 AI Workspace의 governance 의미를 잃는가?
5. 직접 구현해야만 검증하고 싶은 연구 질문이 존재하는가?
6. 어떤 권한·Context·Repository·Evidence·Human 경계를 강화하고, 실제 결과로 어떻게 검증할 것인가?
7. 현재 구현 사실, 미래 제안, 기술 선택을 구분했는가? Single-Agent 대비 이득과 비용을 평가할 수 있는가?

현재 요구에 필요한 최소 실행 흐름부터 끝까지 검증한다. 미래 재사용, 조직 역할명, 구조적 대칭성만으로
계층·상태 모델·abstraction을 만들지 않는다. Recovery와 generic orchestration 자체를 핵심 자산으로
단정하지 않고, 도메인 기록과 범용 실행 메커니즘을 분리한다.
