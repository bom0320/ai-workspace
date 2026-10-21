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
| v3 | Agreement / Conflict — Structured Decision Comparison | Implemented |
| v4 | CEO Governance / AI Organization Orchestration | Planned; LangGraph.js 채택 확정, 통합 미구현 |
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

> Human Goal부터 CEO의 조직 구성·판단, Human 승인, Repository 실행과 Executive Report까지 연결할 수 있는가?

상태: **Planned**. **Workflow Runtime은 LangGraph.js 채택으로 확정**했다.
기존 Codex 기반 Agent Execution Runtime과 v0–v3 Application API / Domain Model을 우선 재사용한다.
LangGraph.js는 아직 설치·통합되지 않았으며 CEO / 전체 workflow도 미구현이다.

기존 Runtime Framework Evaluation checkpoint와 별도 선행 Runtime Spike는 제거한다.
채택 여부를 다시 결정하는 단계 없이 아래 구현 과정의 필요한 시점에 LangGraph.js를 통합하고,
구체 기능의 작동 여부·runtime 안정성과 Harness ownership은 통합 테스트 및 전체 E2E에서 검증한다.
Make vs Adopt 원칙은 [Project Direction](project-direction.md#build-vs-adopt)을 유지한다.

### 목표와 책임

Human Goal → CEO 분석·Staffing / Context / Budget 제안 → Harness Validation → Human Staffing Approval
→ v2 Independent Decisions → v3 Comparison → CEO Synthesis / Decision → Harness Validation
→ Human Governance (Approve / Override / Reject) → Approved Decision → v1 Planning / TaskContract
→ Human Task Approval → v0 Repository Harness / Worker → Human Change Review / Delivery
→ CEO Executive Report → Human의 전체 lifecycle이 목표다.

CEO는 Autonomous Decision Maker, Harness는 Governance & Control Owner, LangGraph.js는 Workflow Runtime,
Codex는 Agent Execution Runtime, Human은 Final Authority다. 상세 도식과 권한 경계는
[Target Architecture](architecture.md#5-target-responsibility-model)를 따른다.
CEO의 자율 판단이 실행 authority 확대를 뜻하지 않으며 각 Human 승인은 독립적이다.

### 내부 구현 순서

1. **CEO Domain & Authority**: CEO 판단 책임과 실행 권한의 구분, Harness 정책·계약 설계.
2. **Intent Analysis & Staffing**: Human Goal / Constraints를 분석해 Staffing / Context / Budget Proposal 생성.
3. **Human Staffing Approval**: Harness proposal validation과 명시적 승인 enforcement 연결.
4. **Context Routing & Coordination**: 승인된 Context projection, 권한·예산·Snapshot 일관성과 독립성 보존.
5. **Independent Decision & Comparison**: 기존 v2 / v3 application을 통합하고 원본 Decision / Evidence 참조 유지.
6. **CEO Synthesis**: Recommendation, Rationale / Evidence, Trade-off, Unresolved Issues / Escalation 표현.
7. **Human Governance**: Approve / Override / Reject의 대상·효과를 검증하고 승인된 Decision만 handoff.
8. **Execution Handoff**: v1 Planning / TaskContract → Human Task Approval → v0 실행 → Review / Delivery 연결.
9. **Executive Reporting**: 판단 근거, 승인·실행·Verification / Evidence와 미해결 사항을 Human에게 보고.
10. **E2E & Evaluation**: Human Goal부터 Executive Report까지 검증하고 CEO 판단 품질과 runtime 안정성을 분리 평가.

LangGraph.js의 state / routing / coordination / interrupt·resume / checkpoint·recovery / lifecycle 통합은
이 순서 중 실제로 필요한 단계에서 진행한다. Graph 설계·checkpoint backend·CEO 호출 방식·Domain
schema는 해당 단계에서 정한다. 새 abstraction이나 조직 역할을 구조적 대칭만을 위해 미리 만들지 않는다.

### Step 2 진행 상태

- **2.1 Implemented**: Intent / Staffing Draft / Proposal과 CEO propose / inspect / escalate의 strict schema.
  Proposal parsing은 Human Approval이나 운영 권한 발급이 아니다.
- **2.2 Implemented**: v1의 Goal 기반 초기 파일 선택·metadata parsing·내부 경로 제외를 공통 capability로
  재사용하고 v2 Snapshot capture/assert 및 commit blob reader로 Staffing Context를 구성한다.
  Tree / package scripts / AGENTS.md / inspected files는 같은 commit 기준이다. Harness exact allowlist,
  regular-file mode, 파일·Context 크기·조사 예산을 검증하며 CEO-facing projection에 내부 절대경로를 추가하지 않는다.
  Planning은 Working Tree 기반 조사와 TaskContract 생성 책임을 유지하고 Staffing은 별도 Application이다.
  실제 임시 Git Repository와 기존 v1–v3 / Governance 회귀 테스트로 검증한다.
- **2.3 Planned**: CEO adapter / Staffing flow가 discovery → Context projection → inspect / propose / escalate를
  연결한다. CEO 실행, round 제한, Staffing Loop / Proposal Finalization은 아직 미구현이다.
  LangGraph 통합과 Human Approval / Scope 발급도 후속 단계다.

### Exit Criteria

- **단일 SynthesisResult가 아닌 Human Goal → 최종 Executive Report의 전체 E2E**가 연결된다.
- Staffing / Context / Budget Proposal을 Harness가 검증하고 Human Staffing Approval을 강제한다.
- LangGraph State 전체를 Specialist에게 전달하지 않고 승인된 Context, 독립 판단과 같은 Snapshot 기준을 유지한다.
- Synthesis / Report의 recommendation과 근거가 원본 AgentDecision / Comparison / Evidence / 관련 Verification에 연결된다.
- 미해결 Conflict / Trade-off / Uncertainty와 Human escalation을 드러내고 Approve / Override / Reject를 구분한다.
- Governance 승인과 Task Approval / Change Review / Apply / Commit / Push를 분리하며 승인 없이 실행 권한을 확대하지 않는다.
- 거절·validation 실패·실행 실패 경로에서 권한이 우회되지 않고 결과와 미해결 상태가 보고된다.
- Interrupt / resume / checkpoint·recovery를 실제 통합에서 검증한다. Workflow checkpoint와 영구 Governance /
  Provenance Record를 구분하고 승인 후 resume / retry에서 Worker / Apply / Commit / Push 중복 위험을 검사한다.
- CEO 판단 품질과 runtime state / routing / 복구·실행 안정성의 검증 결과를 구분한다.
  실제 Agent 실행 관찰과 fake runtime 자동 테스트를 구분하며 품질 우위를 가정하지 않는다.

v4의 큰 목표와 LangGraph.js 채택은 고정한다. 구체적인 Domain 설계와 내부 구현은 위 순서로 진행하며,
현재 CEO 실행, 승인·재개 workflow, Executive Report가 구현되었다고 해석하지 않는다.

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
