# AI Workspace Architecture

## 1. Architecture Scope

이 문서는 현재 코드 구조, runtime boundary와 E2E 흐름, current model과 future model의 채택 조건을
설명한다. North Star와 Make vs Adopt는 [Project Direction](project-direction.md), 다음 검증 질문은
[Roadmap](roadmap.md), 사용법은 [README](../README.md), Human 조작은
[CLI and Human Interface](cli-and-human-interface.md)에 둔다.
Development Organization의 실행 계약·Phase Handoff·Graph State / Output 소유권과 분리 판단은
[Workflow Architecture](workflow-architecture.md)를 기준으로 한다. 이 문서는 Application·runtime의 실제 구현과 설계 이력을 유지한다.
아래 단계별 기록에서 당시 미구현으로 남긴 방향 승인·Resume의 현재 상태는 [Step 7.2](#step-72--human-direction-governance)를 따른다.

현재 구현은 v0–v3와 v4 R1/R2 Staffing·Step 3 승인·Step 4 Authorization·Step 5.1–5.4 Decision/Comparison 연결을 포함한다.
LangGraph.js Minimal Integration Step 1은 정책 조회를, Step 2는 CEO Staffing·Approval 평가 Node와 조건부 Edge를 연결했다.
Step 2.5는 콜백 기반 Human 확인·최종화를 연결했고, 이후 Staffing Setup Subgraph를 제거해 Policy → Staffing → Approval을 Phase A가 직접 소유하도록 통합했다. CLI의 기존 API도 현재 Phase A Graph를 호출한다.
Step 3는 승인된 Staffing 결과와 명시적 specialist-decisions 실행 대상에서 Preflight·단일 Specialist·Comparison·완료를 일반 Node로 연결하고 반복·실패 분기를 Phase A Edge로 이전했다. 전체 Organization Graph는 아직 없다. Future responsibility는 현재 runtime이나 추가할 폴더의 명세가 아니다.
Step 6.2는 CEO Synthesis Application과 명시적 ceo-synthesis Graph 실행 대상을 구현했다.
v4는 진행 중이다. Step 7.2의 해결 방향 Human Governance와 동일 프로세스 Interrupt / Resume는 구현했으며 Phase B·전체 CEO Workflow는 미완성이다.

## 2. Current Architecture

현재는 Codex CLI를 Planner / Worker / decision-only Specialist / Comparator로 사용하는 Development Governance Harness다.
독립적인 대상 Git Repository에 연결하며, 대상이 이 시스템의 코드나 조직 구조를 포함할 필요는 없다.

```text
CLI: workflow selection / explicit arguments / Human gates / presentation
  ├─ application/planning → TaskContract
  ├─ application/decision → { goal, snapshot, decisions: AgentDecision[] }
  └─ application/comparison → ComparisonResult
Phase B → application/execution → ExecutionOutcome
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
- CLI: 인자 없는 workflow selector, 명시적 plan / decision / staffing / governance 및 결과 표시.
  Review / Delivery / Cleanup 모듈은 후속 Workflow 연결을 위해 유지한다.

현재 stack은 Node.js / TypeScript / pnpm / tsx / Vitest / Zod / LangGraph.js와 필수 LangChain core다. Codex CLI는 외부 실행 도구이며
package dependency가 아니다. 지원 Agent integration은 Codex CLI 하나이고 provider registry나 자체 범용 Agent runtime layer는 없다. Agent discussion / CEO 전체 조직 운영 / Coordinator / Human governance history /
automatic retry / crash resume는 미구현이다. Decision / Comparison 결과는 메모리와 terminal에만 존재하며 persistence가 없다.
Decision과 Comparison은 독립 application capability다. 기존 CLI command와 v4 Phase A Workflow가 각각 공개 API를 조합한다.

v4 기반으로 Governance의 Authority schema / 순수 Invocation Eligibility Evaluation과 Staffing의
Intent / Draft / Proposal schema, CEO propose / inspect / escalate protocol, Snapshot 기반 Context Discovery /
추가 Inspection이 구현되어 있다. Step 2.3의 Codex CEO Adapter와 runStaffing()이 이 API들을 연결해
R2 검증·최종화 후 Proposal / Escalation / Failure를 반환한다. 공통 repository-inspection 정책을 재사용하며
CLI staffing → runStaffingApproval()에 연결했다. 기존 v2 Decision CLI의 고정 Frontend / UX 진입점과는 별도다.
Step 3은 로컬 Human Delegation / 직접 Staffing Approval과 Scope issuance를 제공한다.
Step 4는 저장 Scope 검증·Budget Reservation·AuthorizedSpecialistInvocation 발급을 제공한다.
Step 5.2는 실행 전 Reservation 검증·일회 Claim, Step 5.3은 단일 Invocation의 v2 실행,
Step 5.4는 승인 Scope의 동적 Specialist 순차 실행과 v3 Comparison 연결을 제공한다.
LangGraph Phase A Graph는 정책 조회·Staffing·Approval·Human 확인과 선택적 Specialist Decisions / Comparison까지 조정한다. 기본값·Staffing CLI는 승인까지만 실행하며 상위 Organization Graph는 아직 없다. Step별 상세는 아래 [Target Responsibility Model](#5-target-responsibility-model)과 [Runtime Foundation](#97-langgraph-minimal-integration-step-1--runtime-foundation)을 따른다.

## 3. Current End-to-End Flows

### Phase B Action Governance

```text
Phase A 완료 계약 → Work Decomposition → Detailed Planning
→ TaskContract + Execution Source → executeWorkItem
→ 승인된 Codex Worktree 모드 확인 및 Governance Authorization
→ 승인 Snapshot 기반 Worktree → Codex Worker
→ Scope → Verification → Final Scope Check
→ Evidence / Artifacts → Phase B State
```

독립 Planning CLI는 TaskContract를 표시한다. Phase B에서 실행 준비 실패와 Pipeline 실행 결과는
선택된 Work Item ID에 연결된다. Worktree는 실행 후 보존되며 원본 반영은 별도의 Human 결정이다.

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

### v4 현재 연결 단위

```text
CLI staffing → runStaffingApproval Adapter → Phase A Graph (staffing-approval) → Policy / Staffing / Approval → Scope
Phase A Graph API (specialist-decisions) → Policy / Staffing / Approval → 승인 시 Preflight / Specialist 반복 / Comparison
```

기본값과 Staffing CLI는 승인까지만 실행한다. Human 확인은 Graph Node가 제공된 콜백을 통해 수행한다.
Graph는 기존 Application을 호출하며 별도 함수형 Decision 묶음 Orchestrator는 제거했다. 현재 실행 범위의
종료를 전체 조직 E2E나 Phase A 전체 성공으로 해석하지 않는다. Stage의 업무 목적과 현재 결과 계약은
[Workflow Architecture](workflow-architecture.md#3-phase별-책임)를 따른다.

## 4. Current Responsibility Boundaries

| 소유자 | 현재 책임 | 경계 |
| --- | --- | --- |
| Human / CLI adapter | workflow·입력, Task Approval, Review / Delivery / Cleanup, 결과 표시 | application 내부 flow / Domain 검증을 소유하지 않음 |
| Governance application | System Policy·위임·승인 근거·Scope와 Authorization·Reservation·Claim | 상태 조회나 Schema parsing을 승인·실행 권한으로 해석하지 않음 |
| Phase A Workflow | Staffing→Approval 및 승인 Scope의 순차 Decision→Comparison API 조합 | Governance 정책·v2 Evidence·v3 참조 검증을 재구현하지 않음 |
| LangGraph Runtime Foundation | Phase A State / 정책 조회→Staffing→Approval·Human 확인→선택적 Specialist 반복·Comparison의 조건부 실행 | 실행·반복·분기는 Graph가, 기능·정책 검증은 Application이 소유. State는 Governance Ledger나 전체 Phase A 완료를 대체하지 않음 |
| Planning application / Codex Planner | 조사·limits·계약 생성 / supplied PlannerContext로 inspect 또는 complete | inspection은 수정 권한이 아니며 Planner는 별도 cwd·제한된 도구 설정으로 실행 |
| Harness contract transformation | ID 주입, Human constraints 보존, Goal의 targetRepository, Zod validation | AI가 시스템 ID나 Human 제약을 소유하지 않음 |
| Execution application / Codex Worker | workspace와 Worker / Scope / Verification / artifacts 연결 / scoped 수정 | 정상 종료 때 workspace를 지우지 않으며 verification command는 Harness가 실행 |
| Decision entry `runDecision` | 입력 검증, Snapshot / Goal / explicit Context와 두 Specialist 구성 | CLI presentation을 알지 않음 |
| Decision Context flow | 공통 Snapshot 서비스 호출, commit 기준 파일 loading | working tree에서 Context를 임의로 읽거나 자동 탐색하지 않음 |
| Decision orchestration / validation | 순차 독립 실행, Snapshot 전후 검사, Evidence exact path / line invariant | Agent끼리 판단 전달·비교·종합하지 않음 |
| Codex Specialist | 제한된 Context로 판단, strict JSON parsing과 schema, Harness identity 주입 | Context와 Evidence의 일치 검증은 flow가 담당 |
| CLI Decision command | runDecision → compareDecisions 조합, 동일 Goal / SHA / Decision 배열 전달 | 두 application 내부의 검증을 중복하지 않음; 별도 domain workflow layer가 아님 |
| Comparison application / compareDecisions | preconditions, Comparator 호출, Reference Validation, ComparisonResult 반환 | Decision 실행·Repository inspection·final recommendation·Conflict 해결을 소유하지 않음 |
| Codex Comparator | supplied ComparisonContext에서 Concern별 Position 관계를 JSON protocol로 구조화 | repository files / tools 미제공, Specialist 재호출·winner·resolution·synthesis 없음 |
| Services | Scope, Verification, execution evidence와 artifact 보존 | 자기 보고를 성공 Evidence로 대체하지 않음 |
| Git / Process infrastructure | HEAD / commit blob, worktree·diff·Delivery 명령, process timeout / lifecycle | Domain의 권한 의미와 Human 결정을 정의하지 않음 |

### Snapshot / Context / Authority

RepositorySnapshot은 `{ repositoryRoot, commitSha }`라는 governed Git state reference다.
공유 schema / type의 소유권은 `contracts/repository/snapshot.ts`, `contracts/specialist/definition.ts`,
`contracts/specialist/authority.ts`에 있다. Decision / Staffing / Governance는 이 계약을 직접 참조한다.
`services/repository-snapshot`은 capture/assert 정책을 소유하고 실제 Git I/O는 infrastructure/git을 사용한다.
Decision의 기존 public API는 contracts/의 동일 schema·type을 직접 re-export하며,
flow/context 경로는 동일 Snapshot 함수의 re-export로 호환성을 유지한다.
불필요한 decision/model/ 호환성 경로는 제거했다.
이는 소유권 이동이며 Specialist authority, Snapshot 검사 시점·순서·실패 의미는 변경하지 않는다.
Capture는 clean 상태만 허용하며 현재 HEAD를 기록한다. Assert는 HEAD 일치와 clean 상태를 확인한다.
Clean은 기존 `git status --porcelain --untracked-files=all` 기준이므로 ignored 파일 전체 검사가 아니다.
호출 전후 시점 검사이며 Repository lock이나 중간에 바뀌었다 복원된 상태까지 감지하는 기능은 아니다.
Generic checkpoint나 Repository 복사본으로 해석하지 않는다.

contracts/는 Goal / Task를 루트에 유지하고 Repository(snapshot / inspected-file / context-access-policy),
Specialist(definition / authority), Staffing(system-policy)으로 분류한다. SpecialistDefinition은 ID·역할·기본 전문 업무를 정의한다.
StaffingSystemPolicy는 이 정의와 공통 SpecialistAuthority를 기존 평면 등록 항목으로 조합하고 ContextAccessPolicy와 Inspection Limits를 함께 관리한다.
계약은 Application workflow나 파일 I/O에 의존하지 않는다. TaskContract 파일 읽기·JSON parsing·Schema
검증을 연결하는 loadTaskContract()는 cli/commands/execute에 두고 기존 오류 전달 의미를 유지한다.

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

Artifacts Service는 Run Directory와 Artifact 경로·보존 순서·실패 의미를 소유하고, Git I/O는
`infrastructure/git`에 위임한다. `getExecutionBaseCommit`은 getRepositoryHead를 재사용하며
`workspace/workspace-patch.ts`의 writeWorkspacePatch는 격리된 임시 Index와 출력 descriptor·cleanup을 관리해 binary /
full-index Patch를 크기 제한 없이 파일에 저장한다. 리뷰용 getWorkspaceDiff의 제한·truncation 정책과는
분리한다. `workspace/changed-paths.ts`의 getWorkspaceChangedPaths는 null-delimited Git 경로를 수집·중복 제거·정렬하고,
Evidence Service는 ExecutionEvidence 타입과 기존 수집 실패 context를 유지한다. Execution stage 순서와
최종 결과 구성은 기존 Application이 담당한다.

Human gate와 Delivery는 실행 성공과 별개다. Duration telemetry는 운영 데이터이며 Evidence와 구분한다.
CLI의 Goal flow Total은 이후 Human 대기를 포함할 수 있지만 Execution snapshot timing은 포함하지 않는다.
Decision Duration은 input 완료 후 Specialist / Comparator 실행·표시 구간의 전체 시간이며 개별 runtime tracing backend는 없다.

## 5. Target Responsibility Model

### v4 결정과 구현 상태

목표 실행 순서·전환 조건은 [Workflow Architecture](workflow-architecture.md#2-organization-workflow-execution-contract)를 따른다.
여기서는 기존 Application의 모델·권한·재사용 책임을 설명한다. 현재 Graph 분리와 State 배치는 구현 사실이며
Organization을 최상위, Phase A / Phase B를 주요 Subgraph로 두는 목표 계층을 결정했다. 미구현 Graph·Output과 후속 과제는 [Step 2.5 검토 기록](workflow-architecture.md#next-architecture-review--step-25)을 따른다.

v4 목표는 **CEO Governance / AI Organization Orchestration의 전체 E2E lifecycle**이다.
Phase A에서 CEO는 조직을 제안하고 Specialist의 독립 판단을 종합해 해결 방향에 대한 Human 승인을 받는다.
Phase B에서는 승인된 방향을 개발 업무로 분해하고 여러 전문 직원의 상세 설계·구현·테스트·리뷰,
의존성·진행·실패·재작업·재배치를 계속 관리하며 최종 Executive Report를 Human에게 전달한다.
전체 목표는 [AI Development Organization](project-direction.md#최종-목표--ai-development-organization)이며,
단계별 구현 상태는 [Roadmap](roadmap.md#v4--ceo-governance--ai-organization-orchestration)을 따른다.

| 항목 | 확정된 결정 | 현재 구현 상태 |
| --- | --- | --- |
| Workflow Runtime | LangGraph.js 채택 | Phase A가 Staffing / Approval을 직접 조정하고 명시적 실행 대상에서 Specialist Decisions / Comparison, Synthesis 및 Human Direction Governance를 연결. Staffing CLI는 Phase A의 staffing-approval을 사용. Phase B Graph는 Work Decomposition, Assignment Plan 준비, 명시적 Specialist 읽기 실행과 상세 계획 보류 상태를 지원하며 Organization Graph는 미구현 |
| Agent Execution Runtime | 기존 Codex 기반 실행 우선 재사용 | v0–v3 integration 및 v4 CEO Staffing Adapter 구현; 전체 조직 실행 연결은 Planned |
| Domain / Governance | AI Workspace Harness 소유 | 기존 의미를 보존하고 v4 정책·계약은 단계적으로 설계 |
| Framework Integration / Verification | v4 구현 단계에서 통합·E2E 검증 | 별도 채택 평가 checkpoint / 선행 Runtime Spike 없음 |
| 기존 capability | v0–v3 Application API / Domain Model 재사용 | 기존 Planning / Execution / Decision / Comparison 동작 유지 |

### v4 Target Workflow — Planned

다음은 두 Phase로 구성한 목표 Workflow다. 기반 schema와 Context Discovery의 구현이 전체 Workflow의
완료를 뜻하지 않는다. CLI는 v0–v3와 명시적 Staffing / Governance 명령을 제공한다. 승인 Scope의 Decision·Comparison, CEO Synthesis와 Human Direction Governance는 Phase A에 구현했다. Organization Graph와 Phase B는 예정 상태다.

#### Phase A — Decision & Approval

목적은 무엇을 어떻게 해결할지 결정하고 Human의 승인을 받는 것이다.

목표 순서와 각 승인 경계는 [Phase A 실행 계약](workflow-architecture.md#phase-a--decision--approval)에 모았다.
Staffing·권한 발급·독립 판단·Comparison 이후 CEO Synthesis와 Human Direction Governance를 거쳐야 한다.

초기 Staffing Approval은 분석 조직·Context·호출 예산에 대한 승인이고, Human Governance는 종합된
해결 방향에 대한 최종 판단이다. 두 승인은 서로 다르며 코드 변경 전체의 포괄 승인도 아니다.
StaffingDraft / Proposal은 권한이 아니다. 목표 흐름에서는 승인 후에도 Harness가 Scope와 최신 권한을
검증하고 예산을 확보하여 실행 입력을 발급해야 한다. `evaluateInvocationRequest()`는 Eligibility를 평가한다. 후속 Scope 발급, Reservation, Claim 및 단일 Specialist 실행은 각 Governance / Workflow 경계에서 수행한다.
기존 v2 CLI가 이 후속 v4 Authorization을 이미 통과해 실행되는 것으로 해석하지 않는다.

이 Phase의 Specialist 판단은 v2의 read-only / supplied Context / 같은 비교 단위의 Snapshot / 독립성 원칙을
재사용한다. CEO의 추가 분석·재검토 요청은 후속 조직 Workflow에서 Context·권한·예산을 재검증할 별도
작업이며 현재 v2의 자동 재질의·토론 기능이 아니다. CEO는 Recommendation, Rationale, Evidence,
Trade-off, Unresolved Issues를 검토하고 근거 부족 시 Human에게 Escalate해야 한다.

#### Phase B — Detailed Design & Execution

목적은 승인된 해결 방향을 수행 가능한 개발 업무로 구체화하고 여러 직원의 결과를 관리하는 것이다.

목표 반복 흐름은 [Phase B 실행 계약](workflow-architecture.md#phase-b--detailed-design--execution),
진입 조건은 [Phase Handoff 계약](workflow-architecture.md#4-phase-a--phase-b-handoff-contract)을 따른다.
업무 분해·Planning·실행·검증·진행 평가·Human Review / Delivery·보고를 구분한다.

CEO는 Phase A 이후에도 업무 의존성, 진행 상태, 실패와 산출물·Evidence를 검토하며 Continue / Rework /
Reassign / Escalate / Complete를 판단한다. Harness는 두 Phase 전체에서 Context / Authority / Scope /
Budget / Evidence / Verification / Human Approval을 통제한다. 재작업·재배치는 기존 승인 범위 안에서만
진행하며 범위를 바꾸면 필요한 승인과 Authorization을 다시 거쳐야 한다. Reject / 승인 대기 / validation
실패 시 실행하지 않고, Override도 변경 내용에 대한 검증과 필요한 승인을 충족해야 한다.

현재 v2 Specialist는 read-only Decision Agent다. 미래의 설계·구현·QA·리뷰 업무 수행은 역할과 승인된
권한에 맞는 실행 경계가 추가로 필요하며 현재 Specialist runtime에 write 권한을 주는 근거가 아니다.
실제 병렬 실행, 다중 Writing Worker, 다중 Worktree 통합·충돌 해결과 CEO 진행 관리는 미구현이다.
각 업무의 산출물·승인 대상과 통합·실패·종료 정책은 후속 설계 대상이며 여기서 새 Schema를 확정하지 않는다.

### Assignment와 Repository 실행 계약

| 현재 모델 | 책임과 산출물 | 포함하지 않는 의미 |
| --- | --- | --- |
| StaffingAssignmentDraft | Specialist ID / 이번 Goal의 판단 objective / contextPaths / 선택 rationale을 제안 | 실행 Scope, SpecialistAuthority, Approval 또는 상세 구현 계약 |
| StaffingAssignment | 위 제안에 Harness 소유 assignmentId를 포함하는 공식 Proposal의 항목 | Human Approval이나 운영 권한 발급 |
| TaskDraft | objective / targetRepository / allowedPaths / forbiddenPaths / constraints / acceptanceCriteria / verification을 담는 구조화된 Repository 실행 명세 초안 | Staffing 선택이나 승인된 해결 방향 자체 |
| TaskContract | Harness가 TaskDraft에 id / goalId를 부여하고 원본 Goal의 targetRepository와 Human Constraints를 보존한 v1/v0 실행 계약 | 모든 업무 유형의 범용 계약이나 후속 Delivery의 포괄 승인 |

현재 TaskDraft는 TaskContract schema에서 id / goalId를 제외해 파생한다. 기존 v1의 목적은 자연어 Goal을
Codex Worker가 수행할 구체적인 업무 명세로 변환하는 것이며, 이 의미와 Planner를 유지한다.
현재 StaffingAssignmentDraft는 Phase A의 판단 업무 제안이다. Phase B의
Work Item과 Specialist Assignment는 **Proposed Concept**이며 현재 타입·Schema·API가
존재하지 않는다. 이를 현재 StaffingAssignment와 동일시하거나 필드·파일 구조를 선행 확정하지 않는다.

목표 관계는 분석 배치 → AgentDecision → CEO 종합 → Human의 해결 방향 승인 → CEO의 업무 분해 →
Repository 변경 계약이 필요한 개별 업무의 v1 Planning 구체화 → Harness 계약 구성·Task 승인·실행·검증이다.
분석·판단, 문서 설계, 코드 구현, 테스트, 리뷰는 서로 다른 산출물과 권한을 가질 수 있으므로 모든 업무에
TaskDraft를 강제하지 않는다. Repository 실행 계약이 필요한 업무에는 기존 TaskDraft / TaskContract를 적용한다.

### v1 Planning과 v4 CEO의 Application 책임

v4는 **What & Why / Governance**를 맡는다. CEO는 문제·불확실성의 해석, 전문가와 Context / Budget
배치 제안, 판단·Comparison의 orchestration, Synthesis와 해결 방향 제안, 승인 후 업무 분해·배치·진행
평가·재작업·재배치·Escalation·보고를 담당한다. 해결 방향의 최종 승인은 Human에게 있고, Harness가
검증·권한 통제를 소유한다. 현재 구현된 CEO Staffing 호출·Loop와 이 전체 목표 책임을 구분한다.

v1은 **Task Planning & Execution Contract**를 맡는다. Repository Context에서 개별 작업의 objective,
수정 가능·금지 경로, Constraints, Acceptance Criteria와 Verification을 구체화하고 TaskDraft를 만든다.
Harness의 buildTaskContract()가 계약을 최종화한다. CLI는 계획을 표시하며 Phase B는 Governance의
Execution Source 등록과 실행 허가를 거쳐 계약을 Worker에 전달한다.

| 사용 맥락 | 결정 범위 | 현재 상태 |
| --- | --- | --- |
| Standalone v1 | Human Goal과 Repository Context에서 구체적인 실행 작업을 계획 | 현재 Plan only. 실행은 Phase B 승인 경로에서 수행 |
| v4-integrated v1 | Human이 승인한 해결 방향과 개별 구현 업무를 실행 계약으로 구체화 | 개별 Repository 변경 Work Item을 계획하고 승인된 Execution Source를 등록 |

IntentAnalysis의 problem / desiredOutcome / considerations / uncertainties는 CEO의 Goal 해석을 나타내는
**데이터 모델**이다. 현재 CEOStaffingDecision의 propose 분기에 포함된 StaffingDraft.intent로 생성되며
별도 v1 Planner 호출이나 범용 Planning Engine이 아니다. 두 기능 모두 Goal을 이해하지만 CEO의 목적은
문제 이해와 전문가 판단·배치의 근거를 만드는 것이고, v1의 목적은 실행 계약을 만드는 것이다.
공통 Intent Analysis 모듈을 추출하거나 두 Application의 State / Loop를 통합하지 않는다.

Phase B Work Decomposition은 Work Item의 목적·산출물·의존성을 정의한다. Specialist Assignment는 해당 업무에서 맡을 역할과 작업을 표현한다. 기존 Phase A StaffingAssignment는 분석 배치 계약으로 유지한다. Repository 변경 업무의 상세 계획에서 기존 TaskDraft / TaskContract를 활용한다. 세 개념과 실행 권한의 관계는 [Phase B 실행 계약](workflow-architecture.md#phase-b--detailed-design--execution)을 따른다.

### CEO와 Planner의 handoff — Planned

초기 설계는 승인 방향과 개별 구현 Assignment를 한 번에 Planner에 전달하는 흐름을 가정했다. 복수 Work Item에서는 선행 산출물이 상세 계획의 입력이 될 수 있어, R5는 [Planning Coordination & Detailed Planning](workflow-architecture.md#r5--phase-b-planning-coordination--detailed-planning)에서 업무별 계획 시점과 개별 계획 수립을 구분한다. R5.1 / R5.2는 기존 v1의 독립 호출을 보존하면서 개별 Work Item Planning 입력을 확장했다. R5.3 / R5.4는 Phase B Graph에서 명시적으로 선택한 Work Item의 Planning을 순차 실행하고 결과를 기록한다. 검증된 선행 결과 전달은 후속 실행 계약에서 다룬다.

현재 runStaffing()은 CEO의 Draft를 검증·최종화해 StaffingProposal / Escalation / Failure를 반환할 뿐
planTask(), Specialist Decision 실행, Comparison을 호출하지 않는다. 공통 Snapshot 모델·검사 서비스 재사용은
이 use-case들의 실행 연결과 다르다. 현재 Decision CLI의 runDecision() → compareDecisions() 조합도
CEO Staffing이나 Planning handoff와 독립적이다.

### 책임과 소유권

| 주체 | v4 책임 | 권한 경계 |
| --- | --- | --- |
| CEO Agent — Autonomous Decision Maker | Phase A 판단·종합·제안, Phase B 업무 분해·배치·의존성·진행·실패 평가·재작업·재배치·Escalation·최종 보고 | 판단과 제안은 자율적이나 승인 없이 authority / scope / budget을 확대하거나 실행을 허가할 수 없음 |
| Specialist | Phase A 독립 판단, Phase B 배정에 따른 분석·설계·구현·테스트·검토. 담당 Specialist에 결과 출처를 연결 | Phase A는 승인 Context의 읽기 전용·Shell 비활성화 실행. Phase B 수정은 별도 개별 Assignment Authorization 필요 |
| Codex Worker | Specialist의 Repository 수정에 재사용하는 내부 Worktree 실행 Runtime | 조직 구성원에 해당하는 책임은 Specialist가 소유. Runtime은 승인 계약에 따라 실행하며 Harness가 독립 Verification을 수행 |
| Planner | 승인된 방향과 개별 업무를 실행 명세로 구체화 | 기존 Goal → TaskDraft / TaskContract를 재사용. Phase B Planning 기능이 승인 참조에서 개별 업무의 상세 계획 입력을 구성하며 Phase B Graph가 선택된 업무의 계획을 조정 |
| Harness — Governance & Control Owner | Authority / Scope / Budget 정책, Staffing validation, approval enforcement, Context isolation, schema / reference / Evidence validation, TaskContract / Repository execution, Verification | 실행 허용 조건과 Domain 의미를 소유하며 Human의 최종 권한을 보존 |
| LangGraph.js — Workflow Runtime | Workflow state management, conditional routing, agent coordination, interrupt / resume, checkpoint / recovery, execution lifecycle | 실행 메커니즘을 담당하며 Governance policy / approval의 의미를 정의하지 않음; 실제 지원 동작은 통합에서 검증 |
| Codex — Agent Execution Runtime | 개별 CEO / Specialist 등 모델 호출, prompt / Context 전달, structured output 생성, 개별 Agent 실행 | LangGraph.js로 대체하지 않음; 기존 통합 재사용; CEO Staffing 호출 구현, 전체 조직 실행 연결은 Planned |
| Human — Final Authority | Goal / Constraints, Staffing Approval, Governance Approve / Override / Reject, Task Approval, Change Review, Apply / Commit / Push | 각 승인은 독립된 대상과 의미를 가지며 다른 권한의 포괄 승인이 아님 |

Phase B Work Item은 목표·산출물·의존성과 선택적 근거·추천 역할을 정의한다. Specialist의 업무 책임과 접근 상한은 Assignment에 둔다. Phase B는 Specialist 중심 Assignment Plan을 등록하며 직접 Work Item 실행을 차단한다. Governance는 Read Reservation과 Claim을 검증하고 승인 Snapshot으로부터 한 번의 제한된 Context 조회를 허용한다. Phase B는 명시적으로 요청한 Specialist 읽기 실행과 Evidence 검증 결과를 기록한다. Assignment 완료 및 상세 계획과 쓰기 실행은 후속 계약에서 연결한다. Specialist가 구현을 소유하는 Phase B 목표는 기존 Planning·Execution Application과 Codex Worker를 재사용하며, Capability와 이번 실행의 Authority를 구분한다. 변경 근거와 완료 기준은 [Phase B Step 5.3](workflow-architecture.md#phase-b-step-53--multi-specialist-capability--governed-execution)에 둔다.

### 통합 시 지켜야 할 invariant

- 기존 `planTask()` / `executeWorkItem()` / `runDecision()` / `compareDecisions()`와 Domain Model을 재사용한다.
  Decision 생성과 Comparison의 독립 capability 경계를 유지하고 각 application에 전체 조직 workflow를 숨겨 넣지 않는다.
- LangGraph.js가 workflow state와 순서를 실행하더라도 Governance 전이의 허용 조건·의미는 Harness가 정의한다.
  Framework state / run / node가 core Domain Model에 불필요하게 누출되지 않도록 한다.
- Human Approval은 단순 interrupt가 아니다. 승인 주체·대상·내용·유효 조건을 Harness가 검증하고
  staffing 승인, Governance 승인, Task Approval, Review / Apply / Commit / Push를 분리한다.
- 전체 LangGraph State를 Specialist에게 자동 전달하지 않는다. 승인된 Context만 projection하고
  Phase A의 같은 비교 단위에서는 Snapshot / Goal과 Specialist 간 독립성을 보존한다. Phase B는 승인된
  업무별 Context와 실행 기준 상태·제한된 authority를 검증하며 변경 후에도 최초 commit이 같다고 가정하지 않는다.
- Workflow checkpoint는 실행 재개용 상태다. 영구 Governance / Provenance Record의 의미·보존 정책을
  대신하지 않으며 checkpoint만으로 승인 이력·Decision / Evidence traceability가 보장되지 않는다.
- 승인 후 resume / retry / replay에서 Worker / Apply / Commit / Push의 중복 실행 위험을 다룬다.
  Side effect 완료 여부와 재실행 허용 조건을 확인하고, stale approval이나 변경된 Repository 상태로
  실행하지 않도록 설계·테스트한다. 현재 exactly-once 실행이나 crash recovery가 구현됐다는 주장이 아니다.
- CEO 판단 품질과 runtime 실행 안정성을 별도로 검증한다. Schema / reference 통과가 recommendation의
  의미적 타당성을 증명하지 않으며 workflow 완료가 Agent 품질이나 Multi-Agent 우위를 입증하지 않는다.

현재 Organization State와 Phase A graph / State / Node 배치는 Runtime Foundation 절의 실제 구현을 따른다. 후속 Node / checkpoint backend / Domain type은 이 문서에서 선행 확정하지 않는다. 실제 책임과 요구가 생길 때 설계하며 generic SpecialistRunner,
provider registry, 공통 Codex abstraction도 미리 만들지 않는다. 도입 원칙은
[Project Direction](project-direction.md#build-vs-adopt), 단계별 구현과 완료 기준은
[Roadmap의 v4](roadmap.md#v4--ceo-governance--ai-organization-orchestration)를 따른다.

### v4 Step 1.3 — Authority Core Model— schema만 구현

`application/governance/model/authority.ts`는 조직 운영 권한의 Domain 데이터를 소유한다.
Core Model은 strict Zod schema / inferred type을 제공한다. Step 1.4의 순수 Authority Evaluation을
추가했다. CEO Staffing 호출과 Loop는 Step 2.3에서 구현했으며 Policy Engine / 전체 Workflow 실행은
미구현이다. LangGraph State와 결합하지 않는다.

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
- AuthorizedSpecialistInvocation: invocation ID, 기존 Goal / Snapshot / Specialist 정책 등록 항목(Identity와 Authority) / InspectedFile[]을
  사용한다. 파일은 후속 enforcement가 승인된 Snapshot에서 구성해야 하며 parse 성공은 실행 권한이 아니다.
- AuthorityVerdict: allowed는 Invocation을 포함하고 approval-required / denied는 reason을 포함한다.
  Harness의 검증 결과를 표현하는 구조일 뿐 현재 정책 평가로 Verdict를 생성하지 않는다.

Scope assignments / assignment contextPaths / request requestedContextPaths / invocation files는 최소 1개,
version / maxAgentInvocations는 양의 정수다. Schema는 필드 구조와 값 범위를 검증하며 approvalRecordId의
실재·유효성, policy 적합성, Specialist 등록, Context 권한, Snapshot 실제 상태, budget 잔여량과 중복
Invocation을 검증하지 않는다. Invocation ID는 향후 budget reservation / 중복 실행 제어의 연결점이다.

Snapshot / Specialist / Authority의 공유 schema는 contracts에 두고 기존 Decision export와 타입 shape를
유지한다. GoalSpec / InspectedFile schema를 재사용하며 AgentDecision을 복제하거나 변경하지 않는다.

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
Decision loader의 absolute / traversal 거부와 일치하면서 모호한 표현을 더 제한한다. 경로 predicate는 Step 2.2에서 공통 capability로 추출했으며 기존 loader의 accepted spelling과
v2 동작은 유지한다. 파일 읽기를 포함한 private use-case를 Governance에서 import하지 않는다.
파일 존재·Git blob·symlink·Snapshot 검증은 수행하지 않는다.

Evaluation은 요청이 제공된 승인 범위와 사용량에 부합하는지 판단한다. eligible은 실제 실행 허가나
예산 확보가 아니다. 이 순수 함수는 Budget Evaluation만 담당한다. Step 4 Authorization이 Ledger의
Reservation 수로 사용량을 구성하고 lock/atomic save로 예산을 확보하며 Snapshot 기반 실행 입력을 발급한다.
실행 결과 Usage Recording이나 자동 환불·재개는 미구현이다. 현재 함수는 AuthorityVerdict / Invocation을 생성하지 않으며 I/O나 상태 변경이 없다.
기존 v0–v3 실행 경로에는 연결하지 않는다.

### v4 Step 2.1 — Intent & Staffing Domain / Protocol — schema만 구현

```text
Human GoalSpec + RepositorySnapshot + Available Specialists + Repository Context
→ CEOStaffingDecision
   ├─ propose → StaffingDraft
   ├─ inspect → Inspection Request
   └─ escalate → Human Clarification
→ Harness Finalization / Validation (R2 implemented) → StaffingProposal
→ Human Staffing Approval / Delegation (Step 3 implemented) → ApprovedOperatingScope issuance (Step 3 implemented)
```

`application/staffing/model/staffing.ts`는 CEO의 해석인 IntentAnalysis와 공식 제안인
StaffingProposal / StaffingAssignment를 정의한다. Proposal은 원본 Human GoalSpec과 Constraints,
Harness가 확보한 RepositorySnapshot, Harness 소유 Proposal / Assignment ID를 보존할 구조다.
IntentAnalysis는 원본 Goal을 대체하지 않는다. 원본 보존·ID 발급은 아래 R2의 Finalization 책임이며
schema parsing이 출처·발급·Constraints 준수를 증명하지는 않는다.

`protocol/ceo.ts`는 model schema에서 Harness 소유 필드를 제외하여 StaffingAssignmentDraft /
StaffingDraft를 파생하고 strict discriminated union인 CEOStaffingDecision을 정의한다.
의존성은 protocol → model 방향이며 순환 import나 중복 schema가 없다. CEO는 업무·Context·Budget과
선택 이유를 제안하지만 Goal / Snapshot / ID / Approval / Authority를 Draft에 주입할 수 없다.
Specialist ID는 공통 contracts 소유 SpecialistDefinition을 참조하며 schema를 복제하지 않는다.
Assignment objective는 이번 Goal의 위임 업무이고 SpecialistDefinition.objective는 기본 역할·책임이다.

모든 외부 object는 strict하며 필수 문자열은 non-empty, Budget은 양의 정수, assignments /
contextPaths / inspect paths / escalate questions는 최소 1개다. considerations / uncertainties는 빈 배열을
허용한다. Schema는 구조만 검증한다. Specialist 등록·역할 적합성, Context 경로 안전성·접근권·파일 존재,
Budget 정책 상한, 실제 Snapshot 상태, Human Approval은 검증하지 않는다. Proposal parsing은
ApprovedOperatingScope를 발급하지 않으며 inspection parsing도 파일 접근 권한을 만들지 않는다.

Step 2.1은 schema / inferred type / unit test / public API를 구현했다. Repository Context Discovery는
아래 Step 2.2에서 구현했고 CEO Staffing 호출·Loop는 Step 2.3에서 연결했다. Finalization / 제한된 Policy
Validation은 R2에서 구현했고 Staffing Approval / Scope 발급은 Step 3에서 연결했다. 이 Staffing protocol·Loop는 LangGraph Step 2의 run-staffing Node에서 기존 runStaffing()을 통해 호출한다.

### v4 Step 2.2 — Snapshot 기반 Staffing Context Discovery — 구현

```text
Harness: Original Goal + Registered Specialists + Context access scopes + Inspection limits
→ discoverStaffingContext()
  → captureRepositorySnapshot() / assertRepositoryMatchesSnapshot()
  → commit tree (path / mode / byte size) → scope-authorized regular files
  → commit blobs: root package.json scripts / AGENTS.md
  → Goal exact-mention initial file selection → commit blob Context
  → Snapshot assert → Harness-owned StaffingContextState
→ createStaffingContext() → CEO-facing StaffingContext (cloned projection)
→ CEO inspect request → inspectStaffingContext(state, request)
  → Snapshot assert → path / policy / file mode / count / size / budget checks
  → commit blob loading → total serialized Context size check → Snapshot assert
  → ready(new state) | failed(reason), input state unchanged
```

Staffing의 `flow/inspection/discover-context.ts`는 입력 검증·Snapshot capture/assert·초기 Context 구성과 결과 반환을
조율한다. `flow/inspection/context-policy.ts`는 파일 접근·mode·count·byte 예산의 순수 검사,
`inspect-files.ts`는 검증 완료 후 Metadata / Git blob 로딩·직렬화 크기 재검사·새 State 구성,
`initial-seeding.ts`는 기존 Goal mention 기반 optional seeding을 담당한다. State 타입은
`model/state.ts`에 두며 기존 Staffing public API와 flow의 타입 export 경로는 유지한다.
Snapshot 검증 시점과 외부 동작·실패 의미는 이 책임 분리로 변경하지 않는다.

`services/repository-inspection`은 v1의 exact path / unique basename / README mention 선택,
package scripts 추출, 내부 디렉터리 제외와 v2 / Governance의 경로 predicate를 공유한다.
Planning은 기존 Working Tree 읽기·정규화 허용 범위·Fast Path·TaskContract 생성과 초기 64 KiB/file /
128 KiB Context·파일 수 제한을 유지한다. Staffing은 Planning private flow나 planTask를 호출하지 않는다.
공유되는 것은 조사 선택·metadata parsing·경로 정책이며 PlanningState / PlannerContext / loop는 아니다.
`createStaffingContext`는 기존 Planner projection과 같은 책임 분리 방식을 따르는 별도 Staffing 계약이다.

공통 services/repository-snapshot에서 Snapshot capture/assert를 재사용하고 파일 내용은 기존
readRepositoryFileAtCommit으로 읽는다. 새 Git mechanism은 `git ls-tree -r -l -z --full-tree <full SHA>`로
동일 commit의 파일 목록·mode·크기를 제공한다. Git 출력은 8 MiB로 제한하며 symlink(120000),
gitlink/submodule(160000), directory를 Context 대상에서 제외한다. Working Tree 파일로 대체하거나
symlink를 따라가지 않는다. HEAD 변경·dirty 상태는 생성과 추가 조사 전후에 실패한다. Ignored 또는
skip-worktree로 로컬 변경이 status에 나타나지 않아도 읽는 것은 commit blob이므로 내용이 섞이지 않는다.
Snapshot assert는 Repository lock이나 실행 중 모든 순간의 무변경 증명이 아니다.

R4에서는 Context Discovery(Goal 관련 파일 선택)와 Access Policy(접근 가능한 최대 범위)를 분리한다.
Harness가 `contextAccessPolicy: { allowedScopes: PathScope[] }`를 공급한다. `file`은 정확한 파일 하나,
`directory`는 `path + "/"` 아래의 파일만 허용한다. 예시 경로인 `src/ui`가 `src/ui-extra`를 허용하지 않는다.
범위가 없거나 비어 있으면 접근을 거부한다. Repository root를 뜻하는 `.`도 모호한 경로로 거부하며,
glob / deny rule / metadata 전용 권한은 도입하지 않는다.

contracts/repository/context-access-policy.ts는 strict 구조 Schema와 z.infer 타입을 정의한다. repository-inspection의
validateContextAccessPolicy / isContextPathAllowed / isContextScopeContained가 기존 경로 안전성 규칙을
재사용하여 범위 해석과 포함 관계를 담당한다. Schema parsing만으로 경로 안전성이나 승인 출처가 증명되지는 않는다.
Discovery는 같은 Commit의 regular 파일 목록에 이 정책과 기존 민감 경로 차단을 적용한 뒤 CEO에 노출한다.
Content 요청과 root metadata 로딩에서도 정책·파일 안전성·예산을 다시 검사한다. Initial Seeding의 파일
선택 규칙은 바꾸지 않고 필터링된 fileTree에서 기존 v1 선택 기능을 재사용한다.

Traversal / absolute / dot / empty segment / backslash / colon / control character는 거부한다.
내부 디렉터리와 .aws / .ssh / .codex / .agents, .env 계열, private key 확장자, symlink / gitlink는
허용 범위 안에 있어도 차단한다. 이는 임의 파일의 secret 탐지 보장이 아니며 정책의 적절성과 등록
Specialist의 출처는 Harness 호출자가 책임진다. Repository instructions와 content는 untrusted data다.

신규 System Policy와 Discovery는 필수 `contextAccessPolicy` 하나만 받으며, `allowedContextPaths`는
빈 배열이어도 거부한다. 공통 접근 검증 서비스에는 Legacy 변환을 두지 않는다.
과거 System Policy는 별도 Historical Schema로 원형을 읽는다. Exact 목록 형식, 새 Scope와 빈 Legacy
목록이 함께 있는 형식, nested policy / enforcementRules 형식 모두 현재 정책으로 사용할 수 없다.
신규 Staffing 입력에서는 구조 검증에 실패하고, 저장된 현재 정책이 과거 형식이면 Approval·Scope 조회와
새 위임 설정을 차단한다. `governance setup`에서 Human이 새 정책을 명시적으로 재승인해야 한다.
이때 새 버전만 추가하며 서명된 이력은 변환·재작성하지 않고, 기존 위임·Scope는 자동 승계되지 않는다.
과거 Delegation의 범위 변환은 해당 기록의 검증에만 남긴다. Exact 목록은 File로만, 기존 Scope는 원래
자동 승인 범위로만 해석하며 System Policy 접근 상한을 확대할 수 없다.

StaffingInspectionLimits는 요청 파일 수·누적 조사 파일 수·파일 byte 수·fileTree 항목 수·전체 Context의
UTF-8 JSON byte 수를 제한한다. maxFileBytes는 기존 blob reader의 bounded output 안에서 최대 512 KiB다.
Metadata는 별도로 크기를 검사하고 전체 Context에 포함하지만 조사 파일 수 예산에서는 제외한다.
초기 seeding은 v1 선택 규칙과 64 KiB/file / 128 KiB 합계 정책을 사용하며 count 초과는 전체 skip한다.
추가 요청의 중복 path는 거부하고 기존 조사 path는 재로딩·재차감하지 않으며 새 파일이 없으면 실패한다.
구조·접근 정책·mode·선언된 blob 크기·count·raw byte 예산을 batch 전체에서 확인한 뒤 읽는다.
JSON escaping / field overhead를 포함한 실제 Context 크기는 로딩 후 다시 확인하며 초과 시 새 Context를
반환하지 않는다. Binary / invalid UTF-8·없는 파일·malformed metadata도 실패하며 partial state는 반환하지 않는다.

StaffingContext는 원본 Goal / Constraints, Repository name / commit SHA / filtered fileTree / scripts /
instructions, inspectedFiles, 등록 정보에서 id / role / default objective만 뽑은 SpecialistCandidate,
limits / remainingInspectionBudget을 제공한다. 내부 repositoryRoot / manifest / allowlist / authority는
projection에서 제외한다. 원본 GoalSpec.targetRepository 자체의 값은 보존하므로 원본에 포함된 경로를
자동으로 재작성하지는 않는다. 상태는 Harness 소유의 메모리 데이터이며 CEO 입력으로 받아서는 안 된다.
Budget은 Context 파일 수에 관한 값이며 Agent invocation Budget Reservation이나 운영 권한이 아니다.

Step 2.3은 이 public API를 아래 Staffing Loop와 연결하고 R2는 같은 Run의 Proposal을 최종화한다.
Staffing Approval / Scope 발급은 Step 3의 별도 Governance API로 연결한다. 이 Context Discovery 함수는 Specialist나 Graph를 실행하지 않으며, 후속 Specialist 실행은 Step 5.3–5.4 Workflow가 담당한다.

### v4 Step 2.3 — CEO Staffing Agent & Staffing Loop — 구현

```text
runStaffing({ goal, systemPolicy: StaffingSystemPolicy, maxRounds, timeoutMs?, agent? })
→ validate CEO call limits → discoverStaffingContext() → Harness-owned state
→ Snapshot assert → createStaffingContext() (cloned projection) → CEO call
→ Snapshot assert → ceoStaffingDecisionSchema validation (injected Agent도 검증)
   ├─ inspect → 마지막 Round면 즉시 failed(round-limit), 파일 로딩 없음
   │          → inspectStaffingContext() → 새 state → 다음 CEO call
   ├─ propose → 내부 Draft + state → R2 Policy Validation / Finalization
   │          → proposed { proposal, rounds }
   └─ escalate → escalated { reason, questions, rounds }
실패 → failed { failure, reason, rounds } (Draft / Proposal / partial state 없음)
```

`protocol/ceo.ts`의 CEOStaffingAgent는 StaffingContext만 받고 CEOStaffingDecision을 반환한다.
`ceo/codex-ceo.ts`의 runCodexCEO는 기존 runCommand와 v2/v3 Adapter의 실행 설정을 재사용한다.
대상 Repository 밖 임시 cwd, read-only sandbox, ignore-user-config / ignore-rules / strict-config /
ephemeral, approval never, web disabled, project docs 자동 로딩 차단, shell / tools / hooks / plugins /
다른 Agent 기능 비활성화 설정으로 호출하고 성공·실패 모두 cwd를 cleanup한다. Runtime timeout 기본은
호출당 15분이며 timeoutMs로 변경한다. Codex CLI 0.163.0의 help와 실제 호출에서 해당 설정 수용을 확인했다.
기존 Process lifecycle의 하위 process 종료 범위와 플랫폼 한계는 그대로 유지한다.

Prompt는 원본 Goal / Constraints 보존, 후보 Specialist ID 사용, 분석 업무·Context·예산 제안과 최소한의
inspect / 필요한 Human escalate를 지시한다. AGENTS.md와 파일 내용은 untrusted data다. TaskContract,
Harness ID / Approval / Scope / Authority 생성이나 코드 수정·Specialist 실행을 지시하지 않는다.
등록 여부·Assignment 적합성·Draft Context 접근권·운영 예산 정책은 Prompt나 구조 검증으로 보장하지 않는다.
구조적으로 유효한 Draft도 공식 Proposal Finalization / Validation과 Human Approval이 필요하다.

`flow/run-staffing.ts`는 Discovery / CEO Loop / Validation / Finalization을 조합하고,
`flow/orchestration/run-staffing-loop.ts`가 Projection / Inspection을 재사용하며 반복을 제어한다.
maxRounds는 양의 safe integer이고 rounds는 실제 CEO 호출 직전에 증가한다. 실패한 호출도 포함한다.
마지막 Round의 propose / escalate는 가능하지만 inspect는 추가 파일 로딩·호출 없이 종료한다.
매 호출 전후와 각 Inspection의 기존 전후 Snapshot 검사를 보존하며 최종 propose / escalate도 변경된
Repository로 성공하지 않는다. State·Goal은 모델 출력으로 교체하지 않고 매번 Context 복제본을 전달한다.
주입 Agent의 timeout / 취소 구현은 해당 Harness adapter 책임이며 timeoutMs는 기본 Codex Adapter에 적용한다.
자동 retry, durable state, checkpoint나 LangGraph는 추가하지 않는다.

`model/result.ts`의 strict StaffingRunResult는 proposed / escalated / failed와 rounds를 구분한다.
실패 code는 invalid-input / discovery / inspection / agent-process / timeout / malformed-json /
schema-validation / snapshot-drift / round-limit / policy-validation이다. Context 오류나 임의 Agent 예외·raw stderr를 그대로
반환하지 않고 단계별 안전한 reason으로 제한한다. 기본 Adapter의 process 진단은 trusted caller가
예외 cause로 확인할 수 있으며 use-case 실패 결과에는 포함하지 않는다. Escalation의 reason / questions는
CEO 판단 데이터로 그대로 보존한다. 공식 Proposal / Assignment ID는 R2 최종화 성공 시에만 반환하며 승인·Invocation은 없다.

Inspection Budget(파일 수·Context 크기), Staffing Round Limit(CEO 호출 수), Draft의
maxAgentInvocations(이후 Specialist 활동 제안), Approved Scope Budget(향후 운영 권한)은 각각 독립적이다.
이 Loop는 운영 예산 예약이나 Invocation Eligibility / Authorization을 수행하지 않는다.

검증은 Fake CEO와 mock Process로 분기·최종 Snapshot drift·실패·격리 설정·cleanup을 확인한다.
별도로 Codex CLI 0.163.0 실제 단일 smoke run에서 작은 임시 Git Repository, 등록 frontend 후보와 exact
allowlist로 1 Round 직접 propose를 확인했고 HEAD / Working Tree는 유지되었다. 실제 모델의 inspect 재호출,
반복 품질이나 성공률 검증을 했다는 의미는 아니다. 원본 Goal / Snapshot과 Draft의 연결을 보존하는
Proposal Finalization / 제한된 Policy Validation은 아래 R2, Staffing Approval / Scope issuance는 Step 3에서 구현했다.
Authorization은 Step 4, 단일·복수 Specialist 실행 연결은 Step 5.3–5.4에서 구현했다. 당시 미구현이던 CEO Synthesis는 Step 6.2에서 연결했다. Phase B / 전체 Workflow는 미구현이다.

### R2 — Staffing Proposal Finalization & Policy Validation — 구현

`runStaffing({ goal, systemPolicy, maxRounds, timeoutMs?, agent? })`가 단일 Staffing Application
진입점이다. private `flow/orchestration/run-staffing-loop.ts`에서 한 번의 CEO Loop를 실행하고 Draft를
검증·최종화한 뒤 proposed(StaffingProposal) / escalated / failed를 반환한다. 이전의 Draft 전용 공개 API와
runStaffingProposal은 통합·제거했다. StaffingDraft는 CEO의 중간 산출물이며 StaffingProposal과 별개다.
flow 루트에는 run-staffing 진입점과 테스트를 두며 Context 조사는 inspection, 입력·Proposal 검사는
validation/validate-proposal, ID 발급·Schema 구성은 transformation/build-staffing-proposal에 둔다.
System Policy가 등록 Specialist·접근 범위·Inspection limits·maxAgentInvocations의 단일 운영 조건이다.
공통 `contracts/staffing/system-policy.ts`가 Schema와 타입, Inspection Limits를 소유한다. Governance는
Human 설정·승인·정책 버전을 소유하고 Staffing은 이 계약을 받아 검증한다. 기존 Limits 공개 경로는
re-export로 유지한다. 독립 StaffingProposalPolicy / Enforcement Rule Schema와 model/policy.ts는 제거했다.
계약을 공통으로 둬서 Staffing이 Governance workflow를 import하거나 순환 의존을 만들지 않는다.

```text
Harness Goal + System Policy (registration / Context access scopes / limits / maxAgentInvocations)
→ 실행 전 입력 복제·정책 구조 검증
→ discovery에서 Snapshot capture (1회) → CEO Loop
→ 내부 proposed { draft, rounds, state } (public API에는 state 미노출)
→ 같은 state의 Goal / Snapshot / 파일 목록으로 Finalization
→ System Policy로 등록·중복 배치·Context·예산 검사 → Snapshot assert
→ Harness Proposal / Assignment UUID 발급 → staffingProposalSchema → Snapshot assert
→ proposed { proposal, rounds }
```

공개 API는 외부 Draft나 ContextState를 최종화 입력으로 받지 않는다. 임의로 추가된 draft / state가 있어도
그 값은 사용하지 않는다. 원본 Goal과 Snapshot은 CEO 응답으로 교체하지 않고 같은 Run의 private state에서
가져온다. 등록 정보와 정책도 첫 await 전에 복제하여 호출 중 caller / Agent의 입력 변경과 분리한다.
이는 in-process 출처 연결이며 저장소 기반 등록·정책의 진위, durable provenance 또는 암호학적 증명이 아니다.
System Policy는 신뢰 경계 안의 Harness caller가 공급해야 한다. runStaffing()은 원본 Goal과 정책을
첫 await 전에 복제하고 Repository 경로·등록 후보·접근 범위·limits를 그 정책에서만 도출한다.
이전에 별도 인자로 전달하던 repositoryPath / availableSpecialists / limits / policy 등은 함께 주면 거부한다.
validateStaffingProposal(proposal, systemPolicy)도 동일한 전체 계약을 받고 Repository 일치를 확인한다.
독립 runStaffing()은 Ledger에 접근하지 않는다. 아래 Staffing → Approval Workflow가 Governance 공개 조회 API로
최신 승인 정책을 가져와 주입한다.

검증 범위:

- 등록된 Specialist ID만 허용한다. Phase A는 Specialist당 하나의 분석 Assignment만 허용하고 중복 배치를
  거부한다. 선택된 등록 authority는 read-only / shellExecution false여야 한다. 역할·objective의 의미적 적합성은 증명하지 않는다.
- Assignment 내부 중복 contextPaths는 거부한다. 서로 다른 Assignment가 같은 파일을 참조하는 것은 허용한다.
  Context access scopes와 같은 Snapshot의 filtered fileTree, 경로·secret-like 정책, regular mode(100644/100755),
  파일 크기를 모두 확인한다. Symlink / Gitlink / Directory / 존재하지 않는 파일은 허용하지 않는다.
- 기존 inspection policy의 isInspectablePath / requireFile / Context byte 검사를 재사용한다. 전체 배치를
  preflight한 뒤 같은 commit의 Git blob을 읽고 UTF-8 / binary와 실제 JSON 직렬화 Context 크기를 검사한다.
  Assignment당 maxFilesPerRequest, Proposal의 unique 파일 합계 maxTotalFiles, maxFileBytes / maxContextBytes를
  적용한다. Finalization 파일 검사는 CEO의 남은 Inspection Budget이나 Round를 소비·변경하지 않는다.
- Draft의 maxAgentInvocations는 System Policy.maxAgentInvocations 이하여야 한다. 운영 예산 예약은 아니다.
- GoalSpec.constraints는 Human Instructions의 원문이다. 같은 Run의 원본 Goal에서 CEO StaffingContext와
  StaffingProposal.goal까지 순서·내용을 보존한다. CEO는 Goal과 Constraints를 함께 고려하고 모순·불명확함이
  있으면 escalate할 수 있다. Instruction의 보존·전달은 기계적 정책 검사와 별개이며 v1의 원본 보존 원칙을 따른다.
- 운영 제한은 System Policy의 등록 목록·Context Access Policy·limits·직접 maxAgentInvocations로만
  표현한다. 별도 context-paths / specialists / invocation-budget Rule 배열은 없다. 역할·objective의 의미적
  적합성이나 Human 자연어 지시 전체의 충족은 여전히 증명하지 않는다. validateProposal()은 검증한 파일
  내용을 내부 호출자에게 반환하고 위반 시 실패한다.
- unverifiedHumanConstraints 결과 필드는 제거했다. 정책 검증 성공으로 어떤 Human 지시도 검증 완료로 분류하지
  않는다. 향후 Human Approval은 proposal.goal.constraints **전체**를 검토해야 한다. proposed는 구조·명시적
  정책 검증 통과이며 자연어 지시 전체의 의미적 충족, Human 승인 또는 실행 권한의 증명이 아니다.

모든 정책·파일 검사 후 UUID로 Proposal / Assignment ID를 생성하고 Assignment ID 중복도 확인한다.
전역 ID 유일성 저장소·Proposal persistence는 없다. 실패 시 Proposal이나 partial state는 반환하지 않으며
기존 Loop failure / Escalation을 보존한다. 정책 실패는 failed(policy-validation), Finalization 중 Repository
변경은 failed(snapshot-drift)다. 파일·Git 오류의 raw 진단은 결과에 직접 노출하지 않는다.

**proposed는 검증 범위를 통과한 제안이지 승인·실행 권한이 아니다.** Human Staffing Approval,
ApprovedOperatingScope issuance, Budget Reservation, AuthorizedSpecialistInvocation 발급·실행은 수행하지 않는다.
Decision / Comparison / Planning / Execution이나 LangGraph Workflow로 자동 연결하지 않는다.

### Staffing Validation과 Governance 경계

Staffing의 공통 validateProposal()은 CEO Inspection state가 아니라 원본 Goal / Snapshot,
Commit 파일 목록과 filtered fileTree, 원본 Goal / Snapshot 및 하나의 System Policy를 받는다.
최초 Finalization은 private Run에서 이 사실들을 전달한다. 공개 validateStaffingProposal()은 확정된
Proposal을 파싱하고 현재 Snapshot의 파일 목록을 조회하여 같은 규칙을 적용한다. Assignment ID 중복도
별도로 거부한다. packageScripts나 남은 Inspection Budget을 가짜로 구성하지 않는다.

두 byte budget은 독립적으로 검사한다. CEO Inspection은 실제 StaffingContext 전체의 JSON 크기를
측정한다. Assignment Context는 Goal / Snapshot / Draft, fileTree와 전체 System Policy 및
고유 Context 파일 내용을 포함하는 검증 envelope의 UTF-8 JSON 크기를 측정한다. 파일 읽기 전에는
전체 경로·mode·파일 수·크기와 envelope + 원시 파일 크기를 검사하고, 읽은 뒤 JSON escape까지 포함해
다시 검사한다. 두 검사 모두 기존 maxContextBytes를 상한으로 사용한다. 최초 Finalization에서는 실제
CEO Metadata를 포함한 projection에 선택 파일을 넣는 기존 검사도 유지한다. 따라서 새 공통 검사는
추가 제한이며 CEO Context 제한을 대신하지 않는다. 서로 다른 검사 대상의 크기를 같다고 간주하지 않는다.

Governance의 approval/은 신규 승인·기록·Scope 발급 및 저장된 Scope의 유효성 조회를 소유한다.
authorization/은 순수 Invocation Eligibility와 저장 Scope 기반 Authorization·Budget Reservation·실행 입력 발급을 소유한다.
공유 model/authority.ts는 두 영역의 Scope 및 실행 계약을 정의한다. 기존 governance/index.ts API는 유지한다.
Staffing은 Proposal의 유효성을 소유하고 Governance는 이를 재검증한 뒤 승인 근거를 확정한다.

### v4 Staffing → Governance Approval Workflow — 구현

`src/workflows/development-organization/phase-a/entrypoints/run-staffing-approval.ts`의 `runStaffingApproval()`은 개별 Application의 상위
Graph Adapter다. 실행은 현재 createPhaseAGraph()에 위임하고 개별 policyLookup / staffingResult / approvalResult를 기존 반환 계약으로 변환하며 중복 순서·Human 최종화 로직을 갖지 않는다.
Workflow → Application 방향으로만 의존하며 Application은 Workflow를 import하지 않는다.
Graph는 Scope 발급까지만 연결한다. 별도 Step 5.3–5.4의 Specialist 실행·Comparison API는 아직 Graph 미연결이다.

```text
GoalSpec + Repository
  → Governance.getStaffingSystemPolicy()
  → Staffing.runStaffing({ goal, systemPolicy, maxRounds, ... })
      ├─ failed / escalated → 해당 결과 반환
      └─ proposed → Governance.approveStaffingProposal(proposal)
          ├─ approved / denied → 해당 결과 반환
          └─ approval-required → CLI의 Human Confirmation 콜백
              ├─ 거절 / terminal 불가 → rejected
              └─ receipt → 같은 proposal로 approveStaffingProposal(proposal, receipt)
```

정책 조회는 system-policy feature가 소유한다. 기존 서명·권한·Schema·Lock 검증을 거쳐 Repository와
최신 Human 승인 기록, 현재 정책 형식을 확인하고 복제된 configuration과 version을 반환한다.
정책이 없거나 Legacy·무효 기록이면 CEO를 호출하지 않는다. Agent 실행과 Human 대기 동안 Ledger lock을
유지하지 않으며 Approval은 기존 transaction 안에서 최신 정책·위임·Snapshot·confirmation binding을 재검증한다.
시작 시점과 승인 시점의 System Policy version을 무조건 같게 하는 규칙은 추가하지 않았다. CEO 호출 중
정책이 호환 가능하게 바뀌면 현재 정책으로 승인할 수 있다. 직접 Human 확인 후 재제출에서는 기존
binding 검증이 현재 정책 version과 receipt의 일치를 확인한다. 실제 승인 version은 ApprovalRecord와 Scope에 남는다.

CLI 명시 명령은 `staffing <repository> <goal.json>`이다. Goal의 원본 Constraints를 보존하며 기존 selector와
Governance 명령은 유지한다. CLI가 formatGovernanceReview() / confirmHumanAction()을 제공하고 Workflow는
파일 저장·재로딩 없이 메모리의 동일 Proposal을 재제출한다. 콜백에는 분리된 review 사본만 전달한다.
콜백이 없으면 approval-required request를 반환한다. 이는 durable 대기·재개가 아니며 Receipt는 기존대로
process-local / 일회용이다. 성공은 ApprovalRecord와 ApprovedOperatingScope 발급까지이며 실행은 시작하지 않는다.
이 메모리 연결은 외부 Proposal JSON의 암호학적 발급 출처를 인증하지 않는다. 별도 Registry·서명은 추가하지 않았다.

### v4 Step 3 — Staffing Approval & Human Delegation — 구현

```text
Human-approved System Policy + optional Human Delegation Policy (local signed ledger)
+ StaffingProposal → approveStaffingProposal()
→ current System Policy로 기존 Staffing 파일·등록·Authority·예산 검사 재수행
→ active Phase A delegation의 Repository / Specialist / exact Context / budget 평가
   ├─ 범위 내 → 새 human-delegation ApprovalRecord
   ├─ 범위 밖 / 위임 미설정 → approval-required (원본 제안 digest에 연결)
   │   → CLI가 실제 controlling terminal 확인 → direct-human ApprovalRecord
   └─ System Policy 위반 / 위임 철회·만료·불일치 / 신뢰 실패 → denied
→ 최신 Snapshot / 정책 재검사 → 기존 approvedOperatingScopeSchema로 Scope version 1 발급
→ Proposal + ApprovalRecord + Scope를 원자적으로 보존 (Specialist 실행 없음)
```

Approval 상위는 `features/`의 업무별 구현과 `shared/`의 공통 구현으로 구분한다.
각 feature의 flow / model은 해당 업무의 흐름 / 전용 모델을 소유하며, 외부 공개 API는
`approval/index.ts`에 유지한다. 하위 barrel이나 새로운 공개 API는 추가하지 않는다.

- `features/system-policy/`: 운영 정책 모델과 등록·read-only Authority·경로 설정 검증,
  `flow/configure-staffing-system-policy.ts`의 Human 확인 후 정책 저장.
- `features/human-delegation/`: 위임 정책·상태·승인 근거 모델과 System Policy 범위 내 설정 검증,
  `flow/configure-human-delegation.ts`의 설정·교체·철회.
- `features/proposal-management/`: ApprovalRecord 모델, 신규 승인 방식 판단과 저장된 승인 유효성 검증,
  `flow/approve-staffing-proposal.ts`와 `flow/get-approved-staffing-scope.ts`의 승인·조회.
  내부 validation / transformation은 기존 Staffing Proposal 재검증과 Scope 발급 책임을 유지한다.

`approval/shared`는 Approval 업무들이 공유하는 Human 확인·결과 모델과 입력 확인을 모은다.
Governance 공통 `model/ledger.ts`는 Approval의 순수 모델과 Authorization의 Reservation Schema를 조합하며
하위 workflow를 import하지 않는다. Step 4에서 Approval 전용 영역 밖으로 이동했다.
`shared/model/confirmation.ts`는 정책·위임·직접 승인에 공통인 Human 확인 증거 구조를 소유한다.
공개 `StaffingApprovalResult`는 configured / approval-required / approved / denied를 세 업무에서
함께 사용하므로 `shared/model/result.ts`에 유지하며 denied 결과 생성도 이곳에 둔다.
`shared/validation/approval-input.ts`는 일회용 Human 증표 검증을 담당한다. Repository 확인은
Governance 공통 `records/governance-transaction.ts`로 이동해 Approval/Authorization이 공유한다.
같은 모듈의 withGovernanceLedger()는 서비스의 동일 lock 안에서 ledger Schema 검사와 저장을 연결하며
조회·검증·발급·저장을 별개 transaction으로 나누지 않는다. 업무별 설정 검증은 각 업무의
flow/validation에 둔다. Approval과 Governance의 기존 index.ts 공개 API, 결과 형식과 Schema는 유지한다.
CLI 명령 해석·dispatch와 presenters/governance/approval-review의 검토 텍스트 구성도
분리하며 터미널 확인과 기존 명령·출력은 유지한다. `configureStaffingSystemPolicy()`와 `configureHumanDelegation()`은 최초 설정·변경도
Human 확인 없이는 저장하지 않는다. Policy ID / version, Approval ID와 Scope ID는 Harness가 발급한다.
정책 최신 버전은 로컬 ledger가 소유하고 이전 버전은 추적용으로 보존한다. 최초 범위는 phase-a /
read-only / shellExecution false뿐이다. policy expiry는 호출 시점의 시스템 시계로 검사한다.

Human Delegation의 delegatedContextScopes도 같은 공통 PathScope / File / Directory 판정을 사용하지만 CEO Discovery 권한이
아니라 **Proposal 자동 승인 범위**다. 위임의 File은 System의 File 또는 Directory에, 위임의 Directory는
System의 동일하거나 상위 Directory에 포함되어야 한다. 유한한 File 목록을 Directory 권한으로 승격하지 않는다.
독립적인 Staffing Enforcement Rules 계층은 제거했고 Context Access Policy가 접근 상한을 단독 정의한다. StaffingProposal / ApprovedOperatingScope의 contextPaths는 계속 선택된
정확한 파일 목록이다. Directory 정책을 그대로 실행 Scope에 복사하지 않는다. Staffing → Approval Workflow는
Ledger에서 조회한 승인 정책을 공급한다. 독립 Staffing API에서는 신뢰된 Harness caller가 그 경계를 소유한다.

System Policy는 등록 Specialist 전체 정의, Context access scopes, 파일·Context limits와 직접 maxAgentInvocations 상한을 소유한다. Staffing의 공개 validateStaffingProposal()을 재사용해 같은 Proposal Snapshot에서
Git blob·경로·regular mode·중복·예산을 재검증하며 Snapshot을 다시 capture하지 않는다. 입력 JSON이 실제 R2
Run에서 발급됐다는 서명 provenance나 Human Goal 입력자의 신원까지 인증하는 기능은 아니며, 해당 입력 경계는
Harness caller가 소유한다. Human의 직접 승인도
System Policy 위반을 우회하지 못한다. 신규 Human Delegation 입력은 allowedSpecialistIds / delegatedContextScopes / maxAgentInvocations /
expiresAt 네 필드만 갖는 strict Schema다. phase / repositoryAccess / shellExecution / allowedContextPaths /
contextAccessPolicy는 입력에서 거부한다. Phase A·등록 Specialist의 Read-only / Shell-disabled 조건은
System Policy가 소유하고 계속 검증한다. 위임은 실행 권한이 아니라 Proposal 자동 승인 범위다.
Repository identity·정책 ID/version·System Policy version·상태·승인 증거는 Harness가 저장 기록에 연결한다.
위임이 없으면 직접 확인하며 **유효한 위임의 범위 밖**인 Proposal도 직접 확인한다. 반면 철회·만료·
Superseded·System Policy version 불일치·저장 기록 무결성 실패·System 범위를 벗어난 위임 자체는 denied한다.
무효 위임을 없었던 것으로 취급하거나 과거 active 기록을 찾아 Direct / Delegated 승인으로 우회하지 않는다.
Human이 새 정책을 다시 승인해야 한다. 호출 예산은 Proposal/Scope별 상한이며 Goal 간 누적 위임 사용량
관리나 공유 예산 예약은 아니다. 이는 읽기 전용 분석 위임이며 해결 방향·Task·Delivery 승인이 아니다.

과거 nested policy.maxAgentInvocations / enforcementRules 형식은 서명된 이력을 읽기 위한
recordedSystemPolicySchema에서만 원형을 보존한다. Rule payload는 실행·변환하지 않으며, 빈 Rule 배열을
포함해 과거 형식이 최신이면 신규 승인·위임 설정·Scope 유효성 조회를 거부한다. 직접 Human 확인도 이를
우회하지 못한다. 기존 위임 철회는 허용한다. 손실된 제한을 무시하거나 자동 축소/확대 마이그레이션하지 않는다.

기존 Ledger의 Lock / HMAC / Atomic Write와 모든 과거 정책·승인 이력은 유지한다. governance setup에
새 형식의 운영 조건을 명시하면 새 Human 확인을 요청하고, Rule이 승계되지 않음을 고지한다. 실제 확인 후에만
기존 이력을 변경하지 않고 다음 System Policy version을 추가한다. 과거 위임은 새 version에 자동 승계되지
않으며 새 위임 승인이 필요하다. 기존 Scope도 System version 변경으로 무효화된다. 이 호환 처리는 과거 정책의
집행 Engine이 아니라 fail-closed 이력 읽기이며, Schema parsing이나 재승인 요청 자체가 승인은 아니다.

Delegation 입력과 저장 기록 검증은 별개다. humanDelegationPolicyInputSchema는 신규 네 필드만 받고,
humanDelegationPolicySchema는 신규 기록에 Harness metadata를 더한다. Ledger는 별도의
recordedHumanDelegationPolicySchema로 신규 기록과 과거 형식의 기록을 구분해 읽는다. 과거 phase-a /
read / shell-disabled 필드는 역사적 구조 검증에만 남기며, allowedContextPaths는 File 범위로만,
contextAccessPolicy.allowedScopes는 자동 승인 범위로만 해석한다. 두 legacy 범위가 모호하게 함께
설정되었거나 안전한 경로·현재 System 포함 관계를 검증할 수 없으면 승인하지 않는다.

readRecordedDelegationInput()은 검증용 projection만 만들고 원본 기록을 변환·저장하지 않는다.
evaluateStaffingApproval()은 최신 위임의 수명주기·Repository/System version을 확인한 뒤 이 projection의
전체 Specialist / Context / Budget 범위를 현재 System Policy와 대조한다. 유효성이 확인된 뒤에만 Proposal
범위 초과를 Direct Approval로 분기한다. 기존 직접 승인 Scope의 조회는 무관한 위임 만료·철회와 독립적이다.
위임 승인 Scope는 정확한 최신 ID/version/승인 증거 연결과 현재 위임 범위를 계속 확인한다.

과거 기록도 이 검증을 통과하면 원래 의미대로 사용할 수 있다. 신규 설정·교체에는 반드시 새 입력을 사용하고
Human 확인을 거친다. 교체는 과거 증거·버전·scope 필드를 보존하면서 기존 active 기록을 superseded로
전환하고 새 형식의 다음 버전을 추가한다. 철회는 해당 기록 형식을 유지한 revoked 버전을 추가한다.
읽기 시 자동 migration·조용한 재작성은 없으며, 무결성·Schema 실패를 기본값이나 Direct 승인으로 복구하지 않는다.

승인 출처의 신뢰 경계는 **로컬 OS 계정과 Harness / CLI 코드**다. `infrastructure/terminal`은 /dev/tty를
직접 열어 isatty를 검사하고 임의 challenge를 포함한 정확한 입력과 Enter를 받아야 일회성 process-local
receipt를 만든다. stdin pipeline, boolean, JSON의 approved 필드나 직렬화한 receipt는 승인 증거가 아니다.
review의 terminal control / bidi 문자는 escape하여 데이터가 승인 화면을 지우지 못하게 한다. CLI는 Goal /
원본 Constraints 전체, 업무·Specialist·Context·예산·직접 확인 사유를 표시한다. 배치 변경 요청은 기존 제안을
수정하는 승인이 아니라 새 Staffing 검증·제안으로 돌려야 한다. 거절·EOF·TTY 미지원은 실행하지 않는다.

`services/governance-records`는 고정 `~/.ai-workspace-governance/`에 owner-only directory(0700)와
key / signed ledger(0600)를 보존한다. 소유 UID·permission·symlink·hardlink·파일 크기를 검사하며 target
Repository 안의 저장소는 거부한다. 서명 불일치·키/기록 소실·lock 충돌은 실패하고 새 기본 정책으로
복구해 자동 승인하지 않는다. 임시 파일·rename과 배타 lock으로 한 ledger transaction을 구성하며 중복
Proposal ID 발급을 막는다. System Policy 변경과 위임 교체는 version을 증가시켜 과거 확인을 새 승인에
재사용하지 못하게 한다. Human 대기 동안 lock을 유지하지 않고 확인 후 새 transaction에서 다시 평가한다.

동일 OS 계정/root, 변조된 Harness 또는 손상된 OS·시계까지 방어하는 보안 경계는 아니다. HMAC key도 같은
계정이 읽을 수 있으므로 그런 공격자에 대한 Human 인증, rollback 방지 audit log, 조직 IAM이나 durable
분산 저장소로 해석하지 않는다. 격리된 CEO에는 ledger / key나 receipt 발급 capability를 제공하지 않는다.
외부 JSON 객체의 Schema 통과만으로 Human 설정을 증명하는 경로는 없다. 테스트는 실제 임시 Repository /
owner-private signed file I/O와 mock controlling-terminal I/O를 조합하며 실제 사람이 승인을 수행한 E2E는 아니다.

ApprovalRecord는 원본 Proposal 전체의 canonical SHA-256, Proposal ID, System Policy version과 승인 시각,
direct-human confirmation 또는 delegation ID / version / 최초 Human confirmation ID를 보존한다. Scope의
Goal / Snapshot / Assignment / Context / Budget은 검증된 Proposal에서 가져온다. getApprovedStaffingScope()는
서명된 ledger와 source / digest / Scope 필드 연결·현재 정책·Snapshot을 재확인한다. 중복 발급·같은 ID의
변경된 Proposal·변경된 정책에 과거 confirmation 재사용은 거부한다. Scope 재발급·수정은 구현하지 않는다.
신규 승인 방식 평가와 저장된 승인 유효성 검사는 구분한다. 저장된 direct-human Scope는 해당 Human
receipt·Proposal digest·현재 System Policy·Snapshot에 의존하며 무관한 Delegation의 만료·철회로
무효화하지 않는다. human-delegation Scope는 추가로 정확한 위임 ID/version/최초 승인 ID, 최신 활성 상태,
만료 여부와 현재 위임 범위를 요구한다. 이는 이전의 직접 승인 조회가 Delegation에도 의존하던 동작을 수정한 것이다.
발급 전 반복 평가는 Human 대기 이후와 최종 저장 직전의 최신성을 확인하며, 같은 lock transaction의
검증 → 발급 → 저장 원자성을 유지한다. 외부 실패는 기존의 민감 정보 없는 denied 결과로 통일한다.

R2 발급 출처는 여전히 미해결 신뢰 경계다. 구조 검증·현재 정책 적합성·Harness 발급 출처·Human 승인
근거는 각각 별개다. 현재 승인 JSON의 재검증은 runStaffing()의 실제 발급 사실을 인증하지 않는다.
이 발급 출처 인증은 후속 신뢰 경계로 남긴다. Step 4는 이미 저장된 ApprovalRecord/Scope와 그 현재
유효성을 검증하며 별도 Proposal Registry나 Finalization 서명을 추가하지 않는다.

Human Constraints는 Proposal과 Scope에 그대로 보존한다. 기계적 정책 검증은 자연어 지시 전체의 의미적
충족을 증명하지 않는다. Human은 위임 최초 설정 시 그 한계를 포함한 제한된 분석 권한만 위임하며 예외
직접 승인에서는 원문 전체를 검토한다. 자동 승인은 AI의 승인이 아니라 **Human의 사전 위임을 Harness가
집행한 새 승인 기록**이다. 발급된 Scope만으로 호출하지 않으며 Step 4 Authorization을 거쳐야 한다.
Budget Reservation과 AuthorizedSpecialistInvocation 발급 및 Step 5.3 단일 v2 Decision 실행 연결은 구현했다.
실행 결과 Usage Recording과 Phase B는 미구현이다. LangGraph는 정책 조회·Staffing·Approval 평가 Node를 구현했다. 기존 순수 evaluateInvocationRequest()에는 I/O를 추가하지 않았다.

### v4 Step 4 — Scope Validation & Invocation Authorization — 구현

`application/governance/authorization/features/specialist-invocation/flow/authorize-invocation.ts`의
`authorizeSpecialistInvocation(request, attempt?)`는 AuthorityVerdict의 allowed/denied를 반환한다.
Approval은 승인된 배치를 발급하고 Authorization은 개별 실행 입력과 예약을 발급하며 실제 Specialist는 실행하지 않는다.

Authorization의 현재 업무는 `authorization/features/specialist-invocation/`에 모은다.
`authorization/index.ts`의 공개 함수·타입·Schema는 유지하며 내부 helper는 공개하지 않는다.

| 위치 | 책임 |
| --- | --- |
| `flow/authorize-invocation.ts` | Request/Attempt 확인 → Context 확보 → 실행 입력 구성 → 최종 재검증 → 예약 추가 → save → allowed 조합 |
| `flow/context/resolve-authorization-context.ts` | Ledger 전체 Invocation ID 중복 검사, Scope 조회, 기존 Issuance 검증, Scope 사용량·Eligibility 및 승인 데이터 확보 |
| `flow/transformation/build-authorized-invocation.ts` | 승인 Assignment/정책/Commit 파일로 실행 입력 구성, 실제 JSON 크기 검증 |
| `flow/validation/evaluate-invocation.ts` | 기존 순수 Eligibility 평가; Ledger I/O 없음 |
| `flow/validation/validate-invocation-freshness.ts` | 저장 직전 Issuance 재검증, 선택 파일 digest 비교, 최종 Eligibility 확인 |
| `flow/reservation/reserve-invocation.ts` | 같은 transaction의 Entry에 strict Reservation 생성·추가; 저장·Lock 획득 없음 |
| `model/invocation-attempt.ts`, `model/reservation.ts` | 프로세스 내부 Attempt 발급·신뢰 확인과 예약 계약 |

Scope 검증은 Approval 소유 `validateStoredIssuance()`를 재사용한다. 최초·최종 검증 순서와 호출 횟수를
유지하며 공통 Ledger/Authority 모델 및 transaction은 Governance 공통 영역에 둔다.
메인 Use-case만 `save()`를 호출하고, 저장 실패를 포함한 예외는 기존 denied 결과로 종료한다.


```ts
const attempt = createInvocationAttempt(); // 신뢰된 Harness caller가 보관
const verdict = authorizeSpecialistInvocation(request, attempt);
// allowed인 동일 attempt를 다시 제출하면 추가 차감 없이 denied
```

CEO Request에는 Scope ID/version, Assignment ID, requestedContextPaths만 있다. ID·Objective·Authority·Scope
객체를 주입하면 strict Schema로 거부한다. attempt를 생략하면 새로운 논리적 호출로 처리한다.
createInvocationAttempt()가 UUID와 frozen handle을 발급하며 WeakSet으로 실제 발급 객체를 확인한다. 같은
Assignment/Context여도 새 attempt는 다른 호출이다. 객체 복사·직렬화로 핸들을 위조할 수 없고, ID는 Ledger
전체에서 중복 예약하지 않는다. 핸들은 프로세스 내 재시도용이며 재시작 후 안정 ID 복원·자동 재개는 지원하지 않는다.

AuthorizedSpecialistInvocation은 invocationId 외에 scopeId / scopeVersion / assignmentId / assignmentObjective를
포함한다. Goal/Snapshot/Assignment Objective는 저장 Scope, Specialist 등록 항목과 Authority는 현재 승인 System Policy,
files는 승인 Commit의 검증된 blob에서 온다. 기본 Specialist objective와 이번 Assignment objective는 별도 필드다.
CEO가 어느 값도 덮어쓸 수 없으며, 반환된 객체의 구조만으로 이후 실제 실행 권한을 다시 증명할 수는 없다.

Reservation은 authorization/features/specialist-invocation/model/reservation.ts의 strict Schema로 invocationId, scopeId/version, assignmentId,
requestDigest, invocationDigest, reservedAt과 선택적인 claimedAt을 저장한다. 전체 Invocation의 canonical digest에는 파일 내용·Authority·
Assignment Objective도 포함된다. 사용량은 Scope 전체의 Reservation 수이며 Assignment별로 나누지 않는다.
기록 저장 실패·Lock 충돌·예산 소진·중복 ID·최종 유효성 실패는 denied이고 저장 성공 전에는 allowed를 반환하지 않는다.
Lock 충돌 시 대기/자동 재시도는 없으며 fail closed한다. 저장 성공 뒤 응답 실패처럼 결과가 불확실한 경우도
예약을 자동 취소하지 않는다.

Governance 공통 model/ledger.ts와 records/governance-transaction.ts는 Approval·Authorization이 공유한다.
Ledger는 각 Repository에 선택적인 reservations 배열을 추가한다. 과거 기록의 필드 누락을 빈 사용량으로
읽되 Schema default나 읽기 시 재저장은 하지 않는다. 새 예약 저장 시에만 배열을 추가하며 이전 승인 기록은
그대로 유지한다. 서비스의 HMAC·UID/권한·Lock·atomic rename 구현은 바꾸지 않았다.

검증은 실제 임시 Git·서명 Ledger, mock controlling-terminal 및 fake CEO를 사용한다. 별도 프로세스들의
동시 Authorization도 같은 파일 lock으로 예산 상한을 넘지 않는지 검사한다. 실제 모델 호출·Specialist 실행
E2E나 분산/네트워크 저장소 보장을 의미하지 않는다. 자세한 호출·재사용 경계는 9.5를 따른다.

## 6. Current and Conditional Domain Models

| 모델 / 개념 | 상태 | 현재 의미 또는 채택 조건 |
| --- | --- | --- |
| RepositorySnapshot | Current | contracts/repository/snapshot.ts의 repositoryRoot / commitSha. Application 간 Repository provenance |
| SpecialistDefinition / SpecialistAuthority | Current | contracts/specialist/definition.ts / specialist/authority.ts. Definition은 id / role / objective, Authority는 RepositoryAccess와 shellExecution |
| StaffingContext / SpecialistCandidate / StaffingInspectionLimits | Implemented | application/staffing의 AI-facing Snapshot Context projection과 제한된 inspect use-case. CEO Loop에서 재사용; 승인 / 실행 권한 없음 |
| SpecialistContext | Current | protocol/context.ts. GoalSpec / repositoryCommitSha / InspectedFile[]와 선택적 assignmentObjective; 기본 역할 objective와 승인 Assignment 목적을 구분 |
| AgentDecision / EvidenceReference | Current | protocol/decision.ts의 strict Zod schema와 inferred type. recommendation / evidence / risks / uncertainty와 Harness identity, path / optional lines / description |
| ComparisonRelation / ComparisonGapKind / ComparisonPosition / ComparisonFinding / ComparisonGap / ComparisonResult | Current | model/comparison.ts. Concern은 string, Finding relation과 Gap kind를 분리. Position은 specialistId / statement / 원본 Decision의 0-based evidenceIndexes로 참조 |
| ComparisonContext | Current | protocol/context.ts. GoalSpec / repositoryCommitSha / AgentDecision[]만 포함 |
| ComparisonPayload | Current | protocol/comparison.ts의 strict Zod schema와 inferred type. Comparator output의 구조 검증을 통과한 상태; Reference Validation 뒤 같은 shape를 ComparisonResult로 반환 |
| ApprovedOperatingScope / ApprovedAssignment / InvokeSpecialistRequest / AuthorizedSpecialistInvocation / AuthorityVerdict | Schema / Scope issuance / Invocation Authorization / 단일 Decision Workflow implemented | application/governance의 strict 구조 계약. Step 3은 Scope를, Step 4는 예약된 Invocation 입력을 발급하며 실제 Specialist 실행은 하지 않음 |
| DecisionRound | Conditional | 동일 Snapshot 아래 독립 Decision들의 고유 비교 단위가 실제 필요할 때만. Workflow step 복제라면 만들지 않음 |
| DecisionRun | Conditional | Goal → Decision / Evidence → Human governance result의 고유 audit lifecycle이 필요할 때만. Runtime run/session 복제라면 만들지 않음 |
| IntentAnalysis / StaffingAssignment / StaffingProposal / StaffingAssignmentDraft / StaffingDraft / CEOStaffingDecision | Schema / Draft Loop / Proposal Finalization implemented; Staffing Approval은 Step 3 | application/staffing의 strict 구조 계약. 제안·조사 요청·Human 확인을 표현하며 승인이나 실행 권한은 제공하지 않음 |
| InvocationReservation | Implemented | authorization/features/specialist-invocation/model/reservation.ts의 발급 입력 digest와 Scope 전체 호출 예산 예약. 실행 완료·환불 기록은 아님 |
| InvocationEligibility / InvocationEvaluationContext | Implemented | 순수 evaluateInvocationRequest의 입력·평가 결과. Authorization / Budget Reservation 아님 |
| CEOStaffingAgent / StaffingRunResult / runStaffing | Implemented | CEO Loop와 R2 검증·최종화를 조합. Proposal / Escalation / Failure 반환; 승인 / 실행 권한 없음 |
| CEO Synthesis / 전체 조직 workflow / Executive Report | Synthesis Implemented / 나머지 Planned | Step 6.2에서 CEO 제안·출처 검증·Graph 연결, Step 7.2에서 방향 승인 구현. Phase B 실행 조정·전체 보고 연결은 미구현 |
| Approved Decision / Implementation Assignment / Progress Evaluation | Proposed Concept | Phase A 승인 후 업무 분해·다중 직원 관리의 목표 개념. 해당 Schema / API와 통합·충돌 해결은 미구현 |
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
- `workflows`: 여러 Application의 실행 순서·분기·대기를 조정한다. `development-organization/phase-a`는 Staffing → Approval 및 승인 Scope → Decision → Comparison을 별도 API로 연결한다. Organization state.ts는 공통 입력을, phase-a/graph.ts는 Phase A 내부 순서를 소유하며 현재 정책 조회·Staffing·Approval·Human 확인과 실행 대상에 따른 Specialist Decisions를 조정한다. 상위 Organization Graph는 Phase 간 Handoff 정의 이후 구성한다. Application으로부터 역참조하지 않는다. CLI I/O나 Application의 검증 정책을 옮기지 않는다.
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

현재 use-case는 `planning`, `execution`, `decision`, `comparison`, `staffing`, `governance`다. 모든 application에 위 폴더를 미리 만들거나
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

해당 Application use-case 내부의 순서와 진행 상태를 제어한다. 내부 단계 결정, 반복·실패 처리와
use-case 종료가 여기에 속한다. 여러 Application을 조합하는 Phase A의 Assignment 반복·Stage 전환은
LangGraph가 소유한다. 업무 Stage와 Node·Application의 구분은
[Workflow 책임 경계](workflow-responsibility-boundaries.md#4-세-번째-경계--application과-workflow)를 따른다.
현재 `planning-loop.ts`, `run-execution-pipeline.ts`, `finalize-execution-result.ts`, `run-independent-decisions.ts`가 해당한다.
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

Decision도 같은 기준으로 `flow/context`에 commit 파일 loading과 Snapshot 서비스의 호환 export,
`flow/orchestration`에 순차 실행·fail-fast, `flow/validation`에 Evidence invariant 검증을 둔다.
`run-decision.ts`는 입력 검증, Goal 생성, Context loading과 두 Specialist 구성을 조립한다.

#### model

해당 use-case가 소유하는 상태, 설정, 결과를 둔다.
Planning의 PlanningState, PlanningLimits, PlanningResult, RepositoryInfo와
Execution의 ExecutionState, ExecutionResult가 해당한다. 여러 Application이 공유하는 RepositorySnapshot /
SpecialistDefinition / SpecialistAuthority는 contracts가 소유한다. RunDecisionResult는 실제 사용된 GoalSpec도 반환한다. 현재 RunDecisionInput / RunDecisionResult는 작은 use-case entry에
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

해당 use-case의 public boundary다. `planTask`, `executeWorkItem`, `runDecision`과 각 결과 타입,
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
│  ├─ staffing/  # CEO Loop / Context / Finalization
│  ├─ governance/  # approval / authorization / records / model
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
│     ├─ protocol/
│     │  ├─ context.ts
│     │  └─ decision.ts
│     ├─ specialist/
│     │  └─ codex-specialist.ts
│     └─ index.ts
├─ workflows/
│  └─ development-organization/
│     ├─ index.ts
│     ├─ state.ts  # 공통 goal / repositoryPath만 소유
│     └─ phase-a/
│        ├─ index.ts
│        ├─ graph.ts
│        ├─ state.ts  # 공통 입력 + Staffing / Specialist 단계 결과·중간 상태
│        ├─ tests/
│        │  ├─ graph.test.ts
│        │  └─ phase-a.integration.test.ts
│        ├─ features/  # 기능별 Workflow 내부 모듈; 새 Application 계층이 아님
│        │  ├─ staffing/nodes/run-staffing.ts
│        │  ├─ governance/nodes/
│        │  │  ├─ load-system-policy.ts
│        │  │  ├─ evaluate-staffing-approval.ts
│        │  │  └─ confirm-staffing-approval.ts
│        │  ├─ decision/
│        │  │  ├─ nodes/
│        │  │  │  ├─ preflight-specialist-decisions.ts
│        │  │  │  └─ execute-next-specialist.ts
│        │  │  ├─ validation/validate-specialist-request-batch.ts
│        │  │  └─ execution/authorized-specialist-decision.ts
│        │  ├─ comparison/nodes/compare-specialist-decisions.ts
│        │  └─ synthesis/nodes/run-ceo-synthesis.ts
│        └─ entrypoints/run-staffing-approval.ts
├─ contracts/  # goal / task / repository / specialist / staffing
├─ services/
│  ├─ artifacts/
│  ├─ evidence/
│  ├─ scope/
│  ├─ repository-snapshot/
│  ├─ repository-inspection/
│  ├─ governance-records/
│  └─ verification/
└─ infrastructure/
   ├─ git/
   ├─ terminal/
   └─ process/
```

Execution의 일부 단계는 이미 services의 독립 capability로 분리되어 있다.
Planning의 inspection과 transformation은 아직 Planning flow와 강하게 결합되어 있다.
따라서 application의 구조가 대칭이 아니거나 Planning flow가 더 커 보이는 것은 문제가 아니다.
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
- Planning과 Execution은 서로 직접 호출하지 않는다. Phase B Workflow가 계획과 실행을 연결한다.
- Execution Authorization, Review, Apply, Commit, Push, Cleanup은 서로 다른 결정이다.
- Apply는 Execution·Verification 성공과 patch 보존 확인 뒤에만 가능하다. Dirty repository를 차단하고
  pre-check를 수행한다. Commit은 changedPaths만 stage하고 Push는 기존 upstream에만 수행한다.
- Workspace lifecycle과 Execution lifecycle을 분리한다. Artifact 보존은 workspace 삭제와 독립적이다.
- Evidence와 Telemetry, TaskContract와 file content, 내부 상태와 역할 간 protocol을 구분한다.
- Scope / verification 통과를 자연어 요구 충족의 증명으로 과장하지 않는다.
- v2 독립 Decision 생성과 v3 Structured Comparison은 별도 use-case이며 CLI와 Phase A Workflow가 공개 API를 조합한다. Synthesis는 별도 Application으로 구현했고 Human governance history는 미구현이다.
- Decision Context는 Snapshot commit의 explicit files이며 다른 Specialist의 Decision을 포함하지 않는다.
- Schema 및 Evidence path / line 검증을 Decision의 의미적 정확성 보장으로 과장하지 않는다.
- Generic runtime 문제는 기존 기술을 먼저 평가한다. Runtime은 교체 가능하며 governance 의미는 프로젝트가 소유한다.
- 실제 domain 의미 없는 Run / Round 복제나 별도 Coordinator를 선행 구현하지 않는다. v4 CEO 역할의 구체 설계는 단계적으로 진행한다.
- Runtime boundary는 Zod validation을 사용하며 현재 요청에 필요하지 않은 추상화를 만들지 않는다.

## 9. Validation Responsibility & Ownership

이 절은 테스트를 제외한 현재 `src/`의 Schema, `parse` / `safeParse` / `refine`, assert와 조건문 기반
검증의 책임 지도다. 세부 정책·제한 값은 앞 절과 실제 구현을 따르며, 아래 호출 관계는 현재 연결과
**Planned** 연결을 구분한다. 하나의 규칙은 소유 모듈에서 구현하고 다른 경계에서는 재사용한다.
같은 함수를 다시 호출하는 것과 같은 규칙을 다른 함수에 구현하는 것은 별도로 판단한다.

- **Schema**: 구조·타입·필수 필드·열거형·숫자 범위 검증. Schema에 들어간 domain refinement는 Policy도 병기한다.
- **Policy**: 등록·권한·Context·예산·참조 등 운영 의미와 데이터 간 관계 검증.
- **Lifecycle**: 실행 시점의 Snapshot·정책·위임·저장 기록·사용량·프로세스 상태 검증.
- 타입 선언, Prompt의 지시, JSON 파싱, Schema 통과만으로 승인 출처·자연어 지시 충족·실행 허가를 증명하지 않는다.
  Goal / Task의 기본 Object Schema는 strict가 아니며 Staffing·Governance에서는 필요한 경계에 `.strict()`를 적용한다.

### 9.1 검증 책임 매트릭스

표의 경로는 `src/` 기준이다. 경로를 줄인 행은 연결된 대표 구현 파일과 아래 호출 지도를 함께 참조한다.

| 검증 규칙 | 소유 모듈 | 대표 Schema / 함수와 구현 위치 | 호출자 | 검증 시점 | 분류 |
| --- | --- | --- | --- | --- | --- |
| Goal / Task 구조, 실행 명세 필드 | Contracts | `goalSpecSchema`, `taskContractSchema` — `contracts/goal.ts`, `contracts/task.ts` | CLI, Planning Finalizer, Staffing, Governance | Goal 입력·Task 로딩/최종화 | Schema |
| Snapshot / 파일 / Specialist / PathScope 공통 구조 | Contracts | `repositorySnapshotSchema`, `inspectedFileSchema`, `specialistDefinitionSchema`, `specialistAuthoritySchema`, `contextAccessPolicySchema` — `contracts/repository/`, `contracts/specialist/` | 각 Application의 합성 Schema·접근 검증 | 입력·Context/기록 구성 | Schema |
| System 설정, 등록 ID 고유성, Phase A read-only / shell-disabled | Staffing 공통 계약 | `staffingSystemPolicySchema`, `staffingInspectionLimitsSchema` — `contracts/staffing/system-policy.ts` | Governance 설정/조회, Staffing 입력·Proposal 재검증 | 정책 설정·Staffing·Approval | Schema + Policy |
| Repository 실체와 Commit 파일 데이터의 기술적 유효성 | Git Infrastructure | `resolveRepositoryRoot()`, `readRepositoryFileAtCommit()` — `infrastructure/git/repository/repository.ts`; `listRepositoryFilesAtCommit()` — `commit-files.ts` | Planning, Snapshot 서비스, Staffing, Decision, Governance 경로 확인 | Repository 해석·Commit tree/blob 로딩 | Policy + Lifecycle |
| HEAD·Clean 상태와 Snapshot 일치 | Repository Snapshot 서비스 | `captureRepositorySnapshot()`, `assertRepositoryMatchesSnapshot()` — `services/repository-snapshot/repository-snapshot.ts` | Decision, Staffing, Governance Approval/Scope 조회 | Capture·Agent/파일 로딩 전후·발급 전 | Lifecycle |
| 상대경로·정규 표현, File/Directory 포함 관계 | Repository Inspection 서비스 | `isRepositoryRelativePath()`, `isUnambiguousRepositoryPath()` — `discovery.ts`; `validateContextAccessPolicy()`, `isContextPathAllowed()`, `isContextScopeContained()` — `services/repository-inspection/access-policy.ts` | Decision loader, Staffing, Delegation, Invocation 평가 | 경로 입력·목록 노출·내용 요청·범위 포함 검사 | Schema + Policy |
| Working Tree 조사 경로, 내부 디렉터리 차단, 파일 여부·조사 한도 | Planning | `inspectFiles()`, `inspectInitialFiles()` — `application/planning/detailed/flow/inspection/`; `hasValidLimits()`, `prepareInspection()` — `flow/orchestration/planning-loop.ts` | `planTask()`, Planning Loop | 초기 seeding·추가 조사·round 제어 | Policy + Lifecycle |
| Context 접근·민감 경로·regular mode·파일 수/크기·실제 JSON byte 제한 | Staffing Inspection | `isInspectablePath()`, `requireFile()`, `prepareInspection()`, `createAllowedFileTree()`, `prepareMetadataInspection()`, `assertContextBudget()` — [context-policy.ts](../src/application/staffing/flow/inspection/context-policy.ts) | Discovery, Metadata/Initial Seeding/추가 Inspection, Proposal Validation | 파일 목록 노출 전·batch 로딩 전·직렬화 후 | Policy |
| CEO-facing 구조·응답 분기·호출/조사 한도 | Staffing Protocol / Flow | `staffingContextSchema`, `ceoStaffingDecisionSchema`; `validateDiscoveryInput()` — `flow/inspection/discover-context.ts`; `callLimitsSchema` — `flow/orchestration/run-staffing-loop.ts` | Discovery, CEO Adapter, Staffing Loop | Context 투영·모델 응답·최종 propose/escalate | Schema + Policy + Lifecycle |
| Assignment 등록·중복·Context·예산과 원본 Run 연결 | Staffing Finalization | `staffingDraftSchema`, `staffingProposalSchema`; `prepareProposalInput()`, `validateProposal()` — [validate-proposal.ts](../src/application/staffing/flow/validation/validate-proposal.ts); `buildStaffingProposal()` | `runStaffing()` | Draft 수신·ID 발급 전후 | Schema + Policy |
| 완성된 Proposal ID·현재 설정·Snapshot 파일 재검증 | Staffing | `validateStaffingProposal()` — [validate-staffing-proposal.ts](../src/application/staffing/flow/validation/validate-staffing-proposal.ts) → `validateProposal()` | Governance의 `validateCurrentStaffingPolicy()` | 신규 Approval·저장 Scope 조회 | Schema + Policy + Lifecycle |
| 승인된 System 설정 조회·Human 확인·Legacy 운영 차단 | Governance system-policy | `validateSystemConfiguration()`, `requireCurrentSystemPolicy()`, `configureStaffingSystemPolicy()`, `getStaffingSystemPolicy()` — `application/governance/approval/features/system-policy/` | Governance CLI, Staffing→Approval Workflow | 설정/갱신·Staffing 시작 전 조회 | Schema + Policy + Lifecycle |
| 자동 승인 범위와 System 포함 관계·위임 수명주기 | Governance human-delegation / proposal-management | `humanDelegationPolicyInputSchema`, `recordedHumanDelegationPolicySchema`, `readRecordedDelegationInput()`, `validateDelegationConfiguration()`; `evaluateStaffingApproval()` | 위임 설정, 신규 Approval, 위임 승인 Scope 조회 | 설정·만료/철회/버전/범위 재평가 | Schema + Policy + Lifecycle |
| Ledger 구조·저장소 무결성·Repository 분리·동일 transaction | Governance 공통 모델/기록 + Records 서비스 | `governanceLedgerSchema` — `application/governance/model/ledger.ts`; `withGovernanceLedger()` — `application/governance/records/governance-transaction.ts`; `withGovernanceRecords()`, `assertGovernanceStoreOutsideRepository()` — `services/governance-records/records.ts` | 모든 Governance 설정·승인·조회·예약 | Lock 내 읽기/저장·예약 참조/상한·HMAC/UID/권한/크기 확인 | Schema + Policy + Lifecycle |
| 실제 Human 확인·binding·일회성·UID/시간 | Terminal Infrastructure + Governance 공통 입력 확인 | `confirmHumanAction()`, `consumeHumanConfirmation()` — `infrastructure/terminal/human-confirmation.ts`; `consumeCurrentHumanConfirmation()` — `approval/shared/validation/approval-input.ts` | Governance/Staffing CLI, Governance Use-case | 터미널 확인·Receipt 소비 | Policy + Lifecycle |
| 승인 방식·중복 발급·ApprovalRecord/Scope 구성과 연결 | Governance proposal-management | `evaluateStaffingApproval()`, `assertProposalNotIssued()`, `assertIssuanceIdsUnused()`, `issueStaffingScope()` — `approval/features/proposal-management/flow/`; `approvalRecordSchema`, `approvedOperatingScopeSchema` | `approveStaffingProposal()` | 평가·발급 전·동일 transaction 저장 전 | Schema + Policy + Lifecycle |
| 저장된 승인과 현재 Scope 유효성 | Governance proposal-management | `validateStoredIssuance()` 및 binding/content/source 검사 — [staffing-issuance.ts](../src/application/governance/approval/features/proposal-management/flow/validation/staffing-issuance.ts) | `getApprovedStaffingScope()` | 저장 Scope 조회 | Policy + Lifecycle |
| 개별 Invocation의 Scope identity/version·Assignment·정확한 Context 부분집합·잔여 횟수 | Governance Authorization | `invokeSpecialistRequestSchema`, `invocationEvaluationContextSchema`, `approvedOperatingScopeSchema`; [evaluateInvocationRequest()](../src/application/governance/authorization/features/specialist-invocation/flow/validation/evaluate-invocation.ts) | `authorizeSpecialistInvocation()`이 사용; 순수 API도 유지 | 제공된 사실의 요청 시점 평가 | Schema + Policy + Lifecycle 입력 평가 |
| Decision 응답 구조와 supplied file/line Evidence | Decision | `agentDecisionPayloadSchema`, `agentDecisionSchema` — `protocol/decision.ts`; `validateDecisionEvidence()` — `flow/validation/validate-evidence.ts` | Specialist Adapter, `runIndependentDecisions()` | 모델 응답·다음 Specialist 실행 전 | Schema + Policy |
| Comparison source 구성·Concern별 참조 | Comparison | `comparisonPayloadSchema` — `protocol/comparison.ts`; `compareDecisions()`, `validateComparisonReferences()` — `flow/validation/validate-references.ts` | Comparator Adapter, Decision CLI 조합 | 비교 입력·응답 수신 후 | Schema + Policy |
| 실제 변경 파일의 허용/금지 Exact Scope, 명령 결과 | Scope / Verification 서비스 + Execution Flow | `checkScope()` — `services/scope/scope-enforcement.ts`; `checkExecutionScope()` / `runApprovedVerification()` — `application/execution/flow/verification/` | `executeWorkItem()` | Worker 성공 후·Verification 후 | Policy + Lifecycle |
| 프로세스 오류·Timeout·모델 JSON 결과 | 역할 Adapter + Process Infrastructure | `runCodexCEO()`, `createCodexPlanner()`, `runCodexSpecialist()`, `runCodexComparator()`, `runCodexWorker()`; `runCommand()` — `infrastructure/process/command-runner.ts` | 각 Application의 Loop/Stage | 호출 설정·프로세스 종료·응답 파싱 | Schema(구조화 응답) + Policy + Lifecycle |
| Human 실행/변경 반영 gate와 Git Delivery 사전 조건 | CLI + Git Infrastructure | `runApplyCommand()`, `isValidCommitMessage()`, `runCommitCommand()`, `runPushCommand()` — `cli/`; `applyPatch()`, `stagePaths()`, `pushCurrentBranch()` — `infrastructure/git/delivery/` | 보존된 Review·Delivery 모듈 | Review·Apply·Commit·Push | Policy + Lifecycle |
| 상위 실행 분기·실패/승인 대기 전달 | Phase A Graph | `createPhaseAGraph()` — `workflows/development-organization/phase-a/graph.ts`; `runStaffingApproval()`은 결과 변환 Adapter | `cli/commands/staffing/staffing.ts` | 정책 조회 → Staffing → Approval → 선택적 Human 콜백·최종 승인 | Lifecycle 조정; 업무 검증은 Application 재사용 |

Git blob reader는 NUL / invalid UTF-8를 거부하지만 접근 권한·regular mode·민감 경로를 자체 승인하지 않는다.
Commit tree loader는 full SHA·entry 형식·size를 검사한다. Snapshot Schema의 non-empty commitSha와는
서로 다른 보장이다. Execution의 Evidence / Result와 Comparison의 domain type 등에는 TypeScript 타입도
있으며 전부 Zod로 재검증되는 것은 아니다. Verification은 명령 exit/error/timeout의 결과이지 Acceptance
Criteria나 자연어 Constraints 전체의 판정기가 아니다. Artifact 서비스의 Run 디렉터리 생성·보존 오류 처리,
Worktree 생성/삭제·Diff 크기 제한·임시 자원 cleanup도 각 서비스/Infrastructure의 기술적 경계로 유지한다.

### 9.2 Schema 조합과 의미 검증의 경계

```text
SpecialistDefinition + SpecialistAuthority → Phase A Staffing 등록 항목
contracts/repository/context-access-policy.ts: PathScope → ContextAccessPolicy
SpecialistDefinition → specialistDefinitionsSchema (등록 목록 ID 고유성)
Staffing 등록 항목 + ContextAccessPolicy + StaffingInspectionLimits → StaffingSystemPolicy
GoalSpec + RepositorySnapshot + Intent/Assignment/Budget → StaffingProposal
StaffingAssignment.omit(assignmentId) → StaffingAssignmentDraft
StaffingProposal.omit(id, goal, snapshot) + Draft assignments → StaffingDraft → CEOStaffingDecision
SpecialistDefinition.pick(id, role, objective) + Goal/Files/Limits → StaffingContext
GoalSpec + Snapshot + ApprovedAssignment/Budget → ApprovedOperatingScope
Proposal + ApprovalRecord + Scope + current/historical policy schemas → GovernanceLedger
TaskContract.omit(id, goalId) → TaskDraft → PlannerDecision
AgentDecision.omit(specialistId) → AgentDecisionPayload
Comparison position/finding/gap schemas → ComparisonPayload
```

Schema의 omit/pick은 구조 재사용이며 발급·승인 근거가 아니다.
ID 고유성은 `contracts/specialist/definition.ts`의 `specialistDefinitionsSchema.refine()`가 소유한다.
System Policy 등록 목록은 같은 ID 고유성 규칙, 최소 1개 및 Phase A 읽기 전용 Authority 조건을 적용한다.
SpecialistAuthority는 접근 수준을 표현하며 실제 발급과 범위 검증은 Governance가 담당한다.
Decision Payload의 path/line 구조를 파싱한 뒤 Context에 대한 존재·행 범위·순서를 검사하고,
Comparison의 nonnegative index를 파싱한 뒤 원본 Decision에 대한 범위·중복을 검사한다.
Staffing Context Schema는 source root나 Authority를 투영하지 않지만, 파일 내용 자체의 신뢰성을 보증하지 않는다.
과거 System / Delegation 기록은 별도 Historical Schema로 보존하며 읽을 수 있다는 사실과 현재 운영 가능 여부를
구분한다. System Legacy 차단과 Delegation의 원래 Exact/Scope 해석은 각 Governance feature가 소유한다.

### 9.3 실제 검증 호출 지도

아래는 주요 검증 지점만 표시한다. `assertSnapshot`은 공통 `assertRepositoryMatchesSnapshot()`의 약칭이며,
실제 코드에서 별도 함수나 새로운 Workflow를 뜻하지 않는다.

**Goal → Staffing Discovery → Proposal Finalization — 현재**

```text
runStaffingApproval() Adapter → createPhaseAGraph().invoke()
  → getStaffingSystemPolicy(): withGovernanceLedger → requireCurrentSystemPolicy / validateSystemConfiguration
  → runStaffing(): prepareProposalInput (설정 Schema·입력 복제)
    → runStaffingLoop: callLimitsSchema
      → discoverStaffingContext: validateDiscoveryInput
        → captureRepositorySnapshot → assertSnapshot → Commit tree / createAllowedFileTree
        → assertContextBudget → Metadata preflight/load/JSON budget
        → seedInitialFiles → 필요 시 prepareInspection / addInspectedFiles → assertSnapshot
      → 각 CEO 호출 전 assertSnapshot → createStaffingContext → agent
        → 호출 후 assertSnapshot → ceoStaffingDecisionSchema.safeParse (주입 Agent도 포함)
        → inspect: inspectStaffingContext의 Schema·Snapshot 전후 검사 + batch/실제 JSON budget → 반복
        → propose / escalate: 최종 Snapshot 검사 후 반환
    → proposed만: assertSnapshot → staffingDraftSchema → validateProposal
      → 실제 CEO Context의 assertContextBudget → assertSnapshot
      → buildStaffingProposal (ID 충돌 검사·원본 Goal/Snapshot 연결·Schema) → assertSnapshot
```

`validateProposal()`은 등록·Authority·Assignment·정책 Context·파일 mode/크기·예산의 공통 규칙이다.
입력은 Goal/Snapshot/Commit files/filtered fileTree라는 검증 사실이며 CEO Inspection State가 아니다.
완성된 Proposal의 `validateStaffingProposal()`은 Schema·Assignment ID 중복 검사와 Snapshot assert 전후,
Commit tree 조회를 추가한 뒤 같은 `validateProposal()`을 호출한다. 첫 Finalization은 같은 Run의 원본을
연결하지만 외부 Proposal 재검증은 원본 Goal의 발급 출처를 별도로 인증하지 않는다.

**Proposal → Governance Approval → Scope Issuance — 현재**

```text
approveStaffingProposal: Proposal Schema → resolveGovernanceRepository
  → withGovernanceLedger (서비스 lock + HMAC 검증 후 Ledger Schema)
    → assertProposalNotIssued
    → evaluateStaffingApproval
      → validateCurrentStaffingPolicy → requireCurrentSystemPolicy → validateStaffingProposal
      → 현재 Delegation의 Repository/System version/status/time
      → readRecordedDelegationInput → validateDelegationConfiguration → Proposal 범위 판정
    → direct: binding에 대한 consumeCurrentHumanConfirmation
      → Receipt 없으면 approval-required 반환하고 transaction 종료
    → 승인 근거 확보: evaluateStaffingApproval 재검사
    → issueStaffingScope: ApprovalRecord/Scope Schema + Proposal digest/IDs/source 구성
    → assertSnapshot → evaluateStaffingApproval 재검사 → assertIssuanceIdsUnused
    → Ledger Schema → 동일 transaction 저장
```

Human 입력은 transaction 밖의 CLI에서 기다린다. Workflow는 분리된 Review를 콜백에 주고 동일 Proposal로
`approveStaffingProposal()`을 재호출한다. 설정·위임 변경도 binding / 일회성 소비 / Ledger transaction을
재사용한다. 위임 없음·유효한 범위 초과는 direct, 무효 위임·System 위반은 denied라는 구분을 유지한다.

**Stored Scope / Invocation Eligibility — 현재 Authorization에서 연결**

```text
getApprovedStaffingScope(scopeId)
  → withGovernanceLedger → validateStoredIssuance
    → assertApprovalBinding (IDs/digest/current System version)
    → assertScopeContents → assertDelegatedApprovalSource
    → validateCurrentStaffingPolicy (검증 파일 반환)
    → direct-human: 저장된 Human UID/time
    → human-delegation: evaluateDelegationCoverage가 delegated인지 재확인
  → 검증된 저장 ApprovalRecord / Scope 반환

evaluateInvocationRequest(request, scope, evaluationContext)   # 현재 별도 공개 순수 API
  → 세 입력 safeParse → Scope ID/version/status → Assignment ID 고유성/선택
  → 승인/요청 경로의 정규 표현·중복 → 정확한 파일 부분집합 → used < max → eligible
```

Authorization은 아래 9.5처럼 같은 transaction의 발급 검증 결과와 Reservation 수로 평가 입력을 구성한다.
독립적인 순수 평가 API는 여전히 출처를 인증하지 않는다. 명시적인 Scope 철회 저장 모델은 없으며 현재
active 판단은 저장 승인 근거·현재 정책·위임·Snapshot 검증 통과를 뜻한다. 직접 승인 Scope와 위임 승인
Scope의 다른 무효화 기준은 유지한다.

**v2 Decision → Evidence / v3 Comparison → References — 현재**

```text
runDecision: 입력 필수값 → captureRepositorySnapshot → goalSpecSchema
  → loadSnapshotFiles: isRepositoryRelativePath → Git blob/text 확인
  → runIndependentDecisions: Specialist ID 중복 검사
    → 각 Specialist 전 assertSnapshot → runCodexSpecialist (read-only Authority guard)
      → Process/JSON → agentDecisionPayloadSchema → Harness specialistId + agentDecisionSchema
    → assertSnapshot → validateDecisionEvidence → 다음 Specialist

Decision CLI의 별도 조합 → compareDecisions
  → 입력 Decision 2개 이상·source Specialist 중복·commit SHA 공백 검사
  → runCodexComparator → Process/JSON/comparisonPayloadSchema
  → validateComparisonReferences → 결과
```

Evidence 검증은 supplied path와 line 범위/순서이고, Reference 검증은 source ID·Evidence index·중복과
finding/gap의 최소 source 수다. 내용의 진실성·비교의 완전성은 증명하지 않는다. Comparison 자체는
Repository를 조사하거나 Snapshot drift를 다시 검사하지 않는다.

**v1 Planning → TaskContract — 현재**

```text
CLI 입력/goalSpecSchema → planTask: resolveRepositoryRoot → Working Tree metadata / inspectInitialFiles
  ├─ createFastPathTaskDraft의 대상/목표 조건 → buildTaskContract
  └─ runPlanningLoop: hasValidLimits → planner (기본 Adapter는 Process/JSON/plannerDecisionSchema)
      ├─ inspect: 요청 수·resolve 기준 중복·총 조사 수 → inspectFiles의 경로/내부 폴더/파일 검사
      └─ complete → buildTaskContract: Harness ID/targetRepository, 원본 Constraints와 Draft 제약 합집합
        → taskContractSchema → 독립 CLI 표시 또는 Phase B 출처 등록
```

`planTask()`는 typed Goal 입력을 받으며 자체적으로 Goal Schema를 다시 파싱하지 않는다. 주입 Planner를
Loop가 `plannerDecisionSchema`로 다시 파싱하는 구조도 아니다. 실제 Runtime Schema 적용 위치는 기본
Codex Planner와 최종 TaskContract 경계다. 모든 내부 typed 함수를 동일한 unknown 입력 validator로 설명하지 않는다.

**Phase B Execution → Scope → Verification — 현재**

```text
검증된 Work Item + Execution Source → executeWorkItem
  → Runtime 확인 → authorizeExecutionForRun → 승인 Commit 기반 Worktree
  → Codex Worker → Scope → Harness Verification → Scope 재검사
  → 변경·Evidence 보존 → ExecutionResult → Phase B State
```

Worker 실패 시에는 변경 Evidence를 수집하며 Verification을 시작하지 않는다. Scope 검사는 실제 변경
경로를 비교한다. Harness Verification은 승인된 명령을 고정된 argv로 실행한다. Review·Delivery·Cleanup은
재사용 가능한 별도 모듈이며 현재 Phase B 실행 후 자동 적용하지 않는다.

### 9.4 재사용·재검증과 중복 검토 후보

| 구분 | 실제 코드와 보호 경계 | 판단 / 향후 확인 사항 |
| --- | --- | --- |
| 공통 규칙 재사용 | `validateProposal()`을 최초 Run Finalization과 `validateStaffingProposal()`이 공유; Governance는 후자를 호출 | Proposal 의미는 Staffing 소유. Governance에 동일 등록·Context·Budget validator를 복제하지 않는다. |
| 공통 규칙 재사용 | 경로/범위 predicate, `requireFile()`, Snapshot assert, Proposal/Task에서 파생한 Draft Schema | Policy 로직은 재사용하고 I/O·승인 근거·실행 상태의 책임은 분리한다. `parsePackageScripts()`와 Goal mention 선택도 v1/Staffing이 실제 공유한다. |
| 필요한 재검증 | CEO/Specialist 전후, inspect 전후, 파일/정책 검사 전후와 최종 결과 직전 Snapshot assert | Agent의 await와 외부 Git/Working Tree 변화 가능성을 보호한다. 같은 commit blob을 읽는 것과 현재 HEAD/Clean 상태가 유지되는 것은 별개다. assert는 lock이나 무변경의 연속 증명이 아니다. |
| 필요한 재검증 | CEO Adapter Schema + Staffing Loop safeParse + Finalizer Draft Schema | Adapter 교체/주입 경계와 최종 발급 경계를 각각 보호한다. 단순히 default Adapter가 이미 파싱했다고 Loop 검증을 제거할 수 없다. |
| 필요한 재검증 | Context raw-size preflight와 로딩 후 JSON size, CEO Context와 Assignment envelope | 전자는 로딩 전 batch 제한, 후자는 escaping/overhead 포함 실제 제한이다. Proposal envelope는 원본 Goal/Snapshot·설정·tree·assignment payload·선택 파일을 측정하고 CEO Context는 metadata/조사 파일을 측정한다. 같은 maxContextBytes를 써도 같은 데이터 검사가 아니다. |
| 필요한 재검증 | Approval 요청 후 CLI 확인·재제출, 저장 Scope의 현재 정책/위임/파일 재검증 | 대기 중 상태가 달라진다. 신규 승인 방식 선택과 기존 승인 근거의 유효성은 다른 판단이다. direct Scope를 무관한 위임 만료 때문에 거부하도록 합치지 않는다. |
| 필요한 재검증 | Worker 뒤와 Verification 뒤 `checkExecutionScope()` | 둘 사이에 명령이 파일을 바꾸거나 commit할 수 있다. 같은 Scope 규칙을 변경된 Evidence에 다시 적용하는 정상 구조다. |
| 공통화 완료 | System Schema와 `validateDiscoveryInput()`이 `contracts/specialist/definition.ts`의 `specialistDefinitionsSchema`를 재사용 | ID 고유성 구현은 공통 목록 Schema 한 곳에 둔다. 독립 Discovery의 입력 파싱은 유지한다. 목록 자체에는 최소 개수·Phase A Authority를 강제하지 않고 System Policy만 해당 제한을 추가한다. |
| 제거 완료 / 별도 guard 유지 | `validateStaffingProposal()`의 System Schema parse 직후 Specialist Set 검사 제거 | 같은 설정의 고유성을 Schema가 이미 보장하므로 별도 검사는 불필요하다. Assignment ID 중복 검사는 다른 대상이므로 유지한다. `validateProposal()`의 선택된 Authority guard는 내부 typed 입력 전제를 바꾸지 않기 위해 유지했다. |
| 서로 다른 규칙 | 등록 ID 고유성, Draft Specialist 중복 배치, 발급 Assignment ID 충돌, Invocation의 승인 Assignment ID 중복 | 서로 다른 식별 대상과 신뢰 경계다. 하나의 duplicate 검사로 합치지 않는다. v2 source ID·v3 finding별 source 중복도 별도 규칙이다. |
| 독립 계약 / 공통화 검토 | v1 Working Tree `inspectFiles()`와 Staffing Snapshot Inspection | v1은 resolve/normalize·stat/read와 조사 수 제한, Staffing은 canonical path·access scopes·Commit regular mode·민감 경로·실제 JSON budget이다. 초기 seeding의 64/128 KiB 정책은 유사하지만 Snapshot/Working Tree 로딩은 다르다. 보안 동등성이나 통합 가능성을 이름만 보고 단정하지 않는다. |
| 측정 후 유지 | 성공하는 `approveStaffingProposal()` 한 호출에서 `evaluateStaffingApproval()` 3회 및 각 Proposal tree/blob 재검증 | 최초 승인 방식, 근거 확보 후 발급 전, 최종 저장 전을 보호한다. Ledger Lock은 외부 Git을 잠그지 않는다. 발급 직전/저장 직전 위임 만료와 Git blob 변경 회귀 테스트를 보강했으며, 전체 평가를 캐시하거나 Snapshot/시간 검사만 남기지 않았다. |
| 반복 비용 검토 후보 | Finalization 주변의 연속 Snapshot assert, Approval의 별도 assert와 중첩된 Proposal assert | 일부 구간은 동기 Schema/변환만 수행하지만 Git은 다른 프로세스가 변경할 수 있다. 어떤 상태와 I/O를 끼고 있는지 먼저 명시해야 하며, 호출 횟수만으로 불필요하다고 확정하지 않는다. |

측정은 `approval/features/proposal-management/flow/staffing-approval.test.ts`의 실제 임시 Git Repository와
서명된 Ledger에서 수행했다. 선택 파일 1개인 성공한 직접/위임 승인 트랜잭션 각각에 대해 API를 spy했다.
Fixture 생성과 직접 승인 확인을 위한 최초 approval-required 호출은 측정에서 제외한다.

| 측정 항목 | 리팩토링 전 | 리팩토링 후 | 판단 |
| --- | --- | --- | --- |
| 한 `validateStaffingProposal()` 내부의 동일 등록 목록 고유성 검사 | 2회(Schema + 별도 Set) | 1회(Schema) | 보장이 같은 명백한 중복 제거 |
| 대상 세 위치의 고유성 규칙 구현 | 3곳 | 공통 목록 Schema 1곳 | 두 공개 입력 경계의 파싱은 유지 |
| 성공 Approval의 `validateStaffingProposal()` 호출 | 3회 | 3회 | 현재 외부 파일 사실 재검증 유지 |
| Commit tree 조회 | 3회 | 3회 | 재조회 유지 |
| 선택 파일 blob 로딩 | 3회 | 3회 | 재조회 유지 |
| Snapshot assert | 7회 | 7회 | HEAD/Clean 최신성 검사 유지 |

이는 호출 횟수 측정이며 시간/처리량 벤치마크나 전체 Git 명령 수가 아니다. Approval I/O 감소를 주장하지 않는다.
테스트에서는 Scope 구성 뒤 Git replacement와 index/Working Tree를 함께 바꾸어 같은 HEAD 및 Clean 상태를
유지하면서 binary blob으로 대체했다. Snapshot assert만으로는 통과하지만 최종 전체 Proposal 검증의 blob
reader가 거부하고 발급 기록은 저장되지 않는다. Git 사실 전체를 정적이라고 가정하는 캐시는 현재 보장과 같지 않다.

위임 만료도 최초 평가 이후 발급 전, Scope 구성 이후 저장 전 각각 거부됨을 확인했다. Scope 구성 뒤 Dirty
Snapshot도 부분 발급 저장 없이 거부된다. 동기 변환 주변의 연속 assert는 외부 Git 변경과 TOCTOU 부재를
증명하지 못했으므로 삭제하지 않았다. Snapshot 함수의 구현·호출 시점과 Ledger transaction은 그대로다.

후속 검토는 읽은 Git 사실을 어떤 조건에서 불변으로 취급할 수 있는지와 비용 측정이 먼저다. 그 보장 없이
Approval 전체 평가를 1회로 줄이지 않는다. v1 Inspection 통합, 선택된 Authority guard의 입력 전제 정리 등도
별도 검토 후보이며 이번 변경에서 실행 계약이나 Legacy·Direct/Delegated 승인 의미는 바꾸지 않았다.

### 9.5 Step 4 Authorization / Step 5.2 Claim / Step 5.3 단일 Decision 실행 — Implemented

```text
authorizeSpecialistInvocation(request, attempt?)
  → Request Schema / Harness attempt 확인
  → withGovernanceLedger (HMAC·Schema·동일 lock)
    → 동일 Invocation ID 예약 거부 / 저장 Scope 유일 조회
    → validateStoredIssuance → 현재 승인 정책·source·Snapshot·파일 검증
    → Scope version의 Reservation 수 → evaluateInvocationRequest
    → 승인 Assignment + 현재 등록 Specialist + 요청한 정확한 파일로 Invocation Schema
    → 실제 Invocation JSON byte 제한
    → validateStoredIssuance 재실행 / 선택 파일 내용 일치 / Eligibility 재확인
    → Reservation Schema·binding·ID·Scope 전체 budget 검사 → atomic save
  → 저장 성공한 경우만 allowed
```

- **Approval**은 Scope와 승인 근거를 소유한다. `validateStoredIssuance()`를 Approval 공개 경계로 제공하며
  검증한 파일도 반환한다. `validateStaffingProposal()` → `validateCurrentStaffingPolicy()`도 같은 로딩 결과를
  반환하도록 확장했다. 기존 호출자는 이를 무시할 수 있다. 저장된 위임 승인 검증은 공통
  evaluateDelegationCoverage()로 범위를 평가해 파일을 중복 로딩하지 않는다. 신규 Approval의 전체 평가 3회는 유지한다.
- **Authorization**은 공개 Scope 조회를 중첩 호출해 lock을 다시 잡지 않는다. 공통 Ledger transaction에서
  저장된 발급을 검증하고 같은 transaction 안에서 예산 평가·예약을 저장한다. System 승인 기록의 Repository/UID/time
  검사는 requireCurrentSystemRecord()로 정책 조회와 Proposal/Scope 검증이 공유한다.
- 경로·regular mode·민감 파일·파일 수/크기·Assignment envelope budget과 Commit blob 로딩은 기존 Staffing
  Proposal 검증을 통해 재사용한다. Authorization은 비공개 Inspection State를 만들거나 import하지 않는다.
  이미 읽은 검증 파일에서 요청한 부분집합만 고르고, 최종 재검증 파일 내용과 일치해야 한다. 전체 Authorized
  Invocation JSON도 maxContextBytes로 제한하며 Snapshot 검사나 최종 파일 검증을 생략하지 않는다.
- Lifecycle 입력은 검증된 저장 Scope의 active 판정과 해당 scopeId/version의 예약 수다. Ledger Schema가
  Reservation의 Scope/Assignment 참조·ID 중복·발급 시각 관계·Scope 예산 상한을 검사한다. 실패 기록을 무시해
  예산을 되살리지 않는다. 예약 후 실패/미실행도 소비한 예산이며 환불·재개·실행 결과 기록은 없다.
- **Step 5.2 Claim**은 Authorization의 `claimAuthorizedInvocation(invocation)`으로 제공한다.
  같은 `withGovernanceLedger()` Lock 안에서 저장 Reservation의 유일한 Invocation ID,
  Scope ID/version·Assignment ID·invocationDigest를 확인한다. Invocation files의 순서대로 원본
  Request를 재구성해 requestDigest도 확인하고, 같은 Repository의 유일한 Scope를 조회한다.
  `validateStoredIssuance()`로 최신 승인·정책·위임·Snapshot을 검증하고 Authorization과 공유하는
  `validateInvocationContext()`로 현재 검증 파일과 Invocation 파일의 digest를 비교한다.
  claimedAt이 있으면 거부하며 없으면 현재 시각을 저장한 뒤에만 `{ status: "claimed", invocation }`을 반환한다.
  입력·검증·Lock·저장 실패는 denied다. 신규 Authorization이나 Eligibility 평가는 호출하지 않아
  잔여 예산이 0이어도 예약된 입력을 Claim할 수 있다. Budget은 여전히 예약 수로만 소비한다.
  기존 Ledger의 claimedAt 누락은 미사용 예약이며 읽기 시 default·재저장은 하지 않는다.
- **Workflow / Step 5.3**은 `workflows/development-organization/phase-a/features/decision/execution/authorized-specialist-decision.ts`의
  `runAuthorizedSpecialistDecision(invocation)`으로 단일 호출을 연결한다. 실행 직전 Claim이 거부되면
  오류로 종료하고 v2를 호출하지 않는다. 성공하면 반환된 Invocation의 snapshot·goal과
  specialist·assignmentObjective·files 한 개를 `runIndependentDecisions()`에 전달한다.
  기존 Codex Specialist와 실행 전후 Snapshot·Evidence 검증을 유지하며 검증된 AgentDecision 한 개를 반환한다.
  Claim은 반환 시 Ledger Lock을 해제하므로 Codex는 Lock 밖에서 실행한다. 추가 Authorization·Reservation은 없다.
  Snapshot·Evidence·Codex 오류는 그대로 전파하고 Claim은 유지한다. 동일 Invocation 재호출은 Claim에서 거부한다.
  묶음 실행·Comparison은 아래 Step 5.4에서 연결하며 Staffing Approval/CLI에는 자동 연결하지 않는다.
  Claim 저장 후 실행 전 실패·프로세스 종료에도 자동 해제·재시도·환불·실행 복구는 없다.
  Ledger Lock은 외부 Git을 잠그지 않으므로 최종 검증·Claim·실제 실행 사이 TOCTOU는 남는다.
  저장 후 응답 실패로 결과가 불확실해도 자동 해제하지 않으며 정확히 한 번의 실행 완료를 보장하지 않는다.
- Ledger lock은 외부 Repository를 잠그지 않는다. 최종 검사와 실제 실행 사이의 TOCTOU, 같은 OS 계정/root,
  clock 조작·저장소 rollback이라는 기존 한계는 남는다. 외부 Proposal의 발급 출처·자연어 Constraints의
  의미적 충족도 Reservation이나 Invocation Schema로 증명하지 않는다.


### 9.6 Step 5.4 — Phase A Multi-Specialist Decision & Comparison — Implemented

Step 5.4는 초기 함수형 `runSpecialistDecisions({ scopeId, requests })`로 승인된 동적 Assignment 요청 묶음을
연결했다. LangGraph Step 3에서 해당 Orchestrator와 specialist-decisions/ 디렉터리를 제거하고 실행 계약을
Phase A의 일반 Node / Edge로 이관했다. 현재 실행 경로는 [9.12](#912-langgraph-step-3--phase-a-specialist-decisions-integration)를 따른다.
다음 검증·실행 계약은 이관 후에도 유지한다.

1. `getApprovedStaffingScope()`로 현재 유효한 저장 Scope를 조회한다. 전체 요청을 기존 Request Schema로
   파싱·복제하고 비어 있지 않은 목록, 동일 Scope ID/version, Scope 소속 Assignment,
   Assignment ID와 Specialist ID 중복 부재를 예약 전에 확인한다. Goal과 Snapshot은 이 원본 Scope를 기준으로 한다.
2. 요청 순서대로 `authorizeSpecialistInvocation()` → allowed Invocation →
   `runAuthorizedSpecialistDecision()` → 검증된 AgentDecision을 수집한다.
   개별 Context·권한·예산은 Authorization, Claim·Snapshot·Evidence는 기존 Step 5.3/v2가 검증한다.
   다음 요청은 현재 Decision이 완료된 뒤에만 예약한다.
3. Decision 한 개면 Comparison을 생략한다. 두 개 이상이면 원본 Scope Goal·Snapshot Commit SHA와
   수집한 Decision 배열로 기존 `compareDecisions()`를 호출한다. Comparator와 Reference Validation은 그대로다.

**Step 5.4 초기 결합 계약(이력):** 성공은 `{ status: "completed", decisions, comparison? }`이며 실패는
`{ status: "failed", stage, reason, assignmentId? }`이다. stage는 preflight / authorization / claim /
decision / comparison이며, 실패 시 이후 예약·실행·Comparison을 중단한다. 실패 결과에는 부분 Decision을
성공 결과로 노출하지 않았다. comparison 실패는 모든 Decision 실행이 완료됐으나 비교가 실패했음을 뜻했다.
후속 Phase A Step 2에서 Stage 3 / 4를 분리했다. 현재 Stage 3은 decisions만 완료하고 Stage 4는 별도
decisionComparisonResult의 completed / skipped / failed를 기록한다. 비교 실패는 Stage 3 완료를 보존하며
Phase A 전체 성공이나 후속 진행을 허용하지 않는다. 이 초기 결합 계약을 현재 API로 해석하지 않는다.
Step 5.3의 `InvocationClaimError`만 Claim 거부를 표시하고 v2 오류는 기존 객체 그대로 전파한다.
Workflow는 오류 메시지 패턴을 해석하지 않는다. Claim 거부 원인은 현재 API의 일반적인 reason뿐이므로
이미 사용됨·Scope 무효·입력 변조·저장소 오류 등 세부 원인을 구분하지 않는다.

묶음 예약 transaction이나 durable Workflow 상태는 없다. 예약된 예산과 Claim은 실패 후에도 유지한다.
자동 재시도·환불·재승인·CEO Recovery/Escalation·실행 결과 저장은 구현하지 않았다. 기존 Preflight 검증과 단일 Claim / v2 실행은 재사용하며 순차 실행·실패·Comparison 진입은 Phase A Graph가 단독 소유한다.
Graph를 다시 실행하면 새 Staffing·Scope·Authorization으로 새 예약을 만들 수 있으므로 호출자는 이를 자동 재개로
취급하면 안 된다. Step 5.3의 동일 Invocation 일회 Claim과 묶음의 재호출 의미는 다르다.
외부 Git·정책 변경과 실행 사이의 TOCTOU 및 정확히 한 번의 실행 완료를 보장하지 않는 한계는 유지한다.


### 9.7 LangGraph Minimal Integration Step 1 — Runtime Foundation

LangGraph.js는 최종적으로 Development Organization 전체 실행 Runtime을 맡는다. 실행 책임은
Organization Graph의 Phase 간 순서·데이터 전달과 Phase A Graph의 내부 Node 순서·조건부 분기로 나눈다.
Runtime Foundation 당시에는 상위 Organization Graph를 도입하지 않고 Phase A부터 연결했다.
이후 Phase A에 Specialist Decisions / Comparison, CEO Synthesis와 Human Direction Governance를 연결했다.
상위 Organization Graph는 여전히 미구현이며 Phase 간 실제 연결 책임이 생기는 시점에 구성한다.
[공식 Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)의 StateSchema / StateGraph / compile / invoke를 사용한다.
Agent / Model Provider / Tool Calling은 도입하지 않고 기존 Codex 기반 Agent Runtime을 유지한다.

아래 경로는 `src/workflows/development-organization/` 기준이다.

| 파일 | 현재 책임 |
| --- | --- |
| `index.ts`, `state.ts` | Organization State 타입 공개와 원본 GoalSpec·repositoryPath 공통 입력 소유; Organization Graph는 없음 |
| `phase-a/index.ts` | createPhaseAGraph·PhaseAState와 기존 Phase A Workflow 공개 API |
| `phase-a/state.ts` | 공통 입력·policyLookup / staffingResult / approvalResult / specialistDecisionsResult / decisionComparisonResult; 최종 Phase A Output은 미정 |
| `phase-a/graph.ts` | 8개 일반 Node 직접 등록, 승인·실행 대상·Specialist 반복·실패에 따른 조건부 Edge 연결, compile |
| `phase-a/features/governance/nodes/system-policy/load-system-policy.ts` | Repository 경로 확인 → Governance 조회; 이전 Staffing / Approval 결과 제거 |
| `phase-a/features/staffing/nodes/run-staffing.ts` | ready Policy와 Human Goal로 기존 runStaffing() 실행; 실행 옵션은 closure에 보관 |
| `phase-a/features/governance/nodes/staffing-approval/evaluate-staffing-approval.ts` | proposed의 원본 Proposal을 기존 approveStaffingProposal()에 전달 |
| `phase-a/features/governance/nodes/staffing-approval/confirm-staffing-approval.ts` | 분리된 review로 확인 후 원본 Proposal·receipt로 최종화; receipt는 Node 로컬 변수 |
| `phase-a/features/decision/nodes/preflight-specialist-decisions.ts` | 저장 Scope ID / Version 확인·전체 Assignment 요청 구성 → 기존 Preflight 검증 |
| `phase-a/features/decision/nodes/execute-next-specialist.ts` | 한 Assignment의 Authorization → 기존 Claim / v2 실행 → Index 갱신 |
| `phase-a/features/comparison/nodes/compare-specialist-decisions.ts` | 완전한 Decision 묶음으로 기존 v3 Comparison 호출 |
| `phase-a/features/synthesis/nodes/run-ceo-synthesis.ts` | Stage 3·4 성공 후 Synthesis Application 호출; 결과는 제안이지 승인 아님 |
| `phase-a/features/decision/nodes/execute-next-specialist.ts`의 마지막 성공 | Stage 3 완료 결과 확정 (Step 3.1: 별도 Complete Node 제거) |
| `phase-a/entrypoints/run-staffing-approval.ts` | staffing-approval 대상을 명시한 Phase A invoke → 기존 Staffing Approval 반환 계약 유지 |
| `phase-a/tests/graph.test.ts` | Node·Edge·State·조건부 실행과 결과 검증; 이전 두 Graph의 중복 시나리오 통합 |

```ts
import { createPhaseAGraph } from "@/workflows/development-organization/phase-a/index.js";

const graph = createPhaseAGraph({ maxRounds: 4, executionTarget: "specialist-decisions" });
const state = await graph.invoke({ goal, repositoryPath });
// 승인된 경우에만 state.specialistDecisionsResult에 completed / failed 결과가 저장된다.
// 직접 승인이 필요하면 기존 confirmApproval 콜백을 제공하며, 기본 실행 대상은 staffing-approval이다.
```

Organization State는 goal / repositoryPath만 소유한다. Phase A State는 동일 입력 Schema와 기존 Domain Schema를 재사용해
policyLookup / staffingResult / approvalResult / specialistDecisionsResult / decisionComparisonResult / synthesisResult와 synthesisAssignments·Specialist 준비 요청·현재 Index·수집 Decision·Comparison 입력/결과를 소유한다. 최종 Phase A Outcome은 아직 없으며
향후 Organization 공개 Output은 해결 방향 승인이 구현될 때 확정한다. policyLookup은 기존 Governance API의
StaffingSystemPolicyResult와 같은 ready / denied 구조이며 configuration은 기존 Domain Schema를 그대로 쓴다.
Node는 정책 조회 결과 전체를 교체하므로 denied 뒤에 이전 configuration/version이 남거나
ready 결과와 과거 failure가 동시에 존재하지 않는다. 새 invoke의 정책 조회 Node는 기존 staffingResult / approvalResult도 지워 과거 결과로 라우팅하지 않는다. Organization State에 정책·Proposal·Decision·Comparison이나
미래 phaseAOutcome / Phase B 필드를 미리 넣지 않는다. 새 invoke는 이전 Specialist 결과와 모든 Specialist 중간 State도 제거한다. 범용 State Mapper나 Adapter도 추가하지 않았다.

호출자가 이전 policyLookup을 전달해도 Node는 Governance를 다시 조회한다. Graph State와 구조 검증은
승인 출처나 실행 권한의 증거가 아니며, 서명된 Governance Ledger가 계속 승인·권한 기록을 소유한다.
Application / Governance가 도메인 기능·정책·Context·Evidence·Reservation·Claim 검증을 소유한다.
policyLookup.ready는 정책 조회 성공만 뜻한다. 현재 END는 Staffing 실패/Escalation 또는 승인 평가 종료이며 Phase A 전체 성공·조직 완료를 뜻하지 않는다.

State 변경 이력: 기존 createDevelopmentOrganizationGraph의 저장소 사용처는 테스트·문서뿐이었다.
Phase A 전용 createPhaseAGraph로 바꾸며 기존 factory export를 제거했고, 독립적인 정책·status·failure 채널을
policyLookup으로 모았다. Step 2.5 초기에 중간 채널을 Setup 내부로 분리했으나, 전체 Organization 기준 재검토 후
별도 Setup Graph / State / Output을 제거하고 당시 Phase A가 중간 상태와 staffingApprovalResult를 소유하도록 통합했다.
후속 Step 4에서 이 중복 결과와 Collect Node를 제거하고 Entry Point에서만 외부 결과를 변환한다.
현재 root의 DevelopmentOrganizationState는 공통 입력만 가진다.
runStaffingApproval / runAuthorizedSpecialistDecision 및 현재 CLI 계약은 유지한다. runSpecialistDecisions 함수 API는 제거했으며 호출부는 Phase A Graph 실행으로 이전했다.

설치 버전은 `@langchain/langgraph` 1.7.3 / `@langchain/core` 1.3.7이며 lockfile로 고정한다.
실제 패키지 조건은 graph의 core ^1.3.4, Zod ^3.25.32 또는 ^4.2.0이다. 기존 Zod 4.6.5와
TypeScript 5.9.3 / NodeNext를 그대로 사용하며, core의 Node >=20 조건을 Node 23.9.0에서 검증했다.
패키지의 SDK·checkpoint·LangSmith 전이 dependency가 설치되어도 해당 기능을 연결한 것은 아니다.

별도 Runtime Manager / Provider Registry / 상위 Organization Graph / 재시도·복구·Checkpoint·Interrupt/Resume는 없다.
Step 2는 CEO Staffing·Approval 평가를 연결했고 Step 2.5는 콜백 기반 Human 확인과 CLI의 실행 책임을 같은 Graph로 통합했다.
Step 3는 일반 Specialist Node와 조건부 Edge로 내부 순차 실행·반복·실패·Comparison을 이전하고 함수형 Orchestrator를 제거했다. 대기/재개·Checkpoint·복구는 아직 없다.
Graph 테스트는 실제 LangGraph 런타임과 모의 Governance API를 조합한다. 기존 Governance의 signed Ledger·정책 검증은
기존 테스트가 담당하며, 전체 Graph+실제 Human+Codex E2E나 Phase B·복구 보장은 아직 검증하지 않았다.


### 9.8 LangGraph Step 2 — CEO Staffing & Approval Integration

아래는 Step 2 당시의 정책 조회·Staffing·승인 평가 범위다. Step 2.5에서 추가한 Human 콜백과 단일 Orchestrator 경계는 다음 절을 따른다.

```text
START → load-system-policy
          ├─ denied → END
          └─ ready → run-staffing
                       ├─ failed / escalated → END
                       └─ proposed → evaluate-staffing-approval
                                       └─ approved / approval-required / denied → END
```

Graph는 이 순서와 Edge를 소유하고 Node는 기존 Application만 호출한다. policyLookup은 계속 Governance의
최신 정책 조회 결과이며, staffingResult는 기존 staffingRunResultSchema를 사용한다. approvalResult는 기존
StaffingApprovalResult 중 Staffing 승인 평가에 해당하는 approved / approval-required(kind=staffing) / denied를
보존한다. Scope·ApprovalRecord·Proposal Schema는 재사용하며 configured나 다른 kind의 결과는 성공으로 처리하지 않는다.
Staffing proposed는 승인으로 취급하지 않고, 원본 Human Goal / Constraints / Proposal ID·내용을 변경하지 않는다.

`createPhaseAGraph({ maxRounds, timeoutMs, agent })`는 실행 설정을 State 밖 Node closure에 캡처한다.
maxRounds의 기본값은 기존 Staffing CLI와 같은 4이며 Agent·timeout은 기존 Application 설정을 따른다.
함수·Agent·HumanConfirmation은 State에 직렬화하지 않는다. 직접 확인이 필요하면 staffingResult.proposal과
approvalResult.subject / binding / reason을 그대로 유지해 다음 Human Review의 근거로 남긴다.
Graph는 Boolean 승인이나 가짜 Receipt를 만들지 않고, 실제 Human 승인·Scope 발급은 Governance가 소유한다.
State에 승인 Scope가 있어도 후속 Authorization·Reservation·Claim을 대체하지 않는다.

기존 `runStaffingApproval()`과 CLI는 유지하고 Graph에서 해당 Workflow 전체를 재호출하지 않는다.
Step 2 당시에는 일시적으로 두 조정 진입점이 있었다. 아래 Step 2.5에서 중복 순서를 제거하고 CLI도 Graph Adapter로 전환했다.
Graph는 retry policy·Checkpoint·자동 복구를 설치하지 않는다. 예상 밖 Application 예외는 invoke를 reject하며
새로운 Staffing/승인 시도를 자동으로 하지 않는다. 수동 invoke는 새 CEO 실행·Proposal·Scope 처리를 만들 수 있다.
Scope 저장 후 응답 실패·프로세스 종료·노드 재실행에서 중복 승인을 방지하는 복구 정책은 이번 단계에서 만들지 않았다.
기존 Governance의 같은 Proposal 중복 발급 거부는 유지하지만 전체 Graph의 idempotency나 exactly-once를 뜻하지 않는다.
이 경계는 Step 3 및 Checkpoint 통합 검증의 과제다.

Graph 테스트는 실제 compile/invoke와 모의 Application으로 라우팅·호출 횟수를 검증한다.
Phase A 통합 테스트는 실제 Staffing / Governance / 서명 Ledger, 테스트용 CEO Agent와 mock TTY를 사용해
위임 승인 Scope·직접 승인 대기·CEO 실행 중 위임 철회 거부를 확인한다. 실제 Codex·Human 확인·Checkpoint E2E는 미검증이다.


### 9.9 Step 2.5 — Workflow Architecture Consolidation

아래는 단일 Orchestrator로 통합한 당시의 구조다. 이후 CLI 범위 분리 시도는 9.10, 현재 Phase A 통합 결정은 9.11에 남긴다.

Phase A의 상위 Staffing / Approval 순서는 createPhaseAGraph() 한 곳에서 관리한다.
기존 함수형 Workflow와 Graph에 같은 순서를 유지하면 실패 분기와 Human 확인의 안전성이 달라질 수 있어,
runStaffingApproval()은 Graph를 invoke하고 기존 StaffingApprovalWorkflowResult로 변환하는 Adapter로 바꿨다.
CLI는 기존 API·review·/dev/tty 콜백·출력·exit code를 유지하면서 실제로 이 Graph를 실행한다.

```text
START → load-system-policy
          ├─ denied → END
          └─ ready → run-staffing
                       ├─ failed / escalated → END
                       └─ proposed → evaluate-staffing-approval
                                       ├─ approved / denied → END
                                       └─ approval-required → confirm-staffing-approval → END
```

Human Node는 콜백이 없으면 기존 approval-required(subject / binding 포함)를 유지한다.
콜백에는 structuredClone한 review만 전달하고 null은 rejected, 콜백·최종화 예외는 failed(confirmation)로 반환한다.
receipt가 있으면 원본 StaffingProposal을 approveStaffingProposal()에 다시 전달한다. CEO는 재실행하지 않는다.
Governance가 대기 이후 최신 Repository·Snapshot·정책·binding을 재검증하고 승인·Scope 저장을 담당한다.
Human 대기 동안 Ledger lock을 유지하지 않는다. 예상 밖 최종 승인 결과는 denied이며 성공으로 바꾸지 않는다.

Human 확인과 최종화는 같은 Node에 둔다. 프로세스 내부 일회용 HumanConfirmation을 Node의 지역 변수로만
소비하기 위해서이며 별도 확인 Node 사이에 State로 직렬화하거나 Boolean 승인으로 바꾸지 않는다.
Agent / maxRounds / timeoutMs / confirmApproval은 Graph 생성 옵션의 closure이며 State 채널이 아니다.
Organization State는 goal / repositoryPath만 유지하고 Phase A approvalResult는 기존 평가 결과에
rejected / failed(confirmation)를 더한다. Staffing 실패·Escalation은 staffingResult, 정책 실패는 policyLookup에 남는다.
Adapter가 이를 기존 failed(system-policy) / failed(confirmation) / denied / rejected / approval-required / approved 계약으로 변환한다.
StateSchema 검증은 객체를 복사할 수 있으므로 원본 Proposal 보존은 같은 ID·내용을 뜻하며 JS 참조 동일성을 보장하지 않는다.
State에 발급 Scope가 있어도 권한 증거가 아니며 후속 Authorization / Reservation / Claim은 여전히 Governance 책임이다.

Staffing과 Approval Node는 staffing-approval/에, 정책 조회 Node는 nodes/에 둔다. Subgraph나 범용 DI는 추가하지 않았다.
당시 specialist-decisions/는 후속 Graph 연결을 위해 유지했다. 현재 Step 3에서는 함수형 Orchestrator를 제거하고 동일 계약을 Phase A Node / Edge로 이전했다.
Approval 평가·Human 최종화·Scope 발급에 자동 재시도를 설치하지 않았다. Checkpoint·Interrupt/Resume는 없고,
수동 재호출은 새 Staffing 실행이므로 전체 Workflow의 idempotency / exactly-once / 저장 직후 장애 복구를 보장하지 않는다.

실제 Graph·Staffing·서명 Ledger와 fake CEO / mock TTY로 기존 승인·위조 거부·정책/Repository 변경 검증,
Human 대기 중 같은 Proposal의 선행 승인에 대한 중복 발급 거부와 CLI → Adapter → Graph 실행을 검증한다.
실제 Codex·Human E2E, 영속 재개·장애 복구는 검증하지 않았다.


### 9.10 Step 2.5 — Workflow Boundary & Structure

아래는 이전 Setup Subgraph 구현과 당시의 분리 근거다. 현재 구조는 9.11의 Phase A 통합으로 대체했다.
과거 CLI 격리·Output 필터링 테스트를 현재 구조의 보장으로 해석하지 않는다.
[Workflow Architecture](workflow-architecture.md#9-설계-판단의-발전과-현재-유효-범위)에 판단 변화와 후속 과제를 정리한다.

단일 Graph 통합만으로 실행 범위가 고정되지는 않았다. runStaffingApproval()이 Phase A 전체 Graph를 호출하면
후속 Specialist Decisions를 연결할 때 기존 Staffing CLI도 실행을 시작할 위험이 있다. Staffing Setup은
승인된 Scope 확보 또는 명시적 미완료 결과까지의 독립 실행 범위이므로 실제 재사용 경계로 분리했다.
폴더만 나누거나 같은 순서를 별도 함수로 복제하지 않고 컴파일된 LangGraph Subgraph를 재사용한다.

```text
Staffing CLI → runStaffingApproval → createStaffingSetupGraph
Phase A API → createPhaseAGraph → [같은 Staffing Setup Subgraph] → END
                                   └─ Step 3: approved 결과만 후속 Decision 연결 예정
```

staffing-setup/graph.ts가 정책 조회·CEO Staffing·Approval·필요한 Human 확인·Governance 최종화의 순서를 소유한다.
모든 종료 경로는 collect-staffing-setup-result Node에서 기존 공개 API 의미의 결과로 모인다.
실패를 성공으로 바꾸지 않으며 proposed는 Setup 완료 결과가 아니다. 이 Node는 실행 결과를 전달할 뿐
승인 정책이나 권한을 판정하지 않는다. approved / approval-required / denied / rejected / failed / escalated를 보존한다.

조직 State는 goal / repositoryPath만 소유한다. Setup State는 이 입력과 policyLookup / staffingResult /
approvalResult를 소유하며, Subgraph output Schema로 부모에 공통 입력과 staffingSetupResult만 전달한다.
부모 Phase A State도 이 세 채널만 갖는다. 같은 입력 Schema와 결과 Schema를 재사용하고 채널은 결과 전체를
교체하므로 내부 상태를 상위로 병합하거나 별도 Scope/Proposal 필드로 중복 복사하지 않는다.
approval-required 결과에는 원본 Proposal·Binding이 포함된 request가 남아 Human 검토에 사용할 수 있다.
Graph 종료는 실행 범위의 종료일 뿐 Phase A 전체 성공을 의미하지 않는다. State의 Scope는 권한 증거가 아니다.

기존 phase-a/index.ts의 runStaffingApproval(options)과 반환 타입·CLI 계약은 유지한다. Adapter는
entrypoints/run-staffing-approval.ts로 옮겼고 오직 Setup Graph를 호출한다. createStaffingSetupGraph도
독립 실행 진입점으로 공개했다. createPhaseAGraph의 반환 State에서 기존 최상위 중간 필드는 제거하고
staffingSetupResult로 바꿨다. 저장소 사용처는 테스트였으며 이에 맞춰 갱신했다. 호환 Wrapper는 두지 않는다.
Agent·timeout·maxRounds·Human 콜백은 생성 옵션에 캡처하고 일회용 receipt는 Node 내부에서만 소비한다.
원본 Proposal 보존·review 사본 격리·대기 이후 Governance 재검증·Ledger Lock 경계는 바꾸지 않았다.

테스트는 독립 Setup / 부모의 Subgraph 경로를 같은 시나리오로 실행해 실패·대기·거부와 상태 격리를 확인한다.
실제 서명 Ledger·fake CEO·mock TTY 통합으로 직접/위임 승인과 변경된 정책 거부를 검증하고,
CLI가 부모 Graph를 호출하면 실패하도록 만들어 향후 부모 확장이 CLI 범위를 넓히지 않는 경계를 검사한다.
기존 Specialist Decisions / Authorization / Comparison은 바꾸거나 Graph에 연결하지 않았다.
자동 재시도·Interrupt/Resume·Checkpoint는 없으며 저장 이후 장애 복구·전체 실행 idempotency는 보장하지 않는다.


### 9.11 Step 2.5 — Graph Boundary & Directory Consolidation

이 절은 통합 당시의 구현 범위와 CLI 확장 위험 기록이다. Step 3에서 추가한 명시적 실행 대상·Specialist Node의 현재 계약은 9.12를 따른다.

전체 Lifecycle을 Organization Graph가, 주요 판단·실행 범위를 Phase A / Phase B가 소유하도록 목표 계층을 결정했다.
기존 CLI 독립 실행·Staffing 내부 State 분리를 위해 둔 Setup Subgraph는 이 계층의 필수 경계로 유지하지 않는다.
현재 구현된 Node·분기·결과 Schema를 Phase A로 옮기고 별도 Setup Graph / State / Output / factory export를 제거했다.
Organization Graph·Phase B·Specialist Analysis와 Handoff는 생성하거나 연결하지 않았다.

```text
START → load-system-policy
          ├─ denied → collect-staffing-approval-result → END
          └─ ready → run-staffing
                       ├─ failed / escalated → 결과 수집
                       └─ proposed → evaluate-staffing-approval
                                       ├─ approved / denied → 결과 수집
                                       └─ approval-required → confirm-staffing-approval → 결과 수집
```

당시 Phase A State는 goal / repositoryPath / policyLookup / staffingResult / approvalResult /
staffingApprovalResult를 소유했다. 마지막 값은 기존 Staffing Approval 반환 의미를 유지하던 단계 결과이며
최종 Phase A Outcome이 아니다. Graph State는 Governance Ledger의 승인 근거·실행 권한을 대체하지 않는다.
Human review 사본·원본 Proposal·receipt 지역 변수·대기 이후 재검증·Ledger Lock·Scope 중복 발급 방지는 유지했다.
Application·Governance·기존 Specialist Decisions 로직은 변경하지 않았다.

당시 Node는 nodes/policy·staffing·approval에, 결과 정규화는 nodes/collect-staffing-approval-result.ts에 두었다.
현재는 책임 기반 디렉터리 정리로 features/staffing/nodes와 features/governance/nodes로 이동했으며 당시 실행 계약은 유지한다.
당시 Entry Point는 Phase A를 호출하고 staffingApprovalResult만 기존 API 형식으로 반환했다. Step 4에서 Stage 결과의 직접 변환으로 바뀌었다. CLI 입력·Human 확인·출력은 유지한다.
단, Step 3에서 후속 Node가 추가되면 같은 Graph를 호출하는 Staffing CLI의 실행 범위도 확장될 수 있다.
**Step 3에서 CLI 실행 계약을 함께 재설계해야 하며 미래의 범위 격리를 현재 보장하지 않는다.**
이를 위한 별도 Staffing Graph·중복 함수형 Orchestrator·범용 실행 범위 옵션·승인 우회 옵션은 추가하지 않았다.
후속 Edge는 아직 없으며 향후 승인된 Staffing 결과에 대해서만 기존 Authorization / Claim / Decision 경로를 연결해야 한다.
자동 재시도·Interrupt/Resume·Checkpoint 및 저장 이후 장애 복구 보장은 여전히 없다.


### 9.12 LangGraph Step 3 — Phase A Specialist Decisions Integration

Phase A는 승인 평가 또는 Human 확인 이후 approvalResult가 approved이고
executionTarget이 specialist-decisions인 경우에만 Preflight로 진행한다. 기본값은 staffing-approval이며
runStaffingApproval()도 이를 명시한다. 같은 Graph를 재사용하면서 기존 Staffing CLI는 Specialist /
Comparison을 실행하지 않는다. 실행 대상은 종료 범위이며 Governance 우회 옵션이 아니다.

```text
preflight-specialist-decisions → failed: END
  ↓ ready
execute-next-specialist ← remaining Assignment
  ├─ failed: END
  └─ last success: Stage 3 completed → compare-specialist-decisions
                                       └─ completed / skipped / failed → END
```

Preflight Node는 getApprovedStaffingScope()로 저장된 Scope를 재조회해 승인 결과의 ID / Version과 대조한다.
모든 Assignment의 순서·contextPaths를 복사한 요청을 `features/decision/validation/validate-specialist-request-batch.ts`의
순수 배치 검증 함수에 전달한다. Phase A Refactoring Step 3에서 이 함수의 중복 Scope 조회를 제거했다.
Workflow는 요청 Schema·Scope / Version 일관성·소속·중복 요청·누락·순서·Sparse Array를 검사한다.
Specialist 중복 금지는 Staffing 정책 검증을 Governance가 재사용하므로 Workflow의 별도 검사를 제거했다.
전체 요청을 검증·분리하기 전에 Authorization / Reservation을 수행하지 않는다.
미승인·조회 실패·불일치·중복·잘못된 요청은 preflight 실패로 종료한다. Sparse Array 거부도 유지한다.

execute-next-specialist는 호출마다 한 요청만 authorizeSpecialistInvocation()에 전달하고, allowed Invocation을
`features/decision/execution/authorized-specialist-decision.ts`의 runAuthorizedSpecialistDecision()으로 실행한다.
Invocation은 지역 변수이며 State에 보관하지 않는다. Claim / Snapshot / Evidence / v2 실행은 기존 기능을
재사용한다. 반복·다음 Assignment 진입·Comparison 여부·실패 종료는 Phase A 조건부 Edge가 단독 소유한다.
기존 함수형 runSpecialistDecisions와 전체 specialist-decisions/ 디렉터리 및 단일 위임 Node는 제거했다.

State는 preparedSpecialistRequests / currentSpecialistIndex / collectedDecisions로 진행 상황을 관리한다.
specialistComparisonContext는 Preflight에서 확인한 원본 Goal / Snapshot SHA만 보존한다.
후속 Phase A Step 2에서 specialistComparison 채널을 제거하고 Stage 4의 decisionComparisonResult로 결과를 기록한다. Graph State는 승인·실행 권한의 근거가 아니다. 최신 Authority·Context·
Budget은 Governance가 재검증한다. Graph 기본 step limit가 별도 Invocation 예산이 되지 않도록 유한 Assignment
커서로 반복을 종료하며, 호출자는 invoke의 recursionLimit으로 별도 실행 상한을 지정할 수 있다.

초기 Step 3에서는 specialistDecisionsResult가 optional comparison과 comparison 실패 단계까지 결합했다.
**현재 Phase A Step 2 계약:** specialistDecisionsResult는 completed / 비어 있지 않은 decisions 또는
failed / preflight·authorization·claim·decision / reason·assignmentId?다. 모든 Assignment가 성공하면
Step 3.1부터 마지막 execute-next-specialist 업데이트가 Stage 3을 확정하고 compare-specialist-decisions로 진행한다.
Stage 4는 Stage 3 완료 결과를 읽어 단일 Decision은 skipped / insufficient-decisions, 복수 Decision은
기존 v3를 호출해 completed / comparison 또는 failed / reason을 decisionComparisonResult에 기록한다.
Stage 4 실패 시 Stage 3과 검증된 Decision은 보존한다. Stage 3 실패 시 미완료 묶음은 성공으로 노출하지 않고
Stage 4를 실행하지 않는다. 기존 specialist-decisions 대상은 Stage 4에서 END다. ceo-synthesis 대상도 Stage 4 실패에서 Synthesis로 진입하지 않는다.
InvocationClaimError로 Claim / Decision을 구분하며 Claim 세부 원인을 추측하지 않는다. 기존 Domain Schema·
Reference / Evidence 검증을 재사용하고, 새 invoke는 두 Stage 결과와 요청·Index·중간 데이터를 초기화한다.
기존 SpecialistDecisionsWorkflowResult는 Stage 3 의미로 좁아졌고 DecisionComparisonStageResult를 공개했다.
Graph State 소비자는 comparison 필드 대신 새 Stage 4 결과를 확인해야 하며 Staffing API / CLI는 그대로다.

Authorization은 예약 시 예산을 소비하고 Claim은 일회성이다. 실패 후 Claim / 예산을 자동으로 취소·환불하지
않으며 Node / Graph에 자동 Retry / Replay를 설치하지 않는다. 이관 전후 정책과 부작용 경계는 동일하다.
이 단계의 END / completed는 분석·비교 범위의 종료일 뿐 Phase A 전체 완료나 해결 방향 승인이 아니다.
Human Direction Governance·Organization / Phase B Graph·Handoff·Interrupt / Resume /
Checkpoint와 자동 복구는 여전히 미구현이다. 같은 Graph를 다시 invoke하면 새 Staffing·Scope·Invocation이
생길 수 있으므로 전체 idempotency나 저장 이후 장애 복구, 정확히 한 번의 실행 완료를 보장하지 않는다.

초기 Step 3는 한 Node가 함수형 Workflow를 호출했다. 내부 순서·반복·실패 제어가 Graph 밖에 남는 한계를
확인해 현재 구조로 이전했으며 Governance / Application 판단 규칙은 재구현하지 않았다.
검증은 실제 LangGraph invoke와 모의 Governance / 단일 실행 기능의 단위 테스트, 실제 Staffing / Governance /
서명 Ledger / v2·v3 코드에 fake CEO / mock TTY / 모의 Codex process를 조합한 통합 테스트로 구분한다.
실제 Human·Codex·전체 Organization / 복구 E2E나 모델 품질은 검증 범위가 아니다.

### Phase A Refactoring Step 3 — Validation Responsibility Consolidation

Preflight의 Node는 저장 Scope를 Governance에서 한 번 조회하고 순수 배치 Validation에 전달한다.
이 함수는 권한 인증 API가 아니다. 개별 Authorization / Claim은 최신 정책·Repository·Context·예산 및
일회성 검증을 계속 수행한다. 실제 Staffing·Governance API의 중복 Specialist 거부를 통합 테스트로 확인한다.

Step 3 당시 Complete Node는 유지했다. Graph의 커서 기반 반복 종료는 Decision 수와 대상 수의 일치를 증명하지 않으며,
독립적인 Stage 3 완료 업데이트를 Comparison 전에 관찰하는 기존 계약이 있다. 빈 결과·미완료·커서 불일치를
성공으로 처리하지 않는 guard를 유지한다. 다른 Node의 선행조건·Runtime 결과 Schema 검사도 정책 재구현이
아니므로 보존했다. 상세 판단은 [검증 책임 기록](workflow-responsibility-boundaries.md#specialist-preflight의-중복과-목적-구분)을 따른다.
Stage 1 / 2 결과 분리·Checkpoint / Resume·부작용 복구는 이번 변경 범위가 아니다.

### Phase A Refactoring Step 3.1 — Specialist Completion Node Consolidation

실행 결과·커서 갱신과 Stage 3 완료 검사가 두 Node에 분산된 경계를 다시 검토했다. 마지막 Specialist 실행
성공 시 Stage 3 결과까지 반환하도록 통합하고 Complete Node를 제거했다. 완료 결과의 독립성이 별도 Node의
필요성을 뜻하지는 않는다. 빈 요청·잘못된 커서·수집 수 불일치·이미 종료된 Stage는 Authorization 전에 거부하며,
실행 후 Decision 수·커서·대상 수의 일치를 검사한다. Graph는 completed만 Comparison으로 보내고 반복·실패를 제어한다.

독립 완료 Stream 이벤트는 없어졌지만 마지막 Execute 업데이트에서 Comparison 전 Stage 3 완료를 관찰한다.
Stage 3 / 4의 독립 Schema·비교 실패 시 Decision 보존·단일 생략·Governance와 v2 / v3 신뢰 검증은 유지했다.
State는 권한 원본이 아니며 Node 재실행·Checkpoint 복구·exactly-once는 구현하거나 보장하지 않는다.

### Phase A Refactoring Step 4 — Staffing & Approval Result Boundary Consolidation

Stage 1의 staffingResult와 Stage 2의 approvalResult가 이미 존재함에도 Collect Node에서 통합 결과를 다시
저장하던 중복을 제거했다. staffingApprovalResult Schema / State / StaffingApprovalStageResult 타입과
collect-staffing-approval-result Node를 삭제했다. Staffing은 proposed / failed / escalated,
Approval은 approved / approval-required / denied / rejected / confirmation failed만 소유한다.
System Policy 거부는 policyLookup에 남는다. Stage 3 / 4 결과 계약은 변경하지 않았다.

Graph는 Policy 거부·Staffing 실패/Escalation 시 종료하고, proposed만 승인 평가로 보낸다.
approval-required만 Human 확인을 실행하며 평가·확인 후 동일 승인 분기를 재사용한다.
approved + specialist-decisions만 Preflight로 진입한다. Preflight는 State의 Scope를 권한으로 신뢰하지 않고
Governance에서 저장 Scope를 재조회한다. Application 정책·Proposal / Receipt·Scope 발급은 그대로다.

runStaffingApproval()은 실행 후 독립 Stage 결과를 기존 StaffingApprovalWorkflowResult로 변환한다.
정책 실패는 system-policy, 승인 대기는 request envelope로 표현한다. 결과가 없거나 모순되면 오류를 던진다.
Graph State 변경은 내부 Entry Point와 테스트에 반영했고 저장소에서 기타 직접 호출자는 발견되지 않았다.
외부 Graph 소비자에게는 State 계약 변경이지만 기존 Staffing CLI·Entry Point API / JSON은 유지한다.
최종 Phase A Outcome·Checkpoint / Resume는 별도 설계 대상이다.

### Step 6.2 — CEO Synthesis Application & Graph Integration

`src/application/synthesis/`는 SourceReference 기반 해결 방향 제안을 생성한다.
이 단계는 ApprovedDecision이나 승인 기록을 만들지 않으며 Human Governance는 Step 7의 책임이다.

| 파일 | 책임 |
| --- | --- |
| model/proposal.ts, model/result.ts | 검증된 제안·Escalation·실패 결과와 SourceReference의 Domain 계약 |
| protocol/context.ts, protocol/ceo.ts | 기존 Domain Schema를 재사용한 CEO Context와 propose / escalate 출력 계약 |
| flow/validation/validate-context.ts | Assignment / Decision 일치·기존 Comparison Reference 검증 재사용 |
| flow/validation/validate-output.ts | 출처 무결성과 Propose의 쟁점별 처리 위치·누락 검증 |
| flow/run-synthesis.ts | 입력 캡처 → Agent 단일 실행 → Schema → Reference → Propose Coverage → 결과 반환 |
| ceo/codex-ceo-synthesis.ts | 역할 Prompt·Codex 호출·JSON 수신, 실행 / Timeout / JSON 실패 분류 |
| infrastructure/codex/context-only-codex.ts | Staffing과 공유하는 Codex 옵션·임시 빈 cwd·cleanup. 역할과 Domain 정책을 소유하지 않는 구체적인 transport 함수 |
| phase-a/features/synthesis/nodes/run-ceo-synthesis.ts | Stage 선행조건 검사와 Application 호출, 부분 State 업데이트 |

#### Input / Output

SynthesisContext는 원본 goal / repositoryCommitSha, assignments의 assignmentId / specialistId / objective,
검증된 decisions와 comparison의 completed / comparison 또는 skipped / insufficient-decisions를 받는다.
Assignment·Decision이 정확히 1:1이어야 하며 단일 Decision만 비교를 생략한다. completed Comparison의
참조는 기존 Comparison Application validator를 재사용해 확인한다. 입력을 Zod로 복사·검증하고 Agent에는
다시 분리한 사본을 전달해 Agent 변조로 검증 기준이 바뀌지 않게 한다. Graph는 Preflight의 Governance 조회
결과에서 Assignment projection을 저장한다. Context에 Scope·Budget·Receipt·Invocation 권한 객체는 없다.

CEO action은 propose / escalate뿐이다. SynthesisResult는 proposed / proposal, escalated / reason·questions·sources,
failed / failure·reason이다. failure는 invalid-input / agent-execution / timeout / malformed-json /
invalid-output(Schema) / invalid-references / incomplete-coverage를 구분한다. 실패를 Escalation으로 바꾸지 않으며
raw process 출력·민감한 Context·검증 예외의 내부 상세를 공개 reason에 넣지 않는다.
Proposal은 direction, rationale, alternatives(description·reasonNotChosen), tradeoffs, risks, unresolvedIssues,
humanReviewItems를 가진다. rationale은 non-empty 근거 항목 목록이며 tradeoffs는 benefit / cost / reason /
sources로 구조화한다. 각 항목에 non-empty sources를 붙인다. Human Review 항목과 Escalation 질문도 최소 하나다.
이 외 Proposal 배열은 실제 해당 사항이 없으면 비울 수 있다. 이전 rationale 단일 객체·tradeoffs.text 계약은
이 리팩터링에서 변경했으며 저장된 과거 결과와 직접 소비자는 새 Schema로 이전해야 한다.

#### SourceReference 검증과 한계

- recommendation: specialistId로 원본 recommendation 참조.
- evidence / risk / uncertainty: specialistId와 0-based index로 해당 Decision 배열 참조.
- finding / gap: 0-based index로 원본 Comparison 배열 참조. skipped에서는 사용할 수 없다.

없는 Specialist·범위 밖/음수/소수 index·목록 내 중복·추가 Evidence 필드를 거부한다.
초기 Step 6.2는 Propose / Escalate 구분 없이 모든 Recommendation·Risk·Uncertainty·Conflict·Trade-off·Gap을
출력 어딘가에 인용하도록 강제했다. 하나의 sources 배열에 몰아 넣어도 통과하고 정당한 Escalation을 거부할 수
있어 아래처럼 변경했다. 이는 예전 전역 참조 개수 검사를 현재 정책으로 해석하지 않도록 남기는 이력이다.

**현재 Propose Coverage:**

| 원본 쟁점 | 처리 내용을 설명하는 위치 |
| --- | --- |
| Conflict Finding | rationale 또는 unresolvedIssues |
| Trade-off Finding | 구조화된 tradeoffs, rationale 또는 unresolvedIssues |
| Gap | rationale 또는 unresolvedIssues |
| Risk | risks 또는 unresolvedIssues. 관련 여러 원본 Risk를 하나의 설명으로 묶을 수 있음 |
| Uncertainty | unresolvedIssues. 관련 여러 원본 불확실성을 묶을 수 있음 |

하나의 처리 항목은 Finding / Gap 하나까지만 참조한다. 복수 쟁점은 근거 목록이나 미해결 목록에서 각각
설명해야 하며, alternatives / humanReviewItems에 참조만 모아 두는 것으로는 쟁점 Coverage를 충족하지 못한다.
전체 Recommendation이나 모든 Evidence를 인용할 의무는 없다. Risk·Uncertainty에는 원본 중요도 정보가 없으므로
Harness가 임의의 중요도 정책을 만들지 않는다. 해당 원본 범주는 보수적으로 추적하되 원본 문장별 반복 서술을
요구하지 않고 주제별 묶음을 허용한다. 중요도 판별·관련성·묶음의 적절성은 Human 검토 대상이다.

**현재 Escalate:** 구체적인 이유·질문과 non-empty sources를 요구하고 인용된 참조의 존재·범위·중복만
검사한다. Proposal Coverage는 적용하지 않아 하나의 blocker에 관련된 일부 출처만으로 Escalation할 수 있다.

출처의 존재·위치·쟁점별 분리는 설명이 실제로 타당한지, 서로 무관한 내용을 근거처럼 쓰지 않았는지,
Conflict가 적절히 해결됐는지, 자연어 Constraints를 준수하는지 증명하지 못한다. 형식적 참조 나열은 줄이지만
일반적 문장을 쟁점별로 반복하는 의미적 회피까지 정적으로 차단했다고 주장하지 않는다. 새 Evidence 필드는
허용하지 않으며 Context / Agent 입력 사본을 분리해 원본 변조로 참조 검증 기준을 바꾸지 못하게 한다.
SynthesisProposal은 검토 대상이지 ApprovedDecision이 아니며 Step 7의 승인·기록은 구현하지 않았다.

#### Runtime / Graph

Staffing의 임시 디렉터리와 Codex exec 옵션을 공통 transport로 추출했으며 Staffing 프로토콜·오류 의미는 유지했다.
Synthesis 역할은 별도다. Repository/도구/네트워크/추가 조사·Specialist 재실행·TaskContract·구현 계획 확정·승인을
금지한다. 빈 임시 cwd, read-only sandbox, user config/rules 무시, 도구·multi-agent·web 비활성화 옵션을 재사용한다.
실제 Codex 모델 호출·품질·격리의 전체 E2E를 이번 테스트로 검증했다고 해석하지 않는다.

명시적 ceo-synthesis 대상은 기존 승인 → Specialist → Comparison 이후 Stage 5까지 진행한다.
Comparison 실패는 차단하고 completed 또는 단일 skipped만 Node에 진입한다. synthesisResult는 독립 결과로
기록하며 앞선 Stage를 지우지 않는다. synthesisAssignments / synthesisResult는 새 invoke에서 초기화한다.
기존 staffing-approval / specialist-decisions·CLI 종료 범위는 유지했다. 실행 Agent와 timeout은 Graph 생성
옵션의 synthesis에 두며 State에 직렬화하지 않는다. 추가 Authorization·분석 Loop·자동 Retry는 없다.
Human Governance·승인 Provenance·ApprovedDecision·Phase B Handoff·Checkpoint / Resume는 미구현이다.

### Step 7.2 — Human Direction Governance

초기 Step 7.2에서 Governance approval/features/direction-review는 Review 출처 등록·Action Binding·Human Receipt 검증·
승인/수정 요청/거부 기록과 ApprovedDecision 발급을 소유한다. Decision / Comparison / Synthesis
Application의 실제 검증 성공 결과를 일회용 프로세스 내부 기록으로 확인하고 signed Ledger에 연결한다.
Graph proposed 값이나 Digest만으로는 Review를 등록할 수 없다. Evidence / Reference / Coverage와
의미 분석은 기존 Application에 남긴다.

ApprovedDecision은 Proposal 복사본 대신 Review ID / Binding과 실제 Approval Record ID를 저장한다.
조회 API는 원본 분석·Proposal·Goal·Snapshot·Human 기록의 무결성을 검증해 복원한다. Step 7.2 리팩터링에서 과거 기록 조회와 현재 실행 적격성을 분리했다. Review 등록·확정과 Scope 조회·Authorization은 현재 Policy / Repository 검증을 계속 재사용하며 Human 입력을 Ledger Lock 안에서 기다리지 않는다.
역사적 Ledger에는 optional 필드를 추가하므로 읽기 시 기본값을 쓰거나 마이그레이션하지 않는다.

Phase A는 human-direction-governance 대상에서만 Review / Interrupt / Finalize / Synthesis Revision
경로를 연결한다. 준비는 Synthesis 검증 직후에 수행하여 객체 출처가 State 직렬화로 사라지기 전에
등록한다. 승인·거부·최대 두 번의 수정은 실제 일회용 Confirmation을 필요로 한다.
Revision은 이전 Proposal / Feedback과 동일 분석을 사용하고 과거 Reservation / Claim을 재실행하지 않는다.
기존 세 실행 대상·Staffing CLI·Authorization / Budget 정책은 유지한다.

메모리 Checkpointer는 같은 Graph 인스턴스 / Thread에서만 재개한다. 영속 Checkpoint·장애 후 복구·
exactly-once·외부 IAM은 제공하지 않는다. Receipt는 State에 저장하지 않으며 Resume는 인증이 아니다.
Phase B Handoff·Task 권한·Organization Graph·Direct Override는 구현하지 않았다.
세부 State·결과·호출 예시는 [Workflow Architecture](workflow-architecture.md#step-72--human-direction-governance)를 따른다.

#### Step 7.2 리팩터링 — 기록과 현재 적격성 (초기 증거 구조 포함)

방향 Governance의 flow.ts를 분석 Provenance, Review 관리, Human 승인 확정, ApprovedDecision 조회로 분리했다.
공유 resolver는 Record Integrity와 Current Eligibility를 명시적으로 구분한다. 기존 Staffing 발급 검증에서
순수 기록 연결 검사를 validateStoredIssuanceRecord()로 추출했으며 validateStoredIssuance()는 이 검사와
현재 Policy·Delegation·Snapshot 검증을 계속 수행한다. 따라서 과거 승인 이력을 조회할 수 있어도 현재
Scope나 Invocation이 허용되는 것은 아니다. Phase B 진입 API는 추가하지 않았다.

Graph Node는 직렬화 전 실제 Application 검증 결과를 전달하고 Governance가 이를 기록한다.
각 Application의 일회용 WeakMap 증거는 그대로 유지하며 범용 Registry를 만들지 않았다.
Revision의 선행 Review / Resolution Binding도 기록 무결성 검증에 포함한다. 현재 승인 시 최신 검증,
Human Receipt의 일회성·Action Binding·Transaction과 중복 발급 차단은 유지한다.

#### Step 7.2 — 현재 신뢰 경계 단순화

초기 WeakMap 기반 검증 증거는 공개 raw Review 등록과 임의의 동일 프로세스 함수 호출까지 방어하려는
전제에서 추가했다. 현재 지원하는 외부 경로는 START를 거치는 Graph 실행과 Human Action Resume이며,
Workflow / Application 코드는 신뢰한다. 별도 결과 증명과 단계별 분석 기록 쓰기를 제거했다.
Decision Evidence·Comparison Reference·Synthesis Output 검증은 기존 Application이 계속 수행한다.

Review 등록은 Governance의 public API에서 제거하고 실제 Synthesis 호출 직후 내부 writer로 연결한다.
최초 Review에 원본 Context와 Proposal을 저장하고 Revision은 원래 분석 Context를 재사용한다.
기존 directionAnalyses와 context 없는 Review는 레거시 읽기 경로로 보존한다. 승인 기록 조회는 계속
Record Integrity만 검사하며 진행 중 Review / 승인 확정 / Authorization은 Current Eligibility를 유지한다.
Human Confirmation·Binding·signed Ledger·Transaction은 대체하지 않는다. 구체적인 경계와 내부 import
예외는 [Workflow Architecture](workflow-architecture.md#step-72--trust-boundary-simplification)를 따른다.
