# AI Workspace Architecture

## 1. Architecture Scope

이 문서는 현재 코드 구조, runtime boundary와 E2E 흐름, current model과 future model의 채택 조건을
설명한다. North Star와 Make vs Adopt는 [Project Direction](project-direction.md), 다음 검증 질문은
[Roadmap](roadmap.md), 사용법은 [README](../README.md), Human 조작은
[CLI and Human Interface](cli-and-human-interface.md)에 둔다.

현재 구현은 이 브랜치의 v0 / v1 / v2 / v3 코드 기준이다. Future responsibility는 현재 runtime이나
추가할 폴더의 명세가 아니다. v4는 LangGraph.js Workflow Runtime 채택이 확정됐지만 설치·통합과
CEO workflow는 미구현이며 아래 Current Architecture와 구분한다.

## 2. Current Architecture

현재는 Codex CLI를 Planner / Worker / decision-only Specialist / Comparator로 사용하는 Development Governance Harness다.
독립적인 대상 Git Repository에 연결하며, 대상이 이 시스템의 코드나 조직 구조를 포함할 필요는 없다.

```text
CLI: workflow selection / explicit arguments / Human gates / presentation
  ├─ application/planning → TaskContract
  ├─ application/execution → ExecutionResult → Review / Delivery / Cleanup
  ├─ application/decision → { goal, snapshot, decisions: AgentDecision[] }
  └─ application/comparison → ComparisonResult
           ↓
Contracts / application policies / Scope / Verification / Evidence / Artifacts
           ↓
Codex role implementations / Git and Process infrastructure → Target Repository
```

- Planning: GoalSpec, repository inspection, conservative Fast Path 또는 Codex Planner loop,
  TaskDraft → TaskContract, Human constraints 보존.
- Execution: detached Git worktree, Codex Worker, Scope / Verification / Evidence / artifacts와 duration telemetry.
- Decision: clean RepositorySnapshot, commit의 explicit files, Frontend / UX 구성,
  순차 독립 실행, JSON schema / Evidence invariant 검증, 결과 반환.
- Comparison: supplied AgentDecision[]의 Concern별 관계를 strict JSON으로 구조화하고 source reference 검증.
- CLI: 인자 없는 workflow selector, 명시적 plan / decision / execute, Task Approval과
  Review / Apply / Commit / Push / Cleanup 및 결과 presentation.

현재 stack은 Node.js / TypeScript / pnpm / tsx / Vitest / Zod다. Codex CLI는 외부 실행 도구이며
package dependency가 아니다. 지원 Agent integration은 Codex CLI 하나이고 provider registry나 generic
runtime layer는 없다. Synthesis / Agent discussion / CEO / Coordinator / Human governance history /
automatic retry / crash resume는 미구현이다. Decision / Comparison 결과는 메모리와 terminal에만 존재하며 persistence가 없다.
Decision과 Comparison은 독립 application capability이고 두 use-case의 실행 조합은 CLI command가 담당한다.

## 3. Current End-to-End Flows

### Goal-based Action Governance

```text
Goal
→ Repository overview / initial exact-match inspection
→ Fast Path 또는 Codex Planner ↔ inspect / complete (Planning limits)
→ Harness buildTaskContract() → TaskContract
→ Human Task Approval
→ Detached Git worktree → Codex Worker
→ Scope → Verification → Final Scope Check
→ Evidence / Artifacts → ExecutionResult (workspace 유지)
→ Human Review
→ Apply / Commit / Push (각각 승인; Skip / 실패 시 후속 Delivery 중단)
→ Workspace Delete / Keep
```

Goal 기반 흐름은 Planning 실패·Task Reject 시 실행하지 않는다. PlanningResult.task를 메모리에서
Execution으로 직접 전달한다. 명시적 JSON execute는 Planning / Task Approval을 거치지 않으며 이후
Review / Delivery / Cleanup은 같다. 실패한 실행도 workspace가 있으면 검토할 수 있으나 Delivery는
성공·Verification 통과·patch 보존과 별도 승인 조건을 충족해야 한다. Setup 실패 시 workspace가 없을 수 있다.

### Decision Governance

```text
Repository path + Decision Goal + explicit file paths
→ runDecision()
→ input validation → clean RepositorySnapshot capture
→ GoalSpec 생성 → snapshot.commitSha의 Git blob Context loading
→ Frontend / UX SpecialistDefinition 구성
→ runIndependentDecisions() (중복 Specialist ID 사전 거부)
   ├─ Frontend Context → Snapshot assert → Codex Specialist
   │                    → schema / identity → Snapshot assert → Evidence validation
   └─ UX Context       → Snapshot assert → Codex Specialist
                        → schema / identity → Snapshot assert → Evidence validation
→ { goal, snapshot, decisions: AgentDecision[] }
→ CLI runDecisionCommand가 실제 Goal / Snapshot SHA / 원본 Decision 배열로 ComparisonContext 조립
→ compareDecisions()
   → preconditions → Codex Comparator → strict JSON protocol → Reference Validation
→ ComparisonResult
→ Decision + Comparison presentation
```

각 Context는 같은 Goal / repositoryCommitSha와 해당 Specialist의 files만 담고 repositoryRoot나
다른 Specialist의 Decision을 포함하지 않는다. CLI use-case는 두 역할에 같은 파일 목록을 주지만,
하위 independent flow는 Specialist별 files를 받을 수 있다. 현재 순차 실행이며 자동 파일 선택은 없다.

오류는 fail-fast로 전파하며 다음 Specialist를 실행하거나 partial result를 반환하지 않는다.
`runDecision()`은 Decision 생성까지만 수행하며 Comparison을 import하거나 호출하지 않는다.
CLI command가 `compareDecisions()`를 호출하고 두 결과를 표시한다. Comparison은 source Decision만
입력으로 사용하며 `runDecision()` 실행이나 Snapshot recapture를 하지 않는다.
Planning / Execution 자동 연결, Synthesis / Review / Git Delivery와 결과 persistence는 없다.
Comparison 실패도 전체 command에 전파하고 partial Decision 결과를 표시하지 않는다.

## 4. Current Responsibility Boundaries

| 소유자 | 현재 책임 | 경계 |
| --- | --- | --- |
| Human / CLI adapter | workflow·입력, Task Approval, Review / Delivery / Cleanup, 결과 표시 | application 내부 flow / Domain 검증을 소유하지 않음 |
| Planning application / Codex Planner | 조사·limits·계약 생성 / supplied PlannerContext로 inspect 또는 complete | inspection은 수정 권한이 아니며 Planner는 별도 cwd·제한된 도구 설정으로 실행 |
| Harness contract transformation | ID 주입, Human constraints 보존, Goal의 targetRepository, Zod validation | AI가 시스템 ID나 Human 제약을 소유하지 않음 |
| Execution application / Codex Worker | workspace와 Worker / Scope / Verification / artifacts 연결 / scoped 수정 | 정상 종료 때 workspace를 지우지 않으며 verification command는 Harness가 실행 |
| Decision entry `runDecision` | 입력 검증, Snapshot / Goal / explicit Context와 두 Specialist 구성 | CLI presentation을 알지 않음 |
| Decision Context flow | Snapshot capture/assert, commit 기준 파일 loading | working tree에서 Context를 임의로 읽거나 자동 탐색하지 않음 |
| Decision orchestration / validation | 순차 독립 실행, Snapshot 전후 검사, Evidence exact path / line invariant | Agent끼리 판단 전달·비교·종합하지 않음 |
| Codex Specialist | 제한된 Context로 판단, strict JSON parsing과 schema, Harness identity 주입 | Context와 Evidence의 일치 검증은 flow가 담당 |
| CLI Decision command | runDecision → compareDecisions 조합, 동일 Goal / SHA / Decision 배열 전달 | 두 application 내부의 검증을 중복하지 않음; 별도 domain workflow layer가 아님 |
| Comparison application / compareDecisions | preconditions, Comparator 호출, Reference Validation, ComparisonResult 반환 | Decision 실행·Repository inspection·final recommendation·Conflict 해결을 소유하지 않음 |
| Codex Comparator | supplied ComparisonContext에서 Concern별 Position 관계를 JSON protocol로 구조화 | repository files / tools 미제공, Specialist 재호출·winner·resolution·synthesis 없음 |
| Services | Scope, Verification, execution evidence와 artifact 보존 | 자기 보고를 성공 Evidence로 대체하지 않음 |
| Git / Process infrastructure | HEAD / commit blob, worktree·diff·Delivery 명령, process timeout / lifecycle | Domain의 권한 의미와 Human 결정을 정의하지 않음 |

### Snapshot / Context / Authority

RepositorySnapshot은 `{ repositoryRoot, commitSha }`라는 governed Git state reference다.
Capture는 clean 상태만 허용하며 현재 HEAD를 기록한다. Assert는 HEAD 일치와 clean 상태를 확인한다.
Clean은 기존 `git status --porcelain --untracked-files=all` 기준이므로 ignored 파일 전체 검사가 아니다.
호출 전후 시점 검사이며 Repository lock이나 중간에 바뀌었다 복원된 상태까지 감지하는 기능은 아니다.
Generic checkpoint나 Repository 복사본으로 해석하지 않는다.

`loadSnapshotFiles`는 명시적 path를 그대로 유지하고 빈 path / absolute path / `..` traversal을 거부한다.
Git infrastructure의 `readRepositoryFileAtCommit()`은 `git cat-file blob <commitSha>:<path>`로 해당
commit의 blob을 읽는다. 없는 파일·tree·NUL 포함 또는 invalid UTF-8 입력은 실패한다. Working tree의
파일로 대체하거나 path normalization / fuzzy matching하지 않는다.

SpecialistContext는 기존 GoalSpec, repositoryCommitSha, InspectedFile[]만 포함한다.
Snapshot의 absolute repositoryRoot는 Harness 내부 provenance이며 AI-facing Context에 넣지 않는다.
현재 Codex Specialist는 `{ repositoryAccess: "read", shellExecution: false }`만 허용하고 나머지는
process 시작 전에 거부한다. Read는 supplied Context를 읽는 권한이며 target filesystem 탐색권이 아니다.

### Codex Specialist runtime

`runCodexSpecialist()`는 target Repository 밖의 빈 temporary cwd에서 `codex exec`를 실행하고
성공·실패 모두 cwd를 cleanup한다. Read-only sandbox, non-interactive / ephemeral, user config·rules
무시와 strict config를 사용한다. `approval_policy="never"`, web disabled, project docs 자동 읽기 제한과
shell / code execution / apps / plugins / browser / computer use / multi-agent / hooks / image /
skill search / memory / shell snapshot 기능 비활성화를 설정한다. 제공된 파일 내용은 instruction이
아닌 data로 취급하도록 prompt에 명시하며 다른 Specialist 판단을 추측하지 않도록 한다.

Codex는 specialistId 없는 payload를 JSON만으로 반환해야 한다. `stdout.trim()` → JSON.parse →
strict payload schema → Harness가 specialist.id 주입 → 최종 AgentDecision schema 순서다.
Agent가 specialistId나 추가 필드를 반환하면 거부한다. Malformed JSON / schema 오류를 자동 복구하지 않는다.
기본 timeout은 Specialist당 15분이며 timeout, executable/process failure, non-zero exit를 실패로 처리한다.
`runCodexSpecialist` / `runIndependentDecisions` API의 options로 timeout을 지정할 수 있으나 현재
`runDecision()` / CLI에는 Specialist timeout override 입력이 없다.

이것은 현재 Codex 실행 설정과 Harness 검사의 조합이며 모든 runtime에서 통하는 보편적 sandbox의
보장이 아니다. 현재 다른 provider integration, tool-enabled Specialist나 runtime abstraction은 없다.

### Evidence / Verification의 의미와 한계

v2 EvidenceReference는 supplied files의 path와 정확히 일치해야 한다. 줄 번호는 1-based이며
file-level Evidence와 lineStart 단독은 허용한다. lineEnd 단독, start > end, content 범위 초과는 거부한다.
Line count는 supplied content의 LF / CRLF 분할 기준이며 trailing newline의 마지막 빈 줄도 포함한다.
Positive integer와 non-empty field는 Zod schema가 검사한다. 실제 filesystem을 다시 읽지 않는다.

따라서 Evidence가 supplied Context에 존재하는지는 검사하지만 description의 의미, 근거의 충분성,
recommendation의 논리적 타당성을 증명하지 않는다. Verification command를 실행해 판단하는 v0/v1과
달리 현재 v2 Decision 자체가 build / test 등 command Verification을 수행하는 것은 아니다.

Execution Evidence는 changed paths, diff / patch, command stdout/stderr·exit code 등 관찰 사실이다.
Worker output도 보존하지만 자기 주장을 성공 증거로 인정하지 않는다. Scope는 변경 후 탐지이며
allowedPaths / forbiddenPaths는 정확한 문자열 일치다. Forbidden은 allowed에도 있어도 위반이다.
Zod는 structural validity이며 `passed`도 자연어 objective / acceptance criteria의 의미적 충족을 보장하지 않는다.
별도 semantic Verifier Agent는 없다.

### Comparison runtime / validation boundary

`compareDecisions()`는 Decision 최소 2개, source specialistId unique, non-empty commit SHA를 요구한다.
Goal을 재생성하거나 Git commit 존재 여부를 다시 조사하지 않는다.
`runCodexComparator()`에 전달하는 ComparisonContext는 GoalSpec / repositoryCommitSha / AgentDecision[]뿐이다.
RepositoryRoot, InspectedFile[], working tree는 제공하지 않는다. Temporary cwd에서 read-only / ephemeral,
approval never와 shell / web / multi-agent / memory 등 capability 비활성화 설정으로 실행한다.
이는 현재 runtime 설정과 prompt 정책이며 보편적인 filesystem 격리 보장으로 확대하지 않는다.

Comparator stdout은 trim → JSON.parse → strict `comparisonPayloadSchema` 순서로 검증한다.
Malformed JSON을 복구하지 않고 timeout / process / protocol 실패를 전파하며 cwd는 항상 cleanup한다.
기본 timeout은 15분이고 CLI에 별도 override 입력은 없다.
Runtime이 반환하는 ComparisonPayload는 아직 source reference 검증 전이다.

Flow의 `validateComparisonReferences()`가 실제 source Specialist, Finding 최소 2 Position과
Specialist 중복 금지, Position의 evidence index 범위·중복, Gap 최소 1 Specialist와 존재·중복을 확인한다.
그 뒤 같은 payload를 ComparisonResult로 반환한다. Evidence index는 각 원본 Decision.evidence의
0-based 참조이며 빈 index 배열은 허용한다. Concern / relation / Gap 의미는
[Roadmap의 v3](roadmap.md#v3--agreement--conflict--structured-decision-comparison)에 둔다.

Reference integrity는 statement의 원본 충실성, relation / rationale의 정확성, Evidence 충분성이나
판단의 진실성 검증이 아니다. Comparator는 새 Evidence / 최종 recommendation / resolution을
생성하지 않도록 지시받지만, Harness가 출력 문장의 의미를 증명하는 것은 아니다.
Automated CLI E2E는 deterministic fake Codex로 wiring / isolation / propagation을 확인하며
실제 모델의 Comparison 품질 benchmark나 반복 Real Codex 평가가 아니다.

### Execution artifacts / Human gate / Telemetry

Workspace는 실행용 worktree이고 artifacts는 task.json / base-commit.txt / changes.patch / result.json이다.
ExecutionResult는 완료 시점 snapshot이며 Review / Delivery / Cleanup 결과를 이후 저장하는 기록이 아니다.
Cleanup은 workspace만 대상으로 하고 artifacts는 유지한다. Artifact preservation은 durable execution이 아니다.

Human gate와 Delivery는 실행 성공과 별개다. Duration telemetry는 운영 데이터이며 Evidence와 구분한다.
CLI의 Goal flow Total은 이후 Human 대기를 포함할 수 있지만 Execution snapshot timing은 포함하지 않는다.
Decision Duration은 input 완료 후 Specialist / Comparator 실행·표시 구간의 전체 시간이며 개별 runtime tracing backend는 없다.

## 5. Target Responsibility Model

### v4 결정과 구현 상태

v4 목표는 **CEO Governance / AI Organization Orchestration의 전체 E2E lifecycle**이다.
CEO Agent가 Human Goal을 분석하고 조직을 제안하며 독립 판단을 종합한 뒤, 승인된 작업을 기존
Repository Harness에서 실행하고 최종 Executive Report를 Human에게 전달한다.
단일 SynthesisResult 생성만으로 v4가 완료되는 것은 아니다.

| 항목 | 확정된 결정 | 현재 구현 상태 |
| --- | --- | --- |
| Workflow Runtime | LangGraph.js 채택 | 패키지 설치·코드 통합 없음 |
| Agent Execution Runtime | 기존 Codex 기반 실행 우선 재사용 | v0–v3 integration 존재; CEO 실행 방식은 v4 설계 대상 |
| Domain / Governance | AI Workspace Harness 소유 | 기존 의미를 보존하고 v4 정책·계약은 단계적으로 설계 |
| Framework Integration / Verification | v4 구현 단계에서 통합·E2E 검증 | 별도 채택 평가 checkpoint / 선행 Runtime Spike 없음 |
| 기존 capability | v0–v3 Application API / Domain Model 재사용 | 기존 Planning / Execution / Decision / Comparison 동작 유지 |

### v4 Target Workflow — Planned

```text
Human Goal / Constraints
    ↓
CEO Agent: Intent / Task Analysis → Staffing / Context / Budget Proposal
    ↓
Harness Validation
    ↓
Human Staffing Approval
    ↓
Specialist Agents (v2): Independent Analysis → AgentDecision[]
    ↓
Decision Comparison (v3): Agreement / Conflict / Trade-off / Gaps
    ↓
CEO Synthesis / Decision
  Recommendation / Rationale / Evidence / Unresolved Issues / Human Escalation
    ↓
Harness Validation
    ↓
Human Governance: Approve / Override / Reject
    ↓ (승인된 내용만 진행)
Approved Decision
    ↓
TaskContract / Planning (v1)
    ↓
Human Task Approval
    ↓
Repository Harness / Worker (v0)
  Safe Workspace / Scope Enforcement / Verification / Evidence
    ↓
Human Change Review / Delivery (Apply / Commit / Push는 각각 별도 승인)
    ↓
CEO Executive Report
    ↓
Human
```

도식은 승인된 작업의 목표 경로다. Reject / 승인 대기 / validation 실패 시 실행을 진행하지 않아야 하며,
Override의 변경 내용도 Harness 검증과 필요한 승인 범위를 충족해야 한다. 실패·거절·미해결 이슈의
보고 및 종료 분기는 v4 Domain 설계에서 정의한다. 현재 CLI가 이 전체 흐름을 실행한다는 뜻은 아니다.

### 책임과 소유권

| 주체 | v4 책임 | 권한 경계 |
| --- | --- | --- |
| CEO Agent — Autonomous Decision Maker | Goal 분석, Intent / Task Analysis, Staffing / Context / Budget Proposal, Specialist 판단 종합, Recommendation / Trade-off 판단, Escalation 제안, Executive Report | 판단과 제안은 자율적이나 승인 없이 authority / scope / budget을 확대하거나 실행을 허가할 수 없음 |
| Harness — Governance & Control Owner | Authority / Scope / Budget 정책, Staffing validation, approval enforcement, Context isolation, schema / reference / Evidence validation, TaskContract / Repository execution, Verification | 실행 허용 조건과 Domain 의미를 소유하며 Human의 최종 권한을 보존 |
| LangGraph.js — Workflow Runtime | Workflow state management, conditional routing, agent coordination, interrupt / resume, checkpoint / recovery, execution lifecycle | 실행 메커니즘을 담당하며 Governance policy / approval의 의미를 정의하지 않음; 실제 지원 동작은 통합에서 검증 |
| Codex — Agent Execution Runtime | 개별 CEO / Specialist 등 모델 호출, prompt / Context 전달, structured output 생성, 개별 Agent 실행 | LangGraph.js로 대체하지 않음; 기존 통합 우선 재사용, 구체적인 CEO 호출 방식은 v4에서 설계 |
| Human — Final Authority | Goal / Constraints, Staffing Approval, Governance Approve / Override / Reject, Task Approval, Change Review, Apply / Commit / Push | 각 승인은 독립된 대상과 의미를 가지며 다른 권한의 포괄 승인이 아님 |

### 통합 시 지켜야 할 invariant

- 기존 `planTask()` / `executeTask()` / `runDecision()` / `compareDecisions()`와 Domain Model을 재사용한다.
  Decision 생성과 Comparison의 독립 capability 경계를 유지하고 각 application에 전체 조직 workflow를 숨겨 넣지 않는다.
- LangGraph.js가 workflow state와 순서를 실행하더라도 Governance 전이의 허용 조건·의미는 Harness가 정의한다.
  Framework state / run / node가 core Domain Model에 불필요하게 누출되지 않도록 한다.
- Human Approval은 단순 interrupt가 아니다. 승인 주체·대상·내용·유효 조건을 Harness가 검증하고
  staffing 승인, Governance 승인, Task Approval, Review / Apply / Commit / Push를 분리한다.
- 전체 LangGraph State를 Specialist에게 자동 전달하지 않는다. 승인된 Context만 projection하고
  같은 Snapshot / Goal, Specialist 간 독립성과 제한된 authority를 보존한다.
- Workflow checkpoint는 실행 재개용 상태다. 영구 Governance / Provenance Record의 의미·보존 정책을
  대신하지 않으며 checkpoint만으로 승인 이력·Decision / Evidence traceability가 보장되지 않는다.
- 승인 후 resume / retry / replay에서 Worker / Apply / Commit / Push의 중복 실행 위험을 다룬다.
  Side effect 완료 여부와 재실행 허용 조건을 확인하고, stale approval이나 변경된 Repository 상태로
  실행하지 않도록 설계·테스트한다. 현재 exactly-once 실행이나 crash recovery가 구현됐다는 주장이 아니다.
- CEO 판단 품질과 runtime 실행 안정성을 별도로 검증한다. Schema / reference 통과가 recommendation의
  의미적 타당성을 증명하지 않으며 workflow 완료가 Agent 품질이나 Multi-Agent 우위를 입증하지 않는다.

LangGraph.js의 구체적인 graph / state schema / checkpoint backend / Domain type / 파일 배치는
이 문서에서 선행 확정하지 않는다. 실제 책임과 요구가 생길 때 설계하며 generic SpecialistRunner,
provider registry, 공통 Codex abstraction도 미리 만들지 않는다. 도입 원칙은
[Project Direction](project-direction.md#build-vs-adopt), 단계별 구현과 완료 기준은
[Roadmap의 v4](roadmap.md#v4--ceo-governance--ai-organization-orchestration)를 따른다.

### v4 Step 1.3 — Authority Core Model— schema만 구현

`application/governance/model/authority.ts`는 조직 운영 권한의 Domain 데이터를 소유한다.
Core Model은 strict Zod schema / inferred type을 제공한다. Step 1.4의 순수 Authority Evaluation을
추가했으며 CEO / Policy Engine / Workflow 실행은 미구현이다. LangGraph State와 결합하지 않는다.

```text
CEO-generated InvokeSpecialistRequest
    ≠ Harness-approved ApprovedOperatingScope
    ≠ Harness-authorized AuthorizedSpecialistInvocation
```

CEO는 판단과 실행 요청을 생성한다. Harness는 승인된 Scope와 Governance Policy를 근거로
실행 권한을 검증하고 Runtime은 Harness가 허용한 실행 입력만 수행해야 한다.
이 관계의 enforcement와 Verdict 발급 함수는 이후 단계에서 구현한다.

- ApprovedOperatingScope: Goal / RepositorySnapshot, Assignment의 Specialist ID / objective / contextPaths,
  호출 예산 상한, proposal / approval / policy 참조와 version을 보존한다. 발급 후 불변으로 취급하며
  권한 변경 시 새 버전을 발급한다. Schema parsing은 객체의 전체 수명 동안 불변성을 강제하거나
  실제 승인·활성·취소·교체 상태를 검증하지 않는다. Lifecycle은 향후 신뢰 가능한 기록에서 관리한다.
- InvokeSpecialistRequest: scope ID / version, assignment ID와 요청 Context paths만 받는다.
  CEO가 authority / objective를 추가하는 입력은 구조적으로 거부하며 Context 부분집합은 아래 Evaluation에서 검사한다.
- AuthorizedSpecialistInvocation: invocation ID, 기존 Goal / Snapshot / SpecialistDefinition / InspectedFile[]을
  사용한다. 파일은 후속 enforcement가 승인된 Snapshot에서 구성해야 하며 parse 성공은 실행 권한이 아니다.
- AuthorityVerdict: allowed는 Invocation을 포함하고 approval-required / denied는 reason을 포함한다.
  Harness의 검증 결과를 표현하는 구조일 뿐 현재 정책 평가로 Verdict를 생성하지 않는다.

Scope assignments / assignment contextPaths / request requestedContextPaths / invocation files는 최소 1개,
version / maxAgentInvocations는 양의 정수다. Schema는 필드 구조와 값 범위를 검증하며 approvalRecordId의
실재·유효성, policy 적합성, Specialist 등록, Context 권한, Snapshot 실제 상태, budget 잔여량과 중복
Invocation을 검증하지 않는다. Invocation ID는 향후 budget reservation / 중복 실행 제어의 연결점이다.

기존 decision model의 Snapshot / Specialist / Authority에 재사용 schema를 추가하고 기존 타입 shape는
유지했다. GoalSpec / InspectedFile schema를 재사용하며 AgentDecision을 복제하거나 변경하지 않는다.

### v4 Step 1.4 — Authority Evaluation

```text
ApprovedOperatingScope + InvokeSpecialistRequest + Trusted Evaluation Context
→ evaluateInvocationRequest() → InvocationEligibility
→ Future Authorization → AuthorizedSpecialistInvocation
```

Governance public API의 순수 함수는 strict 구조 검증 → Scope ID / version 일치 → Active lifecycle →
Assignment ID 유일성 / 존재 → 승인·요청 Context 경로 검증 및 정확한 부분집합 → Budget 잔여량 순서로
검사한다. 실패는 reason을 포함한 denied, 모두 통과하면 eligible만 반환한다. 잘못된 입력·음수·비정수·
안전한 정수 범위를 넘는 사용량도 denied다. 상위 정책의 확대 허용 정보가 없으므로
reapproval-required는 결과 모델에만 존재하며 현재 evaluator가 추측하여 반환하지 않는다.
미승인 Assignment / Context 확대는 별도 Staffing Proposal 변경 절차가 필요하다는 이유로 차단한다.

Evaluation Context는 Harness가 제공할 scopeStatus(active / revoked / superseded)와 해당 Scope version의
usedAgentInvocations다. Scope 객체는 현재 승인 버전을, Context는 그 버전의 최신 lifecycle / usage를
나타내야 한다. 조회·Persistence·출처 인증은 구현하지 않았으며 입력 parsing으로 신뢰성과 최신성이
증명되지는 않는다. CEO가 이 입력들을 통제하는 연결은 안전한 enforcement가 아니다.

Context는 repository-relative exact file path로 비교한다. 정규화나 prefix 비교를 하지 않으며 중복,
빈 segment, dot / dot-dot segment, backslash, colon, control character와 절대경로를 거부한다.
Decision loader의 absolute / traversal 거부와 일치하면서 모호한 표현을 더 제한한다. 기존 loader는
파일 읽기를 포함하는 내부 use-case이므로 import하거나 v2의 동작을 변경하지 않는다.
파일 존재·Git blob·symlink·Snapshot 검증은 수행하지 않는다.

Evaluation은 요청이 제공된 승인 범위와 사용량에 부합하는지 판단한다. eligible은 실제 실행 허가나
예산 확보가 아니다. Budget Evaluation만 구현하며 Budget Reservation / 동시성 제어 / Usage Recording은
미구현이다. 후속 Authorization이 최신 권한 확인, 예산의 안전한 확보와 승인된 Snapshot 기반 실행 입력
구성을 담당해야 한다. 현재 함수는 AuthorityVerdict / Invocation을 생성하지 않으며 I/O나 상태 변경이 없다.
기존 v0–v3 실행 경로에는 연결하지 않는다.

### v4 Step 2.1 — Intent & Staffing Domain / Protocol — schema만 구현

```text
Human GoalSpec + RepositorySnapshot + Available Specialists + Repository Context
→ CEOStaffingDecision
   ├─ propose → StaffingDraft
   ├─ inspect → Inspection Request
   └─ escalate → Human Clarification
→ Harness Finalization / Validation (Planned) → StaffingProposal
→ Human Staffing Approval (Planned) → ApprovedOperatingScope issuance (Planned)
```

`application/staffing/model/staffing.ts`는 CEO의 해석인 IntentAnalysis와 공식 제안인
StaffingProposal / StaffingAssignment를 정의한다. Proposal은 원본 Human GoalSpec과 Constraints,
Harness가 확보한 RepositorySnapshot, Harness 소유 Proposal / Assignment ID를 보존할 구조다.
IntentAnalysis는 원본 Goal을 대체하지 않는다. 실제 원본 보존·ID 발급은 후속 Finalization 책임이며
schema parsing이 출처·발급·Constraints 준수를 증명하지는 않는다.

`protocol/ceo.ts`는 model schema에서 Harness 소유 필드를 제외하여 StaffingAssignmentDraft /
StaffingDraft를 파생하고 strict discriminated union인 CEOStaffingDecision을 정의한다.
의존성은 protocol → model 방향이며 순환 import나 중복 schema가 없다. CEO는 업무·Context·Budget과
선택 이유를 제안하지만 Goal / Snapshot / ID / Approval / Authority를 Draft에 주입할 수 없다.
Specialist ID는 기존 decision 소유 SpecialistDefinition을 참조하며 해당 모델을 이동하거나 복제하지 않는다.
Assignment objective는 이번 Goal의 위임 업무이고 SpecialistDefinition.objective는 기본 역할·책임이다.

모든 외부 object는 strict하며 필수 문자열은 non-empty, Budget은 양의 정수, assignments /
contextPaths / inspect paths / escalate questions는 최소 1개다. considerations / uncertainties는 빈 배열을
허용한다. Schema는 구조만 검증한다. Specialist 등록·역할 적합성, Context 경로 안전성·접근권·파일 존재,
Budget 정책 상한, 실제 Snapshot 상태, Human Approval은 검증하지 않는다. Proposal parsing은
ApprovedOperatingScope를 발급하지 않으며 inspection parsing도 파일 접근 권한을 만들지 않는다.

현재 구현은 schema / inferred type / unit test / public API뿐이다. CEO 실행, Planning Loop,
Finalization / Policy Validation / Approval / Scope 발급 및 LangGraph 연결은 미구현이며 기존 v0–v3와
Governance 실행 경로는 변경하지 않는다. Step 2.2의 Repository Context Discovery는 추가 Context 요청의
경로·접근 정책과 조사 한계를 검증하고 Repository 기준 상태에 맞는 Context를 제공하는 후속 책임이다.

## 6. Current and Conditional Domain Models

| 모델 / 개념 | 상태 | 현재 의미 또는 채택 조건 |
| --- | --- | --- |
| RepositorySnapshot | Current | model/snapshot.ts의 repositoryRoot / commitSha. Decision의 Repository provenance |
| SpecialistDefinition / SpecialistAuthority | Current | model/specialist.ts / authority.ts. id / role / objective / authority, RepositoryAccess와 shellExecution |
| SpecialistContext | Current | protocol/context.ts. GoalSpec / repositoryCommitSha / InspectedFile[] |
| AgentDecision / EvidenceReference | Current | protocol/decision.ts의 strict Zod schema와 inferred type. recommendation / evidence / risks / uncertainty와 Harness identity, path / optional lines / description |
| ComparisonRelation / ComparisonGapKind / ComparisonPosition / ComparisonFinding / ComparisonGap / ComparisonResult | Current | model/comparison.ts. Concern은 string, Finding relation과 Gap kind를 분리. Position은 specialistId / statement / 원본 Decision의 0-based evidenceIndexes로 참조 |
| ComparisonContext | Current | protocol/context.ts. GoalSpec / repositoryCommitSha / AgentDecision[]만 포함 |
| ComparisonPayload | Current | protocol/comparison.ts의 strict Zod schema와 inferred type. Comparator output의 구조 검증을 통과한 상태; Reference Validation 뒤 같은 shape를 ComparisonResult로 반환 |
| ApprovedOperatingScope / ApprovedAssignment / InvokeSpecialistRequest / AuthorizedSpecialistInvocation / AuthorityVerdict | Schema implemented, enforcement Planned | application/governance의 strict 구조 계약. 승인·권한 검증이나 실행 허용을 제공하지 않음 |
| DecisionRound | Conditional | 동일 Snapshot 아래 독립 Decision들의 고유 비교 단위가 실제 필요할 때만. Workflow step 복제라면 만들지 않음 |
| DecisionRun | Conditional | Goal → Decision / Evidence → Human governance result의 고유 audit lifecycle이 필요할 때만. Runtime run/session 복제라면 만들지 않음 |
| IntentAnalysis / StaffingAssignment / StaffingProposal / StaffingAssignmentDraft / StaffingDraft / CEOStaffingDecision | Schema implemented, flow Planned | application/staffing의 strict 구조 계약. 제안·조사 요청·Human 확인을 표현하며 승인이나 실행 권한은 제공하지 않음 |
| CEO Agent / Synthesis / Staffing workflow / Executive Report | v4 Planned | CEO의 판단·종합·보고 역할은 목표로 확정; Domain / protocol과 Codex 실행 방식은 단계별 설계, 현재 미구현 |
| 별도 Coordinator Agent | Conditional | LangGraph.js의 coordination mechanism과 구분; 별도 Agent를 필수 구성으로 전제하지 않음 |
| Human governance history / long-lived governance records | Future / Conditional | 후속 Human 결정과 provenance 연결 요구가 생길 때. 현재 Decision persistence 없음 |

Planning의 PlannerDecision은 inspect / complete protocol이고 AgentDecision과 다른 개념이다.
Current model의 존재가 장기 저장이나 generic memory / Shared State / checkpoint engine의 구현을 의미하지 않는다.
Agent 상태 resume와 전체 durable workflow를 구분하며 관련 policy / runtime 후보의 역할은
[Project Direction](project-direction.md#외부-기술과의-관계-및-도입-시점)에 둔다.

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
  `GoalSpec → TaskContract`, Execution의 `TaskContract → ExecutionResult`, Decision의
  `Goal + RepositorySnapshot + explicit files → AgentDecision[]`가 여기에 속한다.
  각 use-case는 독립 진입점을 가지며 CLI가 Planning과 Execution을 Human gate로 연결한다.
- `contracts`: 특정 application 하나에 종속되지 않는 system-wide contract를 둔다.
  현재 GoalSpec, TaskContract, InspectedFile의 runtime schema와 그 schema에서 파생된 타입이 해당한다.
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

현재 use-case는 `planning`, `execution`, `decision`이다. 모든 application에 위 폴더를 미리 만들거나
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

Decision:
Goal / explicit file paths → Snapshot / commit Context → Specialist 구성
                          → independent decisions → Evidence validation → result
```

flow root에는 가능한 한 public use-case entry를 둔다.
현재 `planning/flow/plan-task.ts`, `execution/flow/execute-task.ts`,
`decision/flow/run-decision.ts`가 해당한다. 파일명은 실제 TaskContract / Decision 책임을 반영하며
억지로 대칭시키지 않는다.

#### flow/orchestration

workflow의 순서와 진행 상태를 제어한다. 다음 단계 결정, 반복 제어, stage 진행,
실패 누적, workflow 종료 처리가 여기에 속한다.
현재 `planning-loop.ts`, `stages.ts`, `result-finalizer.ts`, `run-independent-decisions.ts`가 해당한다.
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

Decision도 같은 기준으로 `flow/context`에 Snapshot capture/assert와 commit 파일 loading,
`flow/orchestration`에 순차 실행·fail-fast, `flow/validation`에 Evidence invariant 검증을 둔다.
`run-decision.ts`는 입력 검증, Goal 생성, Context loading과 두 Specialist 구성을 조립한다.

#### model

해당 use-case가 소유하는 상태, 설정, 결과를 둔다.
Planning의 PlanningState, PlanningLimits, PlanningResult, RepositoryInfo와
Execution의 ExecutionState, ExecutionResult, Decision의 RepositorySnapshot / SpecialistDefinition /
SpecialistAuthority가 해당한다. RunDecisionResult는 실제 사용된 GoalSpec도 반환한다. 현재 RunDecisionInput / RunDecisionResult는 작은 use-case entry에
함께 선언되어 있으며 구조적 대칭만을 위해 model 파일로 분리하지 않는다.

> model ≠ 모든 타입을 넣는 곳

system-wide contract는 `contracts`, 역할 간 message contract는 `protocol`에 둔다.

#### protocol

컴포넌트나 역할 사이에서 주고받는 구조화된 message contract를 둔다.
Planning에는 PlannerContext, PlannerDecision, InspectRequest, InspectResult, TaskDraft가 있다.
Decision에는 SpecialistContext, AgentDecision, EvidenceReference와 Decision Zod schema가 있다.
Comparison에는 ComparisonContext와 strict ComparisonPayload schema가 있다.

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
현재 `planning/planner/codex-planner.ts`, `execution/worker/codex-worker.ts`,
`decision/specialist/codex-specialist.ts`가 해당한다.

Codex Planner는 Codex 기술을 사용하기 때문에 planner에 있는 것이 아니라,
Planning의 Planner 역할을 구현하기 때문에 그곳에 있다.
Codex Worker도 Execution의 Worker 역할 구현체이므로 Execution이 소유한다.
기술보다 역할 소유권을 우선한다.

#### index.ts

해당 use-case의 public boundary다. `planTask`, `executeTask`, `runDecision`과 각 결과 타입,
필요한 하위 capability 등 외부에 필요한 API를 제공한다.
내부 파일 위치가 바뀌어도 외부 사용자가 그 배치에 직접 의존하지 않도록 한다.
Cross-module은 `@/*` alias와 대상 module의 `index.ts`, same-module 내부는 상대경로를 사용한다.
  현재 contracts는 개별 schema 파일에서 import한다. 자기 module의 index를 내부에서 다시 import하거나
  상위 mega barrel을 만들지 않으며 public API에는 외부에 필요한 항목만 노출한다.

### 7.3 Codex Implementation Placement

```text
Planner ≠ Codex      Planner can use Codex
Worker ≠ Codex       Worker can use Codex
Specialist ≠ Codex   Specialist can use Codex
```

역할 구현은 각 application의 planner/worker/specialist에 둔다.
실제 공통 실행 책임이 생길 때에만,
`codex exec`, sandbox, timeout, stdout/stderr 수집, process error handling,
config 같은 기술적 메커니즘을 `infrastructure/codex/`로 추출할 수 있다.
현재 이 모듈은 구현되어 있지 않으며, 사용 기술이 같다는 이유만으로 만들지 않는다.

```text
Planning 개념을 안다       → application/planning
Execution 개념을 안다      → application/execution
Decision 개념을 안다       → application/decision
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
아래 예시에서는 CLI 세부 구조와 일부 파일을 생략한다.

```text
src/
├─ cli/  # operator adapter; 세부 구조는 CLI 문서 참조
├─ application/
│  ├─ comparison/
│  │  ├─ comparator/
│  │  │  └─ codex-comparator.ts
│  │  ├─ flow/
│  │  │  ├─ compare-decisions.ts
│  │  │  └─ validation/
│  │  │     └─ validate-references.ts
│  │  ├─ model/
│  │  │  └─ comparison.ts
│  │  ├─ protocol/
│  │  │  ├─ context.ts
│  │  │  └─ comparison.ts
│  │  └─ index.ts
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
│  ├─ execution/
│  │  ├─ flow/
│  │  │  ├─ execute-task.ts
│  │  │  └─ orchestration/
│  │  ├─ model/
│  │  ├─ worker/
│  │  └─ index.ts
│  └─ decision/
│     ├─ flow/
│     │  ├─ context/
│     │  │  ├─ repository-snapshot.ts
│     │  │  └─ load-snapshot-files.ts
│     │  ├─ orchestration/
│     │  │  └─ run-independent-decisions.ts
│     │  ├─ validation/
│     │  │  └─ validate-evidence.ts
│     │  └─ run-decision.ts
│     ├─ model/
│     │  ├─ snapshot.ts
│     │  ├─ authority.ts
│     │  └─ specialist.ts
│     ├─ protocol/
│     │  ├─ context.ts
│     │  └─ decision.ts
│     ├─ specialist/
│     │  └─ codex-specialist.ts
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
따라서 세 application의 구조가 대칭이 아니거나 Planning flow가 더 커 보이는 것은 문제가 아니다.
맞춰야 하는 것은 파일 개수, 폴더 개수, 모양이 아니라 책임을 판단하는 기준이다.

### 7.7 Placement Checklist

새 기능이나 리팩토링의 파일 배치는 다음 질문으로 판단한다.

1. 어떤 use-case가 이 코드를 소유하는가?
   → planning / execution / decision / system-wide
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
   → planner / worker / specialist
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
- v2 독립 Decision 생성과 v3 Structured Comparison은 별도 use-case이며 CLI가 조합한다. Synthesis / Human governance history는 미구현이다.
- Decision Context는 Snapshot commit의 explicit files이며 다른 Specialist의 Decision을 포함하지 않는다.
- Schema 및 Evidence path / line 검증을 Decision의 의미적 정확성 보장으로 과장하지 않는다.
- Generic runtime 문제는 기존 기술을 먼저 평가한다. Runtime은 교체 가능하며 governance 의미는 프로젝트가 소유한다.
- 실제 domain 의미 없는 Run / Round 복제나 별도 Coordinator를 선행 구현하지 않는다. v4 CEO 역할의 구체 설계는 단계적으로 진행한다.
- Runtime boundary는 Zod validation을 사용하며 현재 요청에 필요하지 않은 추상화를 만들지 않는다.
