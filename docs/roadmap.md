# AI Workspace Roadmap

이 문서는 다음에 무엇을 검증할지 기록한다. North Star와 Make vs Adopt의 판단 기준은
[Project Direction](project-direction.md), 현재 구현과 모델은 [Architecture](architecture.md),
Organization 실행·Handoff·State 소유권의 검토 기준은 [Workflow Architecture](workflow-architecture.md),
실행 방법과 관찰 기록은 [README](../README.md)에 둔다. 범용 Agent Framework 자체를 만드는 계획이
아니라 Human과 AI Coding Agent가 함께 개발하는 ADE의 governance capabilities를 검증하는 계획이다.

| 단계 | 검증 주제 | 상태 |
| --- | --- | --- |
| v0 | Safe Execution | Implemented |
| v1 | Goal-to-Task Planning | 과거 구현. 현재는 Phase B Task Detailing에 통합 |
| v2 | Governed Independent Decision | Implemented |
| v3 | Agreement / Conflict — Structured Decision Comparison | Implemented |
| v4 | CEO Governance / AI Organization Orchestration | 진행 중 — Phase A 승인 및 Phase B Assignment 구현·검증까지 연결. 상위 Graph와 결과 통합은 후속 범위 |
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

독립 v1은 GoalSpec, Working Tree inspection, Fast Path, Codex Planner와 Planning Loop를 사용해
명시적 TaskContract를 생성했다. 현재 독립 진입점과 Fast Path는 제거했고, Planner Loop와
TaskDraft → TaskContract 변환은 Phase B의 Assignment Task Detailing에서 재사용한다.
계획 수립은 승인된 Read Session을 사용하고 실제 수정 실행은 별도 Write Authorization을 거친다.
[책임 경계](architecture.md#v1-planning과-v4-ceo의-application-책임)를 따른다.

## v2 — Governed Independent Decision

다음 v2 및 v3의 독립 CLI 내용은 과거 구현 기록이다. 현재 분석·비교 엔진은 Phase A에서 사용한다.

> 동일 RepositorySnapshot과 Goal, 제한된 Context / authority 아래 Specialist들의 독립 판단을 구조화하고 근거를 확인할 수 있는가?

상태: **Implemented**. 실제 interactive Codex E2E도 확인되었으며 단일 관찰 기록은
[README의 v2 E2E](../README.md#v2-실제-e2e-기록)에만 둔다.

RepositorySnapshot, commit 기반 Context loading, SpecialistDefinition / Authority / Context,
Zod 기반 AgentDecision / EvidenceReference와 Codex Specialist runtime이 구현되었다.
`runDecision()`은 명시적 파일과 Frontend / UX 역할을 구성하고 `collectIndependentDecisions()`로 연결한다.
현재 CLI는 두 Specialist를 순차 실행하며 같은 Goal / commit과 supplied files를 제공한다.

### 확인된 조건과 한계

- Clean Repository에서 Snapshot을 capture하고 해당 commit의 Git blob에서 Context를 읽는다.
- 각 Specialist 실행 전후 Snapshot을 assert하며 다른 Specialist의 Decision을 Context에 넣지 않는다.
- Runtime은 read-only / context-only authority와 제한된 capability 설정으로 실행한다.
- Harness가 Specialist identity를 주입하고 strict JSON schema 및 supplied Context의 Evidence path / line을 검증한다.
- 실패 시 이후 실행을 중단하며 partial result를 반환하지 않는다. 결과는 터미널에 표시한다.
- Same Goal / Same Snapshot / Limited Context / Read-only Authority / Independent Decisions /
  Structured AgentDecision / Validated Evidence / CLI integration이 연결되었다.

v2 use-case 자체는 Comparison / Synthesis를 수행하지 않는다. 현재 Decision CLI는 v3 Comparison까지
연결하며 병렬 실행, 자동 Context selection, discussion, Decision persistence는 없다.
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

상태: **Implemented**. Domain / protocol, isolated Codex Comparator, Reference Validation,
`compareDecisions()`, CLI command composition과 presentation이 구현되었다.

```text
Independent AgentDecision[]
           ↓
ComparisonContext
           ↓
Codex Comparator
           ↓
ComparisonPayload (strict Zod protocol validation)
           ↓
Reference Validation
           ↓
ComparisonResult
├─ Findings: Agreement / Conflict / Trade-off
└─ Gaps: Uncertainty / Limitation / Separate Concern
```

### 구현된 비교 의미

비교 단위는 Decision 전체가 아닌 구체적인 공통 쟁점인 **Concern**이다. Concern은 현재 string이며
Concern → Specialist별 Position → relation으로 표현한다. 하나의 Decision pair에서 여러 Finding이
나올 수 있고, Decision 쌍 전체에 하나의 라벨을 붙이지 않는다.

- **agreement**: 같은 Concern의 Position들이 양립하며 같은 방향을 지지하거나 서로 강화한다.
- **conflict**: 같은 Concern과 관련 조건 아래 Position들을 동시에 받아들일 수 없다.
- **trade-off**: 양쪽 Position이 타당하지만 한쪽 이득이 다른 비용 / risk 증가와 연결되어 우선순위 판단이 필요하다.

단순 문장 차이나 의견 차이만으로 Conflict / Trade-off를 만들지 않도록 prompt에 명시한다.

> Conflict는 단순 textual disagreement가 아니라 evidence-backed disagreement여야 한다.

관계를 확정할 수 없거나 직접 비교할 수 없으면 Finding과 분리된 Gap으로 나타낸다.

- **uncertainty**: 현재 Decision / Evidence만으로 사실이나 관계를 충분히 확정할 수 없다.
- **limitation**: 유효한 입력이지만 제공된 Context / Decision의 범위 때문에 비교 범위가 제한된다.
- **separate-concern**: 같은 Goal 아래 서로 다른 문제를 다뤄 직접적인 비교 관계가 없다.

Sparse output이 의도된 behavior다. 모든 문장을 억지 Finding / Gap으로 만들지 않으며,
의미 있는 관계가 없다면 findings와 gaps가 모두 빈 배열이어도 유효하다.
이 의미는 Domain / protocol과 Comparator prompt에 표현되어 있으나 모델의 분류 정확도가 입증된 것은 아니다.

### Provenance와 검증 범위

ComparisonPosition은 `specialistId / statement / evidenceIndexes`를 가진다.
Evidence 내용을 복제하지 않고 해당 Specialist의 원본 `AgentDecision.evidence[]`를 0-based로 참조한다.

Harness는 Protocol Validation 뒤 다음 reference invariant를 확인한다.

- Finding은 최소 2 Position이며 각 Specialist가 실제 source Decision에 존재하고 중복되지 않는다.
- Evidence index는 해당 Decision 범위 안에 있고 같은 Position에서 중복되지 않는다.
- Evidence index 배열 자체는 비어 있을 수 있다. 존재하지 않는 index는 허용하지 않는다.
- Gap은 최소 1개의 실제 Specialist를 참조하며 중복 ID를 허용하지 않는다.

이는 참조 무결성 검증이다. Statement의 의미적 충실성, relation / rationale의 실제 정확성,
Evidence의 충분성과 판단의 진실성을 증명하지 않는다.

### Comparator boundary와 CLI 연결

Codex Comparator에는 GoalSpec / repositoryCommitSha / AgentDecision[]만 전달한다.
RepositoryRoot, repository files / working tree, shell / web / tools나 외부 Context는 제공하지 않는다.
Target Repository 밖 temporary cwd, read-only sandbox와 capability 비활성화 설정으로 실행하고 cleanup한다.
새 product / engineering decision이나 Evidence를 만들거나 Specialist를 재호출하지 않으며,
winner / final recommendation / Conflict resolution을 생성하지 않도록 제한한다.

`runDecision()`과 `compareDecisions()`는 독립 application capability다.
CLI의 `runDecisionCommand()`가 실제 Goal 객체, Snapshot SHA, 원본 AgentDecision[]을 그대로 전달해
조합한다. Comparison application은 Decision 실행이나 Repository 재조사를 소유하지 않는다.

### 자동 검증과 남은 한계

현재 automated Decision CLI E2E는 explicit / interactive 경로에서
Frontend Specialist → UX Specialist → Comparator → Comparison presentation을 검증한다.
동일 commit SHA, 원본 Decision 전달 구조, Comparator Context의 files 부재,
Specialist 간 Decision isolation, Repository unchanged와 잘못된 Evidence에서 fail-fast를 확인한다.
Command unit test는 Goal / Decision 배열 identity와 두 application의 실패 전파를 검증한다.

**이 automated E2E의 Codex executable은 deterministic fake runtime이며, 실제 모델의 Comparison
품질을 평가하는 benchmark가 아니다.** 수동 Real Codex Comparison 품질 관찰이나 반복 외부 프로젝트
검증을 이번 closeout에 추가하지 않는다. 기존 v2 실제 실행 기록과 구분한다.

- Specialist는 Frontend / UX 두 역할로 고정되며 순차 실행한다.
- Context files는 Human이 명시적으로 선택한다.
- Harness는 protocol 구조와 source reference를 검사하며 의미적 정확성을 증명하지 않는다.
- Comparison은 resolution / synthesis가 아니며 Human governance outcome persistence도 없다.
- 실제 모델의 Comparison 품질에 대한 반복 benchmark는 아직 없다. 이는 v5 Evaluation과 구분한다.

CEO / Coordinator, discussion / consensus loop, automatic resolution, unbounded re-query와
특정 framework/runtime 채택은 v3 완료에 포함하지 않는다.

## v4 — CEO Governance / AI Organization Orchestration

> Human의 해결 방향 승인 이후에도 CEO가 여러 직원의 설계·개발·검증·재작업을 관리하고 Executive Report까지 연결할 수 있는가?

상태: **In progress — 기반 기능 일부 구현, 전체 Workflow 미완성**.
**Workflow Runtime은 LangGraph.js 채택으로 확정**했다.
기존 Codex 기반 Agent Execution Runtime과 v0–v3 Application API / Domain Model을 우선 재사용한다.
LangGraph.js 설치와 Phase A 정책 조회·CEO Staffing·Approval 평가 Graph를 통합했다. CEO Staffing·Approval·Authorization·Claim·동적 Specialist Decision/Comparison은 별도 API로 구현했으며 전체 조직 Graph는 미연결이며 Staffing CLI는 Step 2.5 통합 후 현재 Phase A Graph를 호출한다. 별도 Staffing Setup Graph는 제거했다.

기존 Runtime Framework Evaluation checkpoint와 별도 선행 Runtime Spike는 제거한다.
채택 여부를 다시 결정하는 단계 없이 아래 구현 과정의 필요한 시점에 LangGraph.js를 통합하고,
구체 기능의 작동 여부·runtime 안정성과 Harness ownership은 통합 테스트 및 전체 E2E에서 검증한다.
Make vs Adopt 원칙은 [Project Direction](project-direction.md#build-vs-adopt)을 유지한다.

### 목표와 책임

- **Phase A — Decision & Approval**: 분석 조직을 승인받고 독립 판단·비교·CEO 종합을 거쳐 해결 방향의 Human 승인을 받는다.
- **Phase B — Detailed Design & Execution**: 승인된 방향을 업무로 분해하고 상세 설계·실행·검증·진행 평가·Review / Delivery·보고를 연결한다.

상세 실행 순서와 진입 조건은 [Workflow 실행 계약](workflow-architecture.md#2-organization-workflow-execution-contract)과
[Phase Handoff](workflow-architecture.md#4-phase-a--phase-b-handoff-contract)에 모은다.

CEO는 Autonomous Decision Maker, Harness는 Governance & Control Owner, LangGraph.js는 Workflow Runtime,
Codex는 Agent Execution Runtime, Human은 Final Authority다. 상세 책임과 계약 관계는
[Target Architecture](architecture.md#5-target-responsibility-model)를 따른다. CEO는 Phase B에서도 조직을
관리하지만 스스로 실행 권한을 확대하지 못한다. Staffing 승인·해결 방향 승인·Task 승인·Delivery는
서로 다르며 어느 하나가 다른 단계의 포괄 승인이 되지 않는다.

### 내부 구현 순서

Step 2.3 CEO Adapter / Loop와 R2의 같은 Run 기반 StaffingProposal Finalization / 제한된 Policy Validation을
구현했다. Step 3은 로컬 Human Delegation / 직접 Staffing Approval과 Scope issuance를 연결했다.
Step 4 Authorization / Reservation과 Step 5.1–5.4의 Claim·Decision·Comparison 연결도 구현했다. Step 2.5 재검토에서 Phase A로 Staffing / Approval 순서를 통합하고 Organization 아래 Phase A / Phase B를 주요 실행 경계로 정했다. Step 3에서 일반 Specialist Node를 연결하고 당시 CLI를 부분 실행 대상으로 보존했다. Step 6.2와 7.2에서 CEO Synthesis, Direction Governance 및 동일 프로세스 Human Resume를 추가했다. 현재 Phase A는 단일 흐름으로 실행하고, 공동 승인 Handoff를 받는 Phase B Graph는 Assignment 구현과 검증까지 지원한다.
아래 LangGraph 연결·Step 6 CEO Synthesis 등의 마일스톤과 구현 상태를 유지하되, 구체적인 Graph 분리·연결 형태를 이 순서만으로 확정하지 않는다.

1. **CEO Domain & Authority 기반**: 책임과 실행 권한 구분, Authority schema / Eligibility Evaluation.
   현재 기반 구현은 아래 상태를 따르며 실제 Authorization 완료를 의미하지 않는다.
2. **Intent Analysis & Staffing**: 기존 schema / Snapshot Context Discovery 위에 Step 2.3 CEO Adapter와
   inspect / propose / escalate와 제한된 Staffing Loop를 연결했다. R2에서 Proposal Finalization / 제한된 Policy Validation을 구현했다.
3. **Human Staffing Approval — Implemented**: owner-private signed ledger의 Human 위임·직접 승인 근거를 검증하고 Scope를 발급한다.
   로컬 OS 계정 / CLI 신뢰 경계이며 외부 IAM·분산 audit 보장은 아니다.
4. **Context Routing & Authorization — Implemented**: 최신 권한·Snapshot·Context 검증, Budget Reservation과
   Authorized Specialist Invocation 발급. Step 5.2 Claim과 Step 5.3 실행 Workflow가 사용을 연결한다.
5. **Independent Decision & Comparison — Phase A, 5.1–5.4 Implemented**: 기존 v2 / v3와 원본 Evidence 참조·독립성 유지. 5.5의 별도 검증 단계는 생략하고 후속 통합 검증으로 이관한다.
6. **CEO Synthesis — Implemented (Step 6.2)**: 출처를 참조하는 Direction / Rationale·대안·Trade-off·Risk·Unresolved Issues·Human Review와 Escalation / Failure. 당시 부분 실행 대상에서 검증했고 현재 Phase A가 직접 호출한다.
   추가 분석 요청은 별도 권한·예산 검증을 거치며 현재 v2에 자동 재질의가 있다고 가정하지 않는다.
7. **Human Governance — Implemented (Step 7.2)**: Approve / Request Revision / Reject, 검증 출처 Review 등록, 실제 Human Receipt와 ApprovedDecision 발급. 동일 프로세스 Interrupt / Resume와 최대 두 번 Synthesis Revision을 연결했다. Direct Override와 영속 복구는 미구현이다. Phase B는 별도로 이미 승인된 방향과 활성 ExecutionDelegation의 Handoff를 검증한다.

8–13은 Phase B 마일스톤 번호를 유지한다. 세부 개발 순서와 상태는 아래 표에서 관리한다.

### Phase B 개발 로드맵

Step 8의 입력은 Step 7.2의 `ApprovedDecision`이다. 기존 Governance 조회를 사용하므로 별도 Handoff Validation 마일스톤을 두지 않는다. 기존 Step 9의 Detailed Design & Planning Handoff는 개별 구현 Assignment를 Planner에 전달하는 흐름에 초점을 두었다. 선행 결과에 따라 계획 가능 시점이 달라지는 복수 Work Item을 지원하기 위해 R5에서 Planning Coordination과 Detailed Planning을 함께 다룬다.

| 순서 | 기존 마일스톤 | 단계 | 내용 | 상태 |
| --- | --- | --- | --- | --- |
| 1 | 8 | CEO Work Decomposition | 승인된 방향에서 하나 이상의 Work Item과 선행 의존성을 구성하고 Phase B Graph에서 실행 | Graph Integrated |
| 2 | 8 | Work Decomposition Contract | Input / Output, 제안 내부 Work Item ID, Dependency 검증 | Application Implemented |
| 3 | 9 / R5 | R5 — Phase B Planning Coordination & Detailed Planning | 개별 Detailed Planning 재사용 기반과 명시적 업무 선택. 현재 Phase B 상세 계획은 Assignment 권한 연결까지 보류 | Partially Implemented |
| 4 | 10 | Work Execution Contract | Work Item은 목표·산출물·의존성만 정의. 직접 실행은 차단되며 Assignment 읽기 실행만 연결 | Partially Implemented |
| 5 | 10 | Multi-Specialist Capability & Governed Execution | Specialist가 배정된 개발 업무와 결과를 소유하고 기존 Codex Worktree Runtime을 재사용 | Planned |
| 6 | 11 | Verification & Review | 산출물·Evidence·Acceptance Criteria와 실패 검증 | Planned |
| 7 | 11 | CEO Progress Evaluation | Continue / Rework / Reassign / Escalate / Complete 및 재계획 검토 | Planned |
| 8 | 12 | Human Change Review & Delivery | Human 변경 검토와 Apply / Commit / Push 경계 | Planned |
| 9 | 12 | CEO Executive Report | 수행 결과·판단 근거·검증·미해결 사항 보고 | Planned |
| 10 | 13 | Phase B E2E & Evaluation | Type A — Single Work, Type B — Independent Works, Type C — Dependent Works 및 혼합 계획 검증. CEO 판단 품질과 Runtime 안정성 분리 평가 | Planned |

LangGraph.js의 state / routing / coordination / interrupt·resume / checkpoint·recovery / lifecycle 통합은
이 순서 중 실제로 필요한 단계에서 진행한다. Graph 설계·checkpoint backend·CEO 호출 방식·Domain
schema는 해당 단계에서 정한다. 새 abstraction이나 조직 역할을 구조적 대칭만을 위해 미리 만들지 않는다.

### Phase B Step 5.3 — Multi-Specialist Capability & Governed Execution

**계약 교체 전 구현 기반:** Step 5.2.2 읽기 전용 Specialist 협업, 검증된 선행 결과 Handoff, 공유 동시성 한도와 선행 결과에 따른 Deferred Detailed Planning 재개가 구현되어 있다. Worker Assignment 상세 계획은 초안까지 생성한다. 다음 표는 [Phase B Step 5.3 설계](workflow-architecture.md#phase-b-step-53--multi-specialist-capability--governed-execution)의 구현 순서다. 이 번호는 아래 Phase A 독립 Decision의 Step 5.3과 별개다.

| 순서 | 작업 | 목적 및 완료 기준 | 상태 |
| --- | --- | --- | --- |
| 5.3.1 | Multi-Specialist Assignment Contract | Specialist 책임·접근 상한·선택 범위를 검증하고 Digest에 결합. 5.3.1-R에서 Work Item 실행 유형을 제거하고 직접 실행 차단. 구형 계약은 자동 변환 없이 거부 | Implemented |
| 5.3.2 | Phase-scoped Capability & Authorization | Identity·Authority 분리, Read Reservation·Claim, 제한된 Snapshot Context 조회, Specialist 읽기 실행 및 결과 기록. Write 권한 발급은 5.3.3의 Binding에 의존 | Implemented (Read) |
| 5.3.3 | Specialist Planning & TaskContract Binding | 새 Write Assignment의 승인된 Read Session에서 구현 지시를 상세화하고 TaskContract를 Assignment 및 Snapshot에 결합 | Implemented (Task Prepared) |
| 5.3.4 | Specialist Implementation Runtime | Specialist Execution이 Write Claim을 확보하고 Task Execution이 Worktree·검증·Artifact를 처리해 개별 결과를 저장 | Implemented |
| 5.3.5 | Assignment Result & Execution Coordination | 검증된 Assignment 결과를 Work Item별로 대조해 실행 완료 상태를 집계. 통합과 의존성 해제는 후속 범위 | Implemented |
| 5.3.6.1 | Assignment Integration | 동일 Work Item의 실행 참조와 격리된 통합 Patch를 WorkItemResult로 제공 | Implemented |
| 5.3.6.2 | Work Item Integration | Ledger에 귀속된 선택 Work Item 전체의 결과를 검증하고 FinalResult 생성 | Implemented |
| 5.3.7 | E2E & Phase A Regression Tests | 분석→승인된 구현→통합과 거부·실패 경로, 기존 Phase A 독립 실행 계약 검증 | Planned |

### Development Organization 실행 경로 일원화

독립 Decision·Staffing 진입점과 Phase A의 개발용 부분 실행 대상을 제거했다. 분석과 비교는 승인된
Staffing Scope의 Phase A 전체 흐름에서 재사용한다. 구조화된 계획만 현재 수정 Runtime에 진입하며,
이전 계약과 Work Item Reservation은 Ledger 검증 및 실행 예산에 유지한다.

### Step 1 진행 상태

- **1.3 Implemented — schema only**: ApprovedOperatingScope / ApprovedAssignment / InvokeSpecialistRequest /
  AuthorizedSpecialistInvocation / AuthorityVerdict의 구조 계약. Scope 발급이나 실행 허가를 제공하지 않는다.
- **1.4 Implemented — Eligibility only**: Scope identity / version / lifecycle, Assignment, Context 부분집합,
  사용량 기반 Budget availability를 순수 평가한다. 이 함수 자체는 Scope 발급·예약·실행을 하지 않으며 해당 연결은 Step 3~5.4가 담당한다.

### Step 2 진행 상태

- **2.1 Implemented**: Intent / Staffing Draft / Proposal과 CEO propose / inspect / escalate의 strict schema.
  Proposal parsing은 Human Approval이나 운영 권한 발급이 아니다.
- **2.2 Implemented**: v1의 Goal 기반 초기 파일 선택·metadata parsing·내부 경로 제외를 공통 capability로
  재사용하고 v2 Snapshot capture/assert 및 commit blob reader로 Staffing Context를 구성한다.
  Tree / package scripts / AGENTS.md / inspected files는 같은 commit 기준이다. Harness Context access scopes(신규 입력의 legacy exact allowlist는 거부),
  regular-file mode, 파일·Context 크기·조사 예산을 검증하며 CEO-facing projection에 내부 절대경로를 추가하지 않는다.
  Planning은 Working Tree 기반 조사와 TaskContract 생성 책임을 유지하고 Staffing은 별도 Application이다.
  실제 임시 Git Repository와 기존 v1–v3 / Governance 회귀 테스트로 검증한다.
- **2.3 Implemented**: runStaffing()과 Codex CEO Adapter가 discovery → cloned Context → CEO 호출 →
  inspect / propose / escalate를 연결한다. maxRounds와 호출당 Codex timeout, strict JSON / schema,
  매 호출 전후·최종 Snapshot 검사, Inspection 실패와 안전한 failure reason을 제공한다.
  마지막 Round의 inspect는 로딩·재호출 없이 실패한다. CEO의 StaffingDraft는 내부 중간 산출물이며
  현재 runStaffing()은 R2 검증·최종화를 거친 StaffingProposal을 성공 결과로 반환한다.
  Fake CEO / mock Process 테스트와 실제 Codex 0.163.0 단일 직접 propose(1 Round), Repository 무변경을 확인했다.
  실제 모델의 여러 Round Inspection 품질·반복 benchmark는 검증하지 않았다.
  R2에서 같은 Run의 Proposal Finalization / 제한된 Policy Validation을 연결했다. Staffing Approval / Scope 발급은 Step 3, Authorization은 Step 4, 실행 연결은 Step 5.3–5.4가 담당한다. LangGraph Step 2는 정책 조회·Staffing·Approval 평가를 연결했으며 직접 Human 확인은 Step 2.5에서 콜백 방식으로 통합했고 Step 3에서 Specialist 순서·반복·실패 분기·Comparison 진입을 일반 Node / Edge로 연결했다.

### Capability 통합 리팩토링 상태

- **R1 Implemented**: RepositorySnapshot / SpecialistDefinition / SpecialistAuthority를 공통 contracts로 이동하고
  Snapshot capture/assert 정책은 공통 서비스가 소유한다. Decision 공개 API와 기존 Snapshot flow export는 유지하고 불필요한 decision/model/ 호환 reexport는 제거했다.
- **R2 Implemented**: 단일 runStaffing()은 private CEO Loop를 실행하고 한 번 캡처한
  Goal / Snapshot에서 Proposal을 최종화한다. 등록·중복 배치·안전한 Snapshot Context·크기·예산과 Harness의
  System Policy의 등록 Specialist·접근 범위·limits·maxAgentInvocations를 검사한 뒤 ID를 발급한다. Human Instructions는
  CEO Context와 proposal.goal.constraints에 원문 그대로 보존하며 Rule과 문자열로 연결하지 않는다.
  unverifiedHumanConstraints는 제거했고 어떤 지시도 Rule 성공으로 검증 완료 처리하지 않는다.
  역할·자연어 제약의 의미적 충족, 등록·정책 출처의 진위는 증명하지 않는다.
  Staffing Approval / Scope issuance는 아래 Step 3, Budget Reservation은 Step 4, 실제 Invocation의 Claim·단일/복수 v2 실행 연결은 Step 5.2–5.4에서 구현했다.

R2 검증 규칙은 CEO Inspection State와 분리했다. 최초 Finalization과 승인 시점 재검증은 같은 Snapshot
파일·등록 정보·정책 기반 규칙을 사용한다. CEO Context JSON budget과 Assignment 검증 envelope JSON
budget은 독립적으로 검사하며 기존 파일 수·파일 크기 및 실제 직렬화 크기 제한을 유지한다.

### R4 — Access Policy & Context Discovery — Implemented

- File / Directory PathScope와 단일 contextAccessPolicy.allowedScopes를 추가했다. 파일 목록 노출과 Content
  로딩 전에 같은 경로 경계·안전 규칙을 적용하며 Snapshot / 파일 mode / 민감 경로 / 예산 제한을 유지한다.
- Discovery는 정책이 허용한 후보에서 파일을 선택한다. 정책은 신뢰된 Harness가 공급하며 CEO는 변경하지 못한다.
- System Policy는 접근 상한, Human Delegation은 그 안의 자동 승인 범위를 소유한다. Proposal / Scope에는
  실제 선택된 정확한 contextPaths만 남긴다. 독립 Enforcement Rule 계층은 이후 정책 통합에서 제거했다.
- 신규 운영 입력은 contextAccessPolicy를 필수로 받으며 allowedContextPaths는 빈 배열이어도 거부한다.
  과거 Exact 목록, Scope와 빈 Legacy 목록의 혼합, nested policy 저장 정책은 원형 이력으로만 읽고
  사용을 차단한다. Human 재승인으로 새 버전을 발급하며 기존 위임·Scope는 자동 승계되지 않는다.
  과거 Delegation만 별도 기록 검증에서 원래 Exact / Scope 자동 승인 범위를 유지한다.
- Glob / Deny / 별도 Metadata 권한은 구현하지 않았다. 상위 Workflow 연결은 아래 항목에서 구현했다.

운영 정책 통합: StaffingProposalPolicy / enforcementRules를 제거하고 System Policy의 직접
maxAgentInvocations로 통합했다. runStaffing은 goal / systemPolicy / maxRounds와 Agent 설정만 받는다.
Staffing 최초 검증과 Approval 재검증은 같은 공통 계약을 사용한다. 이전 nested policy가 저장된 경우
제약을 버리지 않고 원문 이력으로 보존하며 사용을 차단한다. 새 형식을 governance setup으로 Human이
명시적으로 재승인해야 하며 정책 version은 증가하고 기존 위임·Scope는 자동 승계되지 않는다.
Ledger 정책 주입은 아래 Staffing → Approval Workflow에서 구현했다. Authorization / Budget Reservation은 아래 Step 4에서 구현했다.

### Staffing → Governance Approval — Implemented

- `workflows/development-organization/phase-a`에서 최신 Human-approved System Policy 조회 → Staffing → Governance Approval을 연결했다.
- 정책 조회 실패·Staffing 실패·Escalation·승인 대기·Human 거절·Approval 거부·Scope 발급 성공을 구분한다.
- CLI `staffing <repository> <goal.json>`은 기존 review / terminal confirmation을 재사용한다. Human 확인 후
  같은 Proposal을 재제출하며 CEO 재실행, Proposal 파일 저장, Agent/Human 대기 중 Ledger lock은 없다.
- 승인 시 기존 최신 정책·위임·Snapshot·binding 검증을 유지한다. 시작 정책 version 일치는 강제하지 않는다.
- 이 Staffing Approval Workflow와 CLI는 Scope 발급에서 종료한다. 별도 Decision Workflow는 Step 5.4에서 Authorization·Claim·v2·v3를 연결했다. LangGraph Step 2.5는 Staffing / Approval Application과 Human 콜백을 직접 연결한다. runStaffingApproval()은 현재 Phase A Graph를 실행하고 Staffing Approval 단계 결과를 반환하는 Adapter이며 CLI도 같은 경로를 사용한다. Registry / 암호학적 Proposal provenance는 미구현이다.

### Step 4 — Scope Validation & Invocation Authorization — Implemented

- 저장 Scope의 source/digest/현재 정책·위임·Snapshot 검증과 순수 Eligibility를 같은 Ledger transaction에서 연결했다.
- Authorized Invocation은 승인 Assignment Objective·현재 등록 Specialist·Commit 파일을 포함한다. 최종 파일/Scope
  재검증 후 Scope 전체 Reservation을 atomic save하고 성공해야 allowed를 반환한다.
- Invocation ID는 Harness attempt handle로 발급한다. 같은 handle의 중복 예약은 거부하며 같은 Context의 새 호출은
  새 예산을 사용한다. 과거 Ledger의 reservations 누락은 읽기 호환으로 보존하고 자동 재작성하지 않는다.

### Step 5 — Independent Decision & Comparison — 5.1–5.4 Implemented

- **5.1 Implemented — Decision 실행 계약**: IndependentDecisionInput / SpecialistContext의 선택적인
  assignmentObjective를 기존 v2에 전달한다. 승인 Assignment의 분석 목적과 Specialist의 기본 역할 objective를 구분하고,
  실행 권한·공급 Context·Human Goal/Constraints를 확대하지 않는다. 기존 v2 호출에서는 생략 가능하다.
- **5.2 Implemented — Reservation Claim**: 저장된 Reservation의 binding·Invocation/Request digest·최신 승인/정책/Snapshot/Context를 검증하고
  같은 Ledger Lock에서 선택적인 claimedAt을 저장한다. 재사용은 거부하며 Budget은 예약 시 소비하는 정책을 유지한다.
- **5.3 Implemented — 단일 실행 연결**: Phase A의 `runAuthorizedSpecialistDecision()`에서 성공한 Claim의 반환 입력을
  기존 `collectIndependentDecisions()`에 연결해 검증된 AgentDecision 한 개를 반환한다.
  실패는 전파하고 Claim을 유지한다. 추가 Authorization·Reservation·자동 재시도·환불은 없다.
- **5.4 Implemented — 복수 실행·Comparison**: 초기 함수형 runSpecialistDecisions는 승인된 동적 Assignment를 사전 검증 후
  순차 Authorization·Step 5.3 실행하며, Decision 두 개 이상이면 기존 v3 Comparison을 연결한다.
  초기 결합 계약은 실패를 preflight / authorization / claim / decision / comparison으로 구분하고 부분 성공을 반환하지 않았다.
  후속 Phase A Refactoring Step 2에서는 Stage 3 완료와 Stage 4 결과를 분리해 비교 실패 시 검증된 Decision을 보존한다.
  Claim 세부 거부 원인은 구분하지 않는다. 기존 Staffing CLI는 승인까지만 실행한다. LangGraph Step 3에서 해당 Orchestrator를 제거하고 동일 실행 계약을 Phase A Node / Edge로 이관했다. 실행 결과 영속화·재시도/복구는 미구현이다.
- **5.5 — 별도 검증 단계 생략 / 후속 통합 검증으로 이관**: 구현 완료로 표시하지 않는다.
  기존 단위·통합 테스트는 signed Ledger / mock TTY / v2·v3 실제 검증 코드와 모의 Codex process로
  순차 실행·실패 단계·Claim 유지·Comparison 참조를 확인한다. 실제 Human+Codex+전체 조직 Graph E2E,
  장기 대기/재개·복구와 모델 판단 품질은 이 테스트로 검증되지 않았다.

### LangGraph Minimal Integration — Step 1·2·2.5·3 Implemented

**Step 2.5 통합 완료:** Organization을 최상위, Phase A / Phase B를 주요 Subgraph로 두는 목표 계층을 결정했다.
별도 Staffing Setup Graph를 제거했고 Step 3에서 명시적으로 선택한 경우 승인 이후 Specialist Decisions / Comparison을 연결했다.
판단 변화와 미결정 과제는 [Workflow Architecture](workflow-architecture.md#next-architecture-review--step-25)를 따른다.

- 기존 LangGraph / Node / Domain Schema를 재사용해 Policy → Staffing → Approval → 결과 수집을 Phase A에 통합했다.
- Organization State는 goal / repositoryPath만 유지한다. Phase A State는 policyLookup / staffingResult /
  approvalResult / specialistDecisionsResult / decisionComparisonResult와 준비 요청·현재 Index·수집 Decision·Comparison 입력/결과를 소유한다. 단계 결과는 최종 Phase A Outcome이나 실행 권한이 아니다.
- 책임 기반 디렉터리 정리 후 Node는 features/ 아래 staffing / governance / decision / comparison의 nodes/에 배치한다.
  결과 정규화 Node는 features/governance/nodes에, Workflow 검증·실행 보조 함수는 features/decision/validation·execution에 둔다.
  파일 위치와 참조만 변경했으며 Stage 결과·Graph 분기·Preflight 중복 검증은 유지한다.
  별도 Setup State / Output Schema와 factory export를 제거했다. 최종 Phase A Output은 해결 방향 승인 구현 시 정의한다.
- ready 정책만 Staffing, proposed만 Approval, approval-required만 Human 확인으로 진행한다.
  콜백 부재는 대기, null은 rejected, 예외는 failed(confirmation)이다. 실제 receipt로 원본 Proposal을 최종화한다.
- Agent / maxRounds / timeoutMs / confirmApproval은 실행 옵션으로 유지하며 State에 함수를 저장하지 않는다.
- 기존 두 Graph의 동일 테스트를 한 벌로 통합하고 분기·State 갱신·실패·거절·정책 재조회 시나리오를 유지한다.
  실제 Staffing·서명 Ledger·fake CEO / mock TTY의 직접/위임 승인, 정책/Repository 변경 거부와 중복 발급 방지를 검증한다.
  실제 Human·Codex·Checkpoint E2E가 검증됐다는 뜻은 아니다.
- **Step 3 Implemented:** approved + specialist-decisions 대상만 Preflight Node로 진행한다. 당시 Collect Node를 사용했고 후속 Refactoring Step 4에서 승인 결과의 직접 분기로 바뀌었다.
  저장 Scope ID / Version을 대조하고 모든 요청을 검증한 뒤 execute-next-specialist 한 번에 한 Assignment를 처리한다.
  Phase A Edge가 반복·실패 종료·단일 Comparison 생략·복수 Comparison 및 완료를 조정한다.
  기존 runSpecialistDecisions 함수·specialist-decisions/ 디렉터리는 제거하고 검증 helper / 단일 Claim·v2 실행만 유지했다.
  Authorization / Claim / v2·v3, 기존 stage / assignmentId·Fail-fast·Budget 소비 계약은 유지한다.
- **Phase A Refactoring Step 2 Implemented:** 모든 Specialist의 검증된 Decision을 Stage 3에서 먼저 완료한다.
  Stage 3 성공은 비어 있지 않은 decisions만, 실패 단계는 preflight / authorization / claim / decision만 표현한다.
  Stage 4는 decisionComparisonResult에 completed / comparison, skipped / insufficient-decisions, failed / reason을 기록한다.
  비교 실패 시 Stage 3 완료와 Decision을 보존하되 전체 Phase A 성공이나 후속 진행으로 취급하지 않는다.
  specialistComparison 중간 채널은 제거했다. 새 invoke는 두 결과와 중간 데이터를 초기화한다. 당시 유지한 Preflight 중복 조회는 후속 Step 3에서 정리했다.
- 기본값과 Staffing Entry Point는 staffing-approval을 선택하므로 기존 CLI는 승인까지만 실행한다.
  실행 대상은 종료 지점 선택이며 Governance를 우회하지 않는다. 별도 Graph·중복 Orchestrator는 없다.
- **Step 3 Tested:** 실제 Graph·Staffing·Governance·Ledger·기존 v2/v3 검증에 fake CEO / mock TTY / 모의 Codex를 조합해
  단일·복수 성공과 Authorization / Claim / Decision / Comparison 실패를 검증한다. CLI의 Specialist 미실행·단일 Scope 발급도 확인한다.
- **Not integrated**: Organization Graph, Phase B Graph, Phase 간 Handoff,
  Direction Governance, Interrupt/Resume·Checkpoint·자동 재시도/복구.
  현재 Graph 재실행은 새 Staffing·Scope를 만들 수 있으며 전체 idempotency / crash recovery를 보장하지 않는다.

### Step 3 — Staffing Approval & Human Delegation — Implemented

- 실제 controlling-terminal 확인으로 설정한 자동 승인 위임을 다른 Goal에 재사용한다. Phase A / Read-only는 System Policy가 통제한다. 범위 내는
  delegated ApprovalRecord, 범위 밖·미설정은 직접 Human 확인으로 분기한다. System Policy 위반, 만료·철회된
  위임, stale confirmation / Proposal·Snapshot 변경은 Scope 발급을 차단한다.
- 서명된 로컬 ledger는 owner UID / 권한·키·기록의 무결성을 확인하고 lock / atomic rename으로 중복 발급을
  막는다. ApprovalRecord와 Proposal digest, 정책 version, 기존 ApprovedOperatingScope를 연결·조회한다.
- CLI는 governance setup / delegate / revoke / approve를 제공한다. 기존 v0–v3 메뉴·Task Approval은 유지한다.
  기존 Proposal JSON operator 경로는 유지하며 Goal 기반 Staffing → Approval은 별도 staffing 명령으로 연결했다.
  Authorization 이후 전체 Goal→조직 Workflow는 미완성이다.
- 로컬 OS 계정과 Harness 자체를 신뢰한다. 동일 계정 공격자·root·clock 조작·backup rollback 방어와 remote
  Human 인증은 미구현이다. 실제 Human 승인 E2E가 아닌 mock TTY + 실제 임시 Repository / signed file 테스트로 검증한다.
- Step 4는 최신 Scope 검증·Budget Reservation·Invocation 입력 발급을, Step 5.2–5.4는 Claim과 실행·Comparison 연결을 구현했다.
  Scope 발급은 자연어 Instructions의 의미적 충족이나 실제 Specialist 호출 허가·예산 확보가 아니다.

Human Delegation 입력은 allowedSpecialistIds / delegatedContextScopes / maxAgentInvocations / expiresAt로
간소화했다. System의 contextAccessPolicy는 Repository 접근 상한이고 위임 Scope는 자동 승인 범위다.
신규 입력과 과거 저장 기록의 Schema를 분리했으며, 과거 Exact / Directory 기록은 변환하지 않고 원래
범위를 검증한다. 무효 위임은 Direct Approval로 대체하지 않는다. 기존 직접 승인 Scope와 위임 승인
Scope의 유효성 기준은 구분해서 유지한다. 신규 교체·철회는 Human 확인과 버전 갱신을 거친다.

### Step 2.3 계약과 다음 연결점

- CEO에는 StaffingContext만 전달하고 내부 state / allowlist / authority는 전달하지 않는다.
  Repository 내용·AGENTS.md는 untrusted data이며 inspect 성공과 propose 결과는 운영 권한이 아니다.
- CEO 호출 수(maxRounds), Inspection 파일 수·Context 크기, Draft의 이후 활동 예산과 Approved Scope
  운영 예산을 구분한다. timeoutMs는 기본 Codex 호출에 적용하며 주입 Agent의 취소·timeout은 해당 adapter 책임이다.
- Harness가 하나의 System Policy로 등록 후보·Context access scopes·Inspection limits·호출 상한을 공급한다. R2는 같은 Run의 원본
  Goal / Snapshot과 Draft를 연결하고 등록 ID·Context·운영 예산을 검증한다.
  업무 적합성과 자유 문자열 Constraints의 의미적 검증은 완료된 것으로 간주하지 않는다.
  Step 3은 proposal.goal.constraints 전체와 제안을 검토하는 직접 승인 접점과 사전 위임 정책 설정을 제공한다.
  ID 발급과 Approval / Authorization은 별도 책임으로 유지한다. CLI staffing은 Staffing → Approval까지 연결하며 전체 조직 UI·취소·재개 Workflow는 아직 없다.

### Exit Criteria

- **Phase A의 해결 방향 승인과 Phase B의 다중 직원 개발·검증·진행 관리 → Executive Report 전체 E2E**가 연결된다.
- Staffing / Context / Budget Proposal을 Harness가 검증하고 Human Staffing Approval을 강제한다.
- Eligibility 통과와 실제 Authorization을 구분하고, Scope issuance·예산 확보·실행 입력 구성 없이
  Specialist를 실행하지 않으며 CEO의 권한 확대·Approval 우회를 차단한다.
- Approved Decision을 CEO의 설계·구현·QA·리뷰 업무 분해로 연결하고, 각 업무의 산출물·Context·권한·의존성을 추적한다.
- 필요한 Repository 실행 업무는 기존 v1 Planner / TaskDraft / TaskContract로 구체화하며 승인된 방향과
  Human Constraints를 보존한다. 모든 분석·설계·리뷰 업무에 TaskDraft를 강제하지 않는다.
- 여러 직원의 실행 결과·Verification / Review·Evidence로 CEO가 진행과 실패를 평가하고
  Continue / Rework / Reassign / Escalate / Complete를 통제한다. 재작업·재배치에도 필요한 재승인을 적용한다.
- 실제 다중 직원 실행과 변경사항 통합을 검증한다. 병렬 Writing Worker나 Worktree 통합·충돌 해결은
  현재 기능으로 가정하지 않고, 선택한 실행·통합 방식과 그 한계를 명시한다.
- LangGraph State 전체를 Specialist에게 전달하지 않는다. Phase A의 비교 단위에서는 같은 Snapshot / Goal과
  독립 판단을 유지하고, Phase B에서는 업무별 승인 Context와 실행 기준 상태·drift를 검증한다.
- Synthesis / Report의 recommendation과 근거가 원본 AgentDecision / Comparison / Evidence / 관련 Verification에 연결된다.
- 미해결 Conflict / Trade-off / Uncertainty와 Human escalation을 드러내고 Approve / Override / Reject를 구분한다.
- Governance 승인과 Task Approval / Change Review / Apply / Commit / Push를 분리하며 승인 없이 실행 권한을 확대하지 않는다.
- 거절·validation 실패·실행 실패 경로에서 권한이 우회되지 않고 결과와 미해결 상태가 보고된다.
- Interrupt / resume / checkpoint·recovery를 실제 통합에서 검증한다. Workflow checkpoint와 영구 Governance /
  Provenance Record를 구분하고 승인 후 resume / retry에서 Worker / Apply / Commit / Push 중복 위험을 검사한다.
- CEO 판단 품질과 runtime state / routing / 복구·실행 안정성의 검증 결과를 구분한다.
  실제 Agent 실행 관찰과 fake runtime 자동 테스트를 구분하며 품질 우위를 가정하지 않는다.

v4의 큰 목표와 LangGraph.js 채택은 고정한다. 구체적인 Domain 설계와 내부 구현은 위 순서로 진행하며,
CEO Staffing 호출·Loop의 구현을 승인·재개 Workflow, Specialist 실행, 다중 직원 구현·통합 또는
Executive Report의 완료로 해석하지 않는다. Phase B의 Assignment 모델·handoff 계약·실행 및 재작업 정책은 후속 설계 대상이다.


Staffing / Governance 경계 정리: Approval과 Authorization은 별도 내부 책임으로 분리했으며 기존 공개 API는
유지한다. 저장된 직접 승인 Scope는 무관한 Delegation 만료·철회에 의존하지 않는다. 위임 승인 Scope는
정확한 최신 활성 위임과 범위를 재확인하며 두 출처 모두 현재 System Policy·Snapshot·digest 연결을 검사한다.
R2 Proposal의 실제 Harness 발급 출처는 여전히 남은 신뢰 경계다. 승인 JSON의 구조·정책 재검증과
Human 승인 기록만으로 발급 출처를 증명하지 않는다. 신뢰된 Finalization digest 기록과 Approval의 동일
발급 결과 확인은 별도 과제로 남긴다. Step 4는 이미 저장된 승인 Scope에서 Invocation을 예약·발급한다.


### Phase A Refactoring Step 3 — 검증 책임 정리 (Implemented)

- Preflight Node의 단일 Governance Scope 조회 결과를 순수 배치 검증 함수에 전달한다.
- Workflow는 요청 구조·Scope / Version·Assignment 소속·배치 중복·누락·순서·Sparse Array와 분리를 담당한다.
- Specialist 중복 금지는 Staffing 정책에 일원화한다. Governance의 저장 Scope 재검증도 같은 정책을 사용한다.
- 당시 Complete Node는 불완전한 배치 방어·완료 관찰을 위해 유지했다. 후속 Step 3.1에서 검사와 완료 결과를 Execute Node에 통합했다.
- Node 선행조건·반환 Schema 검사 및 Invocation별 최신 Authorization / Claim·Evidence / Reference 검증은 유지한다.
- 당시 후속 과제였던 Stage 1 / 2 결과 분리는 Step 4에서 적용했다. 재시도·Checkpoint 복구는 미구현이다.


### Phase A Refactoring Step 3.1 — Specialist 완료 처리 통합 (Implemented)

- 별도 complete-specialist-decisions Node를 제거하고 마지막 Execute 성공 시 Stage 3 결과를 확정한다.
- 실행 전 요청·커서·수집 결과의 일관성을 검사해 불완전한 State로 Authorization을 수행하지 않는다.
- Graph는 반복·실패 종료·completed 이후 Comparison 진입을 담당한다. Stage 3 / 4 결과 Schema는 유지한다.
- 별도 완료 이벤트 대신 마지막 Execute Stream 업데이트로 완료를 관찰한다. Comparison 실패 시 Stage 3을 보존한다.
- Preflight 단일 조회·Governance Authorization / Claim·기존 Staffing CLI 범위와 v2 / v3 검증은 유지한다.


### Phase A Refactoring Step 4 — Staffing / Approval 결과 경계 정리 (Implemented)

- staffingApprovalResult State·통합 Schema·타입과 collect-staffing-approval-result Node를 제거했다.
- Graph는 policyLookup / staffingResult / approvalResult로 분기하고 Entry Point는 기존 외부 반환 형식으로만 변환한다.
- Staffing failed / escalated는 Stage 1에, Confirmation failed / rejected와 승인 대기는 Stage 2에 남는다.
- 직접 Graph State 소비자는 Stage별 결과로 이전한다. 기존 Staffing CLI·Entry Point API / JSON은 유지한다.
- Stage 3 / 4 계약·Preflight 단일 조회·Governance 정책·Human 확인·Scope 발급과 Authorization / Claim은 유지한다.
- 최종 Phase A Outcome·Checkpoint / Resume는 후속 설계 대상이다.


### Step 6.2 — CEO Synthesis Application & Graph Integration (Implemented / Tested)

- runSynthesis()가 기존 Goal·Assignment projection·Decision / Comparison Schema를 재사용한다.
- proposed / escalated / failed와 SourceReference 구조·범위·중요 참조 누락 검증을 구현했다.
- ceo-synthesis 대상에서 Stage 3 완료와 Stage 4 completed / 단일 skipped 이후만 실행한다.
- 단일·복수 Graph 실행, 잘못된 참조·누락·입력 변조·실패 분기·결과 초기화와 기존 대상 미실행을 테스트한다.
- 실제 Governance·Reservation·Claim·v2/v3·Synthesis를 모의 Codex process로 연결한 통합 테스트를 포함한다.
- 실제 Codex 모델의 종합 품질·전체 Human E2E는 미검증이며 Step 7의 방향 승인·기록·Phase B Handoff는 미구현이다.


### Step 6.2 Refactoring — Synthesis Architecture & Validation

- Model / Protocol / CEO / Flow / Validation으로 내부 책임을 분리한다. Graph 실행 경계는 그대로다.
- rationale 항목 목록과 구조화된 Trade-off(benefit / cost / reason), 쟁점별 Propose Coverage를 적용했다.
- Escalation은 관련 출처만 인용해도 가능하며 전체 배치 Coverage를 적용하지 않는다.
- 입력·실행·Timeout·JSON·Schema·Reference·Coverage 실패를 구분하고 민감한 상세는 외부에 노출하지 않는다.
- Risk / Uncertainty의 주제별 묶음은 허용하지만 중요도 자동 판정·의미 검증·Step 7 승인은 미구현이다.


### Step 7.2 — Human Direction Governance

- 검증된 Application 결과의 원본 출처를 claimed Invocation·승인 Scope와 연결하여 Review로 등록한다.
- Graph State / Resume 입력은 인증이 아니다. 실제 TTY Receipt를 Action / Feedback에 묶고 최신 정책·Repository를 승인 전에 다시 확인한다.
- ApprovedDecision은 Review / 승인 Record 참조이며 Phase B의 Task 실행 권한이 아니다.
- Revision은 두 번까지이며 이전 Proposal / Feedback과 기존 분석만 Synthesis에 전달한다. Specialist·Comparison은 재실행하지 않는다.
- human-direction-governance만 메모리 Checkpointer를 사용한다. 기존 Staffing / Specialist / Synthesis 대상과 CLI 종료 지점은 유지한다.
- 실제 Git / signed Ledger / 일회용 Receipt와 mock TTY / Codex transport로 Interrupt / Resume·승인·거부·Revision·변경/재사용 차단을 검증한다.
- 남은 검증: 실제 Human·Codex 전체 Phase A E2E, 영속 Checkpoint / 프로세스 재시작 복구, 전체 Phase A Outcome·Phase B Handoff. 과거 단계의 미구현 표기는 당시 범위의 이력이다.


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

OPA는 authority 규칙의 동적 복잡성이 증가할 때 평가한다. Temporal / Restate 등 추가 durable runtime은
v4 LangGraph.js 통합으로 충족되지 않는 장기 HITL / crash recovery / durable scheduling 등의 요구가
실제로 확인될 때 검토하며 현재 채택하지 않는다.
메모리상 Agent 상태 재개와 전체 workflow durability를 구분하며, domain records 보존을 generic durable
engine 구축으로 확대하지 않는다. Ownership과 시점은 Project Direction을 기준으로 판단한다.
