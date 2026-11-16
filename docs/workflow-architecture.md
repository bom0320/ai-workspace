# Development Organization Workflow Architecture

이 문서는 Development Organization의 실행 계약, Phase 간 Handoff, Graph State / Output 소유권과
Graph 계층을 설명한다. Stage / Node / Application의 설계 판단 기준은
[Workflow Responsibility Boundaries](workflow-responsibility-boundaries.md)에 둔다. Step 2.5에서는 Organization을 최상위 Graph, Phase A / Phase B를 주요
Subgraph로 두는 실행 계층을 결정했다. 현재 구현은 Phase A의 Staffing / Approval과 선택적 Specialist Decisions / Comparison까지 통합했으며
Organization Graph·Phase B·후속 분석과 Handoff의 구체적인 계약을 선행 구현하지 않는다.

문서별 기준은 다음과 같다.

| 문서 | 소유하는 질문 |
| --- | --- |
| [Project Direction](project-direction.md) | 왜 만들며 어떤 Governance / Build vs Adopt 원칙을 지키는가? |
| [Architecture](architecture.md) | 현재 시스템과 Application / Infrastructure의 책임·신뢰 경계는 무엇인가? |
| 이 문서 | Organization을 어떻게 실행하고 Phase 전환·State·Output을 어떻게 전달하는가? |
| [Workflow Responsibility Boundaries](workflow-responsibility-boundaries.md) | Stage·Node·Application을 언제, 어떤 근거로 나누며 정책·신뢰 검증을 어디에 두는가? |
| [Roadmap](roadmap.md) | 무엇을 구현했고 무엇을 다음에 검증하는가? |
| [CLI & Human Interface](cli-and-human-interface.md) | 현재 사람이 어떻게 입력·확인·실행하는가? |

**구현 사실**, **목표 실행 계약**, **권장 검토 방향 / 미결정**을 구별한다. 목표 계약은 기존 설계 판단의
의미적 기준이며 새로운 TypeScript 타입, Zod Schema, Graph 또는 저장 형식을 선언하지 않는다.

## 1. Architecture Context

다음은 전체 목표이며 현재 연결된 E2E가 아니다.

```text
Human Goal / Constraints
          ↓
Development Organization
          ↓
Phase A — Decision & Approval
          ↓
Approved Decision
          ↓
Phase B — Detailed Design & Execution
          ↓
Executive Report → Human
```

CEO는 문제 해석·판단·제안·업무 배치와 진행 평가를 수행한다. Application은 Staffing, Decision,
Comparison, Planning, Execution 등의 기능을 제공하며 Harness Governance는 승인·권한·Scope·Budget·
Context·Evidence·Verification의 규칙과 허용 조건을 소유한다. Human은 최종 승인 권한을 가진다.

LangGraph는 이 기능을 연결하는 실행 순서·조건부 분기·실행 상태를 담당하며, 향후 중단·재개·복구의
실행 메커니즘을 맡는다. 현재 Interrupt / Resume / Checkpoint 기반 복구는 연결하지 않았다.
기존 Codex는 Agent Execution Runtime으로 유지한다.

CLI는 사용자 입력, Human Confirmation, 결과 출력 계층이다. 현재 명령의 실행 범위는 호환성 요구지만,
전체 Workflow의 Graph 계층이나 Subgraph 필요성을 결정하는 유일한 근거로 삼지 않는다.

## 2. Organization Workflow Execution Contract

**목표 계약:** 최상위 Organization은 전체 실행의 진입·Phase 전환·종료를 조정한다.
현재 Organization State만 존재하며 이를 실행하는 Organization Graph는 없다.

| 단계 | Organization의 실행 책임 | Application / Governance 경계 |
| --- | --- | --- |
| Human 입력 | 원본 Goal / Constraints와 대상 Repository를 전달 | 기존 Domain 계약을 재사용하고 Agent가 제약을 임의 변경하지 않음 |
| Phase A | 판단·승인 Workflow 실행과 결과 확인 | Staffing, 판단 근거 검증, 해결 방향 승인 의미는 해당 Application / Governance가 소유 |
| Phase B 진입 | 승인된 방향과 Handoff 검증이 모두 충족된 경우에만 실행 허용 경로로 진행 | State의 승인 표시를 믿지 않고 승인 근거·대상·Repository 기준을 검증 |
| Phase B | 상세 업무 실행·검증·진행 평가 결과를 수집 | 개별 업무의 승인·권한·Scope·Budget·Verification을 별도로 충족 |
| 전체 종료 | 결과·미완료 사유·Human 판단 필요 여부를 구분해 반환 | 업무 완료 및 보고의 근거를 보존하고 실패를 성공으로 바꾸지 않음 |

Organization은 Domain 검증을 Graph의 조건문으로 다시 구현하지 않는다. Graph는 검증 API의 결과에
따라 이동할 뿐이며, 구체적인 Handoff 검증 API와 Organization Result Schema는 아직 정의하지 않았다.

### 종료 의미와 후속 실행

아래는 의미 구분이며 새로운 상태 enum이나 공통 Result Schema가 아니다.

| 결과 의미 | 후속 실행 조건 |
| --- | --- |
| Graph 실행 종료 | 해당 실행 경로가 멈췄다는 사실만 나타냄. 성공·업무 완료·승인을 추론하지 않음 |
| 단계 완료 | 해당 단계의 목적을 달성했다는 뜻. Staffing Scope 발급은 전체 Phase A 완료가 아님 |
| 전체 업무 완료 | 승인된 업무의 실행·검증·Review / Delivery 결과와 최종 보고를 근거로 판단해야 함. 구체적인 완료 계약은 미정 |
| Human 승인 대기 | 해당 승인이 필요한 후속 실행을 시작하지 않음. 현재 콜백 부재의 승인 대기는 durable pause가 아님 |
| Human 거부 | 거부된 대상에 근거한 후속 실행을 시작하지 않음. 거부를 자동 재시도로 바꾸지 않음 |
| CEO Escalation | 질문·불확실성·판단 필요 사항을 보존하고 필요한 Human 판단 이전에 임의 진행하지 않음 |
| 검증 또는 실행 실패 | 실패 단계·원인을 보존하고 해당 결과를 성공으로 취급하지 않음. 재시도·복구 허용 정책은 별도 검토 |
| 명시적 생략 | 실행하지 않은 이유와 후속 진행 가능 여부를 구분. 현재 Stage 4의 단일 비교는 skipped / insufficient-decisions이며 실행 성공과는 다름. 다른 생략 계약은 후속 검토 |

Phase A 승인 대기·거부·Escalation·실패는 Phase B 진입 조건을 충족하지 않는다.
Phase B의 `Complete`라는 CEO 판단 역시 Harness의 검증과 Human Change Review / Delivery를 대신하지 않는다.

## 3. Phase별 책임

Stage별 업무 목적·입력·성공 결과·후속 진행 조건은
[Stage 책임 경계](workflow-responsibility-boundaries.md#2-첫-번째-경계--stage)를 따른다.
이 절은 Phase별 목표 순서와 현재 실제 연결 범위를 설명한다.

### Phase A — Decision & Approval

해결 방향을 판단하고 Human 승인을 받는 것이 목적이다. 목표 순서는 다음과 같다.

```text
Human Goal / Constraints
→ CEO Intent / Staffing / Context / Budget Proposal
→ Harness Validation
→ Human Staffing Approval → Scope issuance
→ Specialist Authorization / Reservation / Claim
→ Independent Decisions (v2)
→ Decision Comparison (v3)
→ CEO Synthesis: Recommendation / Rationale / Evidence / Trade-off / Unresolved Issues
→ Harness Validation
→ Human Direction Governance: Approve / Override / Reject
→ Approved Decision
```

여섯 업무 Stage의 계약과 Result 분리의 판단 이력은
[Phase A Stage 사례](workflow-responsibility-boundaries.md#phase-a의-여섯-업무-목적과-진행-조건)에 모은다.
현재 단일 Decision 경로는 Comparison Application을 호출하지 않는다.
Stage 3 완료 후 Stage 4가 skipped / insufficient-decisions를 명시한다.

Staffing Approval은 분석 조직·Context·호출 예산에 대한 승인이다. Direction Governance는 종합된
해결 방향에 대한 승인이다. 두 승인은 서로 다르며 Staffing Scope만으로 해결 방향이 승인됐다고 보지 않는다.
Override도 변경 대상의 검증과 필요한 승인을 충족해야 하며, CEO의 제안은 승인이나 권한이 아니다.

**현재:** Phase A Graph가 정책 조회 → Staffing → Approval 평가 → 필요한 Human 확인·최종화 → 결과 수집을 실행한다.
`executionTarget: "specialist-decisions"`에서 승인된 결과에만 다음 일반 Node / Edge를 연결한다.

```text
preflight-specialist-decisions
→ execute-next-specialist ← remaining Assignment Edge
→ complete-specialist-decisions (Stage 3 완료)
→ compare-specialist-decisions (Stage 4: completed / skipped / failed)
→ END
```

Preflight Node는 저장 Scope의 ID / Version을 승인 결과와 대조하고 모든 Assignment의 요청을 구성한 뒤
동일 Scope를 입력받는 순수 배치 검증 함수를 재사용한다. Governance Scope 조회는 Preflight당 한 번이며
요청 구조·소속·중복·누락·순서를 검사하고 분리한다. Specialist 중복 금지는 Staffing 정책에 맡긴다.
전체 검증이 끝나기 전에는 예산을 예약하지 않는다. 실행 Node 한 번은
한 요청만 Authorization → Claim → v2 Decision으로 처리한다. 반복·실패 종료·Comparison 진입은 Phase A
조건부 Edge가 소유한다. Invocation은 Node 지역 변수이며 State에 보관하지 않는다.

초기의 단일 Node → 함수형 runSpecialistDecisions() 위임 구조는 내부 실행 제어가 Graph 밖에 남았으므로
제거했다. Preflight 검증과 단일 Invocation 실행 기능은 유지하며 Governance / v2 / v3 정책을 재구현하지 않는다.
새 Subgraph나 Assignment 선택 Agent는 없다. CEO Synthesis, Human Direction Governance와 전체 Phase A
완료는 여전히 미구현이다.

기존 read-only Specialist의 supplied Context, 같은 비교 단위의 Goal / Snapshot, 독립 판단 원칙을 유지한다.
추가 분석·재검토 요청은 필요한 Context·권한·Budget 재검증을 거칠 미래 조직 실행 요구다.
현재 v2에 자동 재질의·토론·쓰기 권한을 추가한 것으로 해석하지 않는다.

### Phase B — Detailed Design & Execution

승인된 방향을 실제 업무로 구체화하고 실행·검증·진행을 관리하는 것이 목적이다. 다음은 목표 흐름이다.

```text
Approved Decision
→ CEO Work Decomposition
→ Assignment Planning: 목적 / 산출물 / 담당자 / 의존성 / 진행 순서
→ Detailed Design / Planning
→ TaskDraft → Harness TaskContract (Repository 실행 계약이 필요한 업무)
→ Human Task Approval (필요한 경우)
→ Authorized Specialist / Worker Execution
→ Verification / Review
→ CEO Progress Evaluation
   ├─ Continue → 다음 승인된 업무
   ├─ Rework → 재작업 → 필요한 재검증·재승인
   ├─ Reassign → 재배치 → 필요한 재검증·재승인
   ├─ Escalate → Human 판단 / 승인 대기
   └─ Complete → Human Change Review / Delivery → Executive Report
```

기존 v1 Planning의 `planTask()`와 v0 Execution의 `executeTask()`를 재사용하는 방향을 유지한다.
Work Decomposition은 어떤 업무를 누구에게 맡길지를, Task Planning은 개별 Repository 업무의 범위·제약·
완료 조건·검증을 구체화한다. 모든 분석·설계·QA·리뷰 Assignment에 TaskContract를 강제하지 않는다.

**현재 한계:** `planTask()`는 goal / repositoryPath / limits / 선택적 planner를 받으며 ApprovedDecision
Handoff를 검증하지 않는다. 기존 Planning은 Working Tree 기반이고 v0 Execution은 격리 worktree에서
제한된 단일 Task를 실행한다. 이 capability의 존재는 Phase B 통합 완료를 뜻하지 않는다.
Phase B Work Assignment 모델, 다중 Worker 실행·병렬성·통합·충돌 처리, 반복·재작업·재배치 정책과
진행 평가·최종 보고의 구체적인 계약은 아직 설계 대상이다. 현재 Phase A StaffingAssignment와 동일 모델로 가정하지 않는다.
Phase B도 같은 기준으로 Application 기능 소유권에서 업무 목적·완료 조건을 식별하고, 그 결과를 관찰해
다음 실행을 제어할 필요가 있는 단위를 Node로 구성한다. 위 목표 흐름의 각 행을 Stage나 Node 하나로
강제하지 않으며 Assignment 모델·Node 수·반복 및 복구 경계를 이번 문서에서 확정하지 않는다.

## 4. Phase A → Phase B Handoff Contract

**목표 계약:** Handoff는 State를 복사하는 작업이 아니라 승인된 방향의 신뢰성과 후속 실행 적합성을
검증하는 경계다. `ApprovedDecision`은 미래 개념이며 현재 타입·ID 규칙·저장 Schema·검증 API가 없다.

| 개념 | 의미 | 대체하지 않는 계약 |
| --- | --- | --- |
| ApprovedOperatingScope | 현재 Governance가 발급하는 분석 조직·Context·호출 예산의 승인 범위 | 해결 방향 승인, Repository 수정 권한 |
| ApprovedDecision / Approved Decision | Human이 승인한 해결 방향을 가리키는 미래 개념 | Staffing Scope, 개별 Task·Delivery 승인 |
| TaskContract | 개별 Repository 실행 작업의 범위·제약·검증 계약 | 조직 전체의 방향 승인 또는 모든 Assignment의 범용 모델 |

### 필요한 의미적 정보와 검증

아래 항목은 정보 요구사항이며 필드명·직렬화 형식이나 새로운 데이터 모델의 명세가 아니다.

| 필요한 정보 | Handoff에서 확인할 의미 |
| --- | --- |
| Original Human Goal / Constraints | 원본 목표·제약이 보존되고 전달 과정에서 임의 완화되지 않았는가? |
| Approved Direction | 실제 Human이 승인한 방향이며 전달된 방향이 승인 대상과 일치하는가? |
| Direction Approval Provenance | 누가 무엇을 승인했는지 신뢰할 근거가 있는가? State 플래그·CEO 주장만으로 승인으로 보지 않음 |
| Decision / Comparison / Synthesis Evidence | 종합 판단과 승인 결과를 원본 판단·비교·Evidence까지 추적할 수 있는가? |
| Repository Baseline | 판단·승인에 사용한 기준 상태와 후속 업무의 Repository 상태가 유효하게 연결되는가? |

후속 작업이 승인된 방향·범위·원본 Constraints와 일치하는지도 검증해야 한다. 근거 부족·불일치·검증
실패가 있거나 해결 방향이 승인 대기·거부·Escalation 상태라면 Phase B를 실행하지 않는다.
Evidence 연결의 검증이 자연어 recommendation의 의미적 정확성을 증명하는 것은 아니다.

Phase A의 고정 Snapshot에서 Phase B의 변경 가능한 실행 기준으로 넘어가는 방법, 허용할 drift,
재검토·재승인이 필요한 조건은 후속 설계·검증 대상이다. 항상 최초 commit을 유지한다고 가정하거나
현재 Phase A Scope 검증을 그대로 Phase B 권한 정책으로 확장하지 않는다.

Phase A 방향 승인은 Phase B의 Task Approval, Authorization, Repository 수정 또는 Apply / Commit / Push
권한을 대신하지 않는다. 승인 Provenance의 기록 방식·유효성·조회 API와 실행 시점의 재검증도 아직 확정하지 않았다.

## 5. Graph State & Output Ownership

### 목표 소유권

다음 표는 책임 구분이며 각 Graph나 Output Schema가 구현됐다는 뜻이 아니다.

| Graph | 내부 State 책임 | 상위에 공개할 Output의 의미 |
| --- | --- | --- |
| Development Organization | Human Goal, Repository, Phase 간 전달·전체 진행 제어 | Organization Result: 전체 결과와 종료 의미 |
| Phase A | Staffing, Decisions, Comparison, Synthesis, Direction Governance | Phase A Outcome: 방향 승인 또는 명시적인 미완료 결과 |
| Phase B | Work Plan, Assignments, Execution, Verification, Progress | Phase B Outcome: 업무 결과·검증·진행 평가·보고에 필요한 결과 |

각 Subgraph는 내부 실행 State를 소유하고, 상위에는 전환·결과 판단에 필요한 데이터만 공개한다.
Organization State에 모든 Phase의 중간 데이터나 중복 상태 플래그를 합치지 않는다.
`phaseAOutcome`, `phaseBOutcome`, Organization Result 등은 제안 명칭·의미다.
현재 코드 필드나 확정된 타입·Schema로 해석하지 않는다.

### 현재 Phase A StateSchema와 Stage별 결과

| 코드 | 현재 실제 필드 / 관계 |
| --- | --- |
| [developmentOrganizationState](../src/workflows/development-organization/state.ts) | `goal`, `repositoryPath`만 정의. 전체 진행 상태·Organization Graph는 없음 |
| [phaseAState](../src/workflows/development-organization/phase-a/state.ts) | 공통 입력과 `policyLookup`, `staffingResult`, `approvalResult`, `staffingApprovalResult`, `specialistDecisionsResult`, `decisionComparisonResult`와 준비된 요청·현재 Index·수집 Decision·Comparison 입력/결과를 소유 |
| 같은 파일의 `staffingApprovalResultSchema` | Staffing 실패·Escalation과 Approval 결과를 함께 표현하는 결합 계약. 최종 Phase A Outcome이 아님 |
| 같은 파일의 `specialistDecisionsResult` | Stage 3: completed와 비어 있지 않은 AgentDecision[] 또는 failed / preflight·authorization·claim·decision / reason·assignmentId? |
| 같은 파일의 `decisionComparisonResult` | Stage 4: completed / comparison, skipped / insufficient-decisions, failed / reason. 기존 Comparison Schema 재사용 |

이전 staffingSetupState / staffingSetupOutput의 내부 상태·결과 Schema를 Phase A에 통합했다.
현재 Graph.invoke는 Phase A State를 반환하며 별도 Output StateSchema는 없다. 향후 Organization에 공개할
최종 Phase A Output은 해결 방향 승인이 구현될 때 확정한다. 현재 중간 State 전체를 미래 부모의 공개 계약으로 고정하지 않는다.

현재 Staffing / Approval 결합 경로는 collect-staffing-approval-result Node에서 결과를 수집하며,
`proposed`만을 이 결합 경로의 성공 결과로 반환하지 않는다.
`staffingApprovalResult`는 approved / approval-required / denied / rejected / failed / escalated를 구분한다.
승인 대기는 원본 Proposal과 Binding을 담은 request를 보존한다. 이 결과는 Staffing 승인 단계만 표현하며
Phase A 전체 성공이나 Phase B 진입 승인이 아니다.

Stage 3은 전체 준비 요청의 Decision 생성·검증이 끝나고 비어 있지 않은 묶음일 때만 완료한다.
Preflight·Authorization·Claim·Decision 실패는 즉시 종료하고 이후 Invocation / Stage 4를 실행하지 않는다.
완료되지 않은 묶음은 성공으로 노출하지 않으며 중간 collectedDecisions를 비운다.

Stage 4는 Stage 3의 완료 결과를 입력받는다. 단일 Decision이면 기존 compareDecisions()를 호출하지 않고
skipped / insufficient-decisions를 기록한다. 복수 Decision은 기존 v3 Comparison / Reference 검증을 거쳐
completed / comparison 또는 failed / reason을 기록한다. Comparison 실패 시 Stage 3의 completed와 검증된
Decision 및 collectedDecisions를 보존하며 Stage 3을 실패로 바꾸지 않는다.
이 경우 전체 성공으로 판단하거나 향후 Synthesis / 승인으로 진행해서는 안 된다. 현재 Graph는 Stage 4의
모든 결과에서 END로 종료하며 최종 Phase A Outcome이나 후속 Node는 아직 없다.

preparedSpecialistRequests와 currentSpecialistIndex는 전체 Preflight를 통과한 요청과 다음 실행 위치,
collectedDecisions는 Stage 3의 중간 수집 데이터다. specialistComparisonContext는 저장 Scope에서 확인한
원본 Goal / SHA를 Stage 4에 전달한다. 기존 specialistComparison 채널은 Stage 4 결과와 중복되어 제거했다.
새 invoke의 정책 조회 Node는 Stage 3·4 결과와 준비 요청·Index·수집 Decision·Comparison Context를 모두
초기화하므로 이전 성공 결과나 Claim을 재사용하지 않는다.

**공개 State 계약 변경:** specialistDecisionsResult에서 comparison 필드와 comparison 실패 단계를 제거했다.
Comparison 소비자는 decisionComparisonResult를 확인해야 한다. 기존 SpecialistDecisionsWorkflowResult 이름은
Stage 3 의미로 유지하고 DecisionComparisonStageResult 타입을 공개한다. runStaffingApproval과 Staffing CLI의
승인 전용 범위·반환 계약은 유지한다. Domain Schema와 Governance 정책은 변경하지 않았다.
분리 이유와 이전 계약은 [결합 계약과 분리 이유](workflow-responsibility-boundaries.md#현재-결합-계약과-분리-이유)에 남긴다.

Agent, timeout, maxRounds, Human 콜백, executionTarget은 실행 옵션이며 Graph 생성 시 Node closure로 전달한다.
일회용 HumanConfirmation은 Node의 지역 변수에서 소비하고 State에 저장·직렬화하지 않는다.
State는 실행 데이터이며 Governance Ledger의 신뢰 기록을 대체하지 않는다. Schema 통과나 State의 승인
표시만으로 호출 권한을 부여하지 않으며 현재 Specialist 경로도 저장 Scope·Reservation·Claim을 재검증한다.
향후 Checkpoint로 State를 저장·복원하더라도 Ledger의 승인·권한 기록을 대체하지 않으며 재개 시점의
필요한 권한 검증을 생략하는 근거가 되지 않는다. 현재 Checkpoint / Resume 기반 복구는 미구현이다.

## 6. Graph / Subgraph Boundary Principles

Node의 실행·분기·실패·신뢰/재실행 판단 기준과 9개 실제 Node의 검토 근거는
[Graph Node 책임 경계](workflow-responsibility-boundaries.md#3-두-번째-경계--graph-node)에 모았다.
현재 Graph는 Assignment 반복·실패 종료·Comparison 진입을 제어하며 Application 내부 Loop는 이전하지 않는다.

Approval / Authorization / Claim / Evidence / Comparison의 호출·정책 소유권과 Preflight 중복 검토는
[Application과 Workflow 경계](workflow-responsibility-boundaries.md#4-세-번째-경계--application과-workflow)를 따른다.
현재 구조를 유지·조정할 판단과 실제 구현 사실을 구분한다.

### Graph / Subgraph 분리 기준

분리의 근거는 다음 실행 요구다. 폴더 이름이나 업무 이름만으로 Subgraph를 만들지 않는다.

- 독립적인 실행 목적과 완료 조건이 있는가?
- 내부 State와 공개 Output의 차이가 의미 있는가?
- 여러 단계의 조건부 분기나 반복 실행을 별도로 조정해야 하는가?
- 중단·재개 및 실패 복구의 독립적인 경계가 필요한가?
- 실제 실행 단위의 재사용 요구가 존재하는가?

다음은 **결정된 상위 계층과 향후 검토할 내부 책임 구조**다. Organization / Phase B Graph는 아직 없으며
내부 항목들이 모두 Subgraph라는 뜻도 아니다. 현재 Phase A는 Staffing / Approval과 선택적 Specialist Node를 실행한다.

```text
DevelopmentOrganizationGraph
├── PhaseAGraph
│   ├── Policy / Staffing / Approval Nodes
│   ├── SpecialistAnalysis
│   ├── CEOSynthesis
│   └── HumanDirectionGovernance
└── PhaseBGraph
    ├── CEOWorkDecomposition
    ├── AssignmentExecution
    ├── CEOProgressEvaluation
    ├── ChangeReviewAndDelivery
    └── ExecutiveReport
```

| 실행 단위 | 현재 판단 / 검토 방향 |
| --- | --- |
| Phase A / Phase B | 전체 Lifecycle의 주요 Subgraph 경계로 결정. 현재 Phase A만 실행 가능하며 Organization / Phase B Graph는 아직 없음 |
| Staffing / Approval | 별도 Staffing Setup Graph를 제거하고 Phase A Node 실행 과정으로 통합. CLI 호환성만을 위해 별도 Graph를 유지하지 않음 |
| Specialist Analysis | 현재 일반 Node와 Phase A Edge로 Preflight·반복·실패·Comparison을 제어. 함수형 Orchestrator와 별도 Subgraph는 없음 |
| Assignment Execution | Phase B의 업무 모델·권한·검증·반복 및 복구 요구가 정해질 때 검토할 Subgraph 후보 |
| CEO Synthesis / Human Direction Governance / Progress Evaluation | 우선 일반 Node와 조건부 Edge 관점에서 검토. 독립 실행 요구가 생길 때 분리 여부 판단 |
| Change Review / Delivery | 승인·Repository 부작용·부분 완료·복구 경계를 근거로 추후 결정 |
| Executive Report | 목표 책임만 정의. 별도 Subgraph나 저장 Schema는 확정하지 않음 |

기존 Staffing CLI 범위를 보존해야 한다는 요구와 Subgraph가 최선이라는 판단은 구분한다.
CLI는 필요한 실행 단위를 호출할 수 있어야 하지만 그 사실만으로 독립 Subgraph를 정당화하지 않는다.
Graph별 디렉터리 응집성과 런타임 Subgraph 도입도 다른 판단이다. 현재는 Application 기능 소유권에 맞춰
features/ 아래 staffing / governance / decision / comparison 영역의 nodes/에 실제 Node를 배치한다.
Workflow 전용 Preflight 검증과 단일 실행 보조 함수는 features/decision/validation, features/decision/execution에 둔다.
entrypoints/는 외부 Graph 호출 인터페이스, features/는 기능별 내부 실행 모듈을 분류한다.
features/는 새 Application 계층이 아니며 이번 이동은 실행 구조가 아닌 디렉터리 분류 기준의 정리다.
당시 디렉터리 정리에서는 실행 계약을 유지했다. 후속 Step 2에서 Stage 3 / 4의 결과·완료 순서를 분리했으며 후속 Step 3에서 Preflight 조회를 단일화했다. Specialist별 순서·반복·실패·Comparison 진입은 Phase A Edge가 소유한다.
이 배치가 Stage별 디렉터리나 Application 폴더 복제를 요구하지 않으며 Assignment Execution 등의 분리는 후속 실행 요구로 검토한다.

## 7. Current Implementation vs Target Architecture

구현 상태의 근거는 공개 API·Graph / CLI 호출·StateSchema·관련 테스트 코드다. 문서의 Planned 표기나
CLI 노출 여부만으로 Application 구현 여부를 판정하지 않는다.

| 항목 | 코드에서 확인한 현재 상태 | 전체 Workflow 통합 수준 |
| --- | --- | --- |
| LangGraph Runtime / Phase A Graph | [createPhaseAGraph](../src/workflows/development-organization/phase-a/graph.ts) 구현 | 정책 → Staffing → Approval → 결과 수집 → 실행 대상·승인에 따른 선택적 Specialist 실행 |
| Staffing / Approval Nodes | [결과 수집](../src/workflows/development-organization/phase-a/features/governance/nodes/collect-staffing-approval-result.ts) 등 5개 Node 구현 | 기존 Application 호출·최소 선행조건·State 업데이트. 별도 Setup Graph는 없음 |
| Staffing CLI | [runStaffingApproval](../src/workflows/development-organization/phase-a/entrypoints/run-staffing-approval.ts)이 staffing-approval 실행 대상을 명시하고 staffingApprovalResult 반환 | 기존 입력·Human 확인·출력 유지, Specialist 실행 없음 |
| Staffing / Governance | [Staffing API](../src/application/staffing/index.ts), [Governance API](../src/application/governance/index.ts) 구현 | Proposal Finalization, 직접/위임 승인·Scope 발급, Authorization / Reservation / 일회 Claim 제공 |
| Specialist Decisions / Comparison | [Phase A Graph](../src/workflows/development-organization/phase-a/graph.ts)의 일반 Specialist Node / Edge가 기존 Governance·v2 / v3를 조합 | 순차 반복·Fail-fast는 Edge가 제어. 단일 Decision은 Comparison 생략; Staffing CLI에서는 미실행 |
| Planning / Execution | [v1 Planning](../src/application/planning/index.ts), [v0 Execution](../src/application/execution/index.ts) 구현 | 독립 CLI / Application capability. ApprovedDecision 입력·Phase B 실행 조정은 없음 |

현재 Stage 3 실패 단계는 preflight / authorization / claim / decision이며 미완료 묶음을 성공으로
반환하지 않는다. Stage 4 실패는 별도 decisionComparisonResult에 기록한다. Claim 세부 거부 원인은 구분하지
않는다. Budget은 예약 시 소비하고 실행 실패 후 Claim 자동 취소·재시도·환불은 제공하지 않는다.
Stage 3 / 4 결과를 전체 Organization의 성공·실패 Schema로 확장하지 않는다.

### 현재 구현에서 남은 책임 정리 대상

| 현재 구현 사실 | 권장 개선 방향 / 검토 이유 |
| --- | --- |
| staffingApprovalResult가 Staffing 실패·Escalation과 Approval 결과를 결합 | Stage 1의 Proposal 생성과 Stage 2의 승인·Scope 발급 결과를 구분해 완료·대기·실패를 관찰 |

위 항목은 **미적용 개선 방향**이다. 현재 Result 타입·Schema·Edge를 바꾼 것으로 해석하지 않는다.

**Planned / Not Integrated:** 전체 Organization Graph, CEO Synthesis 이후의 Phase A 연결,
Human Direction Governance, ApprovedDecision Handoff, Phase B Graph, Assignment 실행 조정,
Executive Report, Interrupt / Resume와 Checkpoint 기반 복구. 새로운 모델·API나 디렉터리를 이 목록만으로 만들지 않는다.

테스트 근거는 [Phase A Graph 테스트](../src/workflows/development-organization/phase-a/tests/graph.test.ts),
[Phase A 통합 테스트](../src/workflows/development-organization/phase-a/tests/phase-a.integration.test.ts)와
[CLI 테스트](../src/cli/commands/staffing/staffing.test.ts)에 있다. Node / Edge 분기·State 갱신,
승인 대기·거부·위조 확인·정책/Repository 변경 검증과 CLI 실행 범위의 시나리오가 존재한다.
이것은 실제 Human·Codex·전체 조직 E2E 또는 중단·재개·복구 검증의 완료를 의미하지 않는다.

### 실행 대상과 Staffing CLI 경계

`createPhaseAGraph({ executionTarget })`의 기본값은 staffing-approval이다. specialist-decisions를 명시해도
Staffing 승인이 approved가 아니면 종료한다. runStaffingApproval()은 staffing-approval을 명시적으로 고정한다.
이 옵션은 종료 지점 선택이며 승인·Scope 조회·Authorization / Claim을 건너뛰는 권한 옵션이 아니다.
실행 대상과 콜백은 State에 저장하지 않으며, 별도 Graph나 중복 Staffing Orchestrator를 만들지 않았다.
향후 Organization은 분석 실행 대상을 명시해야 한다. 전체 Organization CLI는 아직 구현하지 않았다.

통합 테스트는 실제 Staffing / Governance / signed Ledger·기존 v2/v3 검증에 fake CEO / mock TTY와
모의 Codex process를 사용해 단일·복수 실행, Authorization / Claim / Decision / Comparison 실패와 중단을 확인한다.
Staffing CLI는 명시적 승인 전용 대상과 Specialist 프로세스·예약 미실행을 검증한다.
이 검증은 새 Handoff나 미래 Organization / Phase B Graph의 실행 검증 기록이 아니다.

## 8. Architectural Invariants

1. Human이 최종 승인 권한을 가진다. CEO의 제안이나 Graph 라우팅은 승인이 아니다.
2. Harness가 Authority / Scope / Budget / Context / Evidence / Verification과 승인 허용 규칙을 소유한다. LangGraph는 이를 대신 판단하지 않는다.
3. Specialist에게는 승인·검증된 Context만 전달한다. 전체 Graph State를 전달하거나 현재 read-only 권한을 확대하지 않는다.
4. Staffing Approval, Direction Governance, Task Approval, Human Change Review / Delivery Approval은 대상·효과가 다르다. 앞선 승인은 후속 승인·실행 권한을 대체하지 않는다.
5. 기존 Application을 재사용하며 Workflow에서 Domain 판단·검증·권한 로직을 중복 구현하지 않는다.
6. Checkpoint는 실행 재개용 상태다. Governance Ledger의 신뢰된 승인·권한 기록이나 장기 Evidence 보존을 대신하지 않는다.
7. Resume / Retry / Replay의 중복 실행·Scope 발급·Worker·Apply / Commit / Push 부작용을 별도로 설계·검증한다. 현재 exactly-once / crash recovery를 보장하지 않는다.
8. 원본 Goal / Constraints와 Repository 기준의 연결을 보존한다. 기준 상태가 바뀌면 실행 적합성을 다시 검증한다.
9. Schema / Evidence reference 검증과 판단의 의미적 타당성을 구분한다. 실행 완료는 Agent 품질이나 다중 Agent 우위의 증명이 아니다.
10. Stage는 Application의 기능 소유권에 기반한 업무 목적·완료 조건이며 Node / 파일 / Application과 1:1로 강제하지 않는다.
11. Graph는 Workflow 수준의 실행·반복·분기를, Application은 내부 업무 판단·검증과 필요한 내부 Loop를 소유한다.
12. Stage의 성공과 다음 Stage 진입 허용, Graph 종료를 구분한다. 실패·대기·거부·Escalation·생략을 성공으로 바꾸지 않는다.

## 9. 설계 판단의 발전과 현재 유효 범위

기존 구현 이력은 [Architecture의 Runtime Foundation](architecture.md#97-langgraph-minimal-integration-step-1--runtime-foundation)과
[Step 2.5 실행 경계 기록](architecture.md#910-step-25--workflow-boundary--structure)에 보존한다.

| 당시 문제와 판단 | 유지할 사실 / 원칙 | 이번 검토에서 구별할 점 |
| --- | --- | --- |
| 함수형 Staffing Approval과 Graph가 같은 순서를 소유 | 중복 Orchestration을 제거하고 기존 Application으로 검증 위임 | Graph 도입이 Domain 정책 재구현이나 CLI 역할 확장을 뜻하지 않음 |
| Phase A 확장이 기존 Staffing CLI까지 실행시킬 위험 | 과거에는 CLI 독립 실행과 내부 State 분리를 위해 Setup Subgraph를 구성 | Setup 제거 후 Step 3에서 같은 Graph의 실행 대상을 구분. 기본값·CLI는 승인까지만 실행하고 분석은 명시적으로 선택 |
| Subgraph 내부 데이터가 부모로 퍼질 위험 | 내부 State / 공개 Output 분리 원칙 유지 | 현재 Staffing 중간 State는 Phase A 소유. 최종 Phase A Output은 Direction Governance 구현 시 정의 |
| 제한된 Phase A를 먼저 구현 | Staffing·Governance·Decision capability와 안전성 테스트 유지 | Organization / Phase A / Phase B 실행 계층을 기준으로 통합. 미래 Graph와 Outcome Schema는 선행 구현하지 않음 |

CLI의 기존 실행 범위를 전체 Graph 구조의 제약으로 고정하던 판단에서, Organization Lifecycle과 Phase별 목적을
주요 실행 경계로 삼는 판단으로 변경했다. Staffing / Approval의 Domain 정책·Human 확인·Ledger 안전성은 유지한다.
현재 통합은 Phase A 전체 기능이나 Phase 간 Handoff 구현의 완료를 뜻하지 않는다.

기능 소유권·Stage 목적을 먼저 정하는 판단, 함수와 Node의 1:1 대응을 피하는 이유, Specialist 반복의 Graph
이관, Decision / Comparison 분리와 Preflight 재검증의 발전 과정은
[설계 판단과 트레이드오프](workflow-responsibility-boundaries.md#5-설계-판단의-발전과-트레이드오프)에 보존한다.
각 결정의 당시 가정·문제·대안·유지 계약·후속 과제를 해당 문서에서 관리한다.

## Next Architecture Review — Step 2.5

기존 질문은 다음처럼 결론과 후속 과제를 구분한다.

1. **Setup 독립성 — 결정:** 별도 Staffing Setup Graph를 제거하고 Phase A에 통합했다.
2. **State / Output — 현재 통합:** Staffing 중간 결과는 Phase A가 소유한다. 최종 Phase A Outcome과 Organization 공개 Output은 아직 미정이다.
3. **Specialist Analysis — Step 3 통합:** Preflight·단일 실행·Comparison·완료를 일반 Node로 두고 반복·실패 분기를 Phase A Edge로 이관했다. 기존 함수형 Orchestrator와 specialist-decisions/ 디렉터리는 제거했다.
4. **중복 Orchestration — 현재 경계:** Graph가 순서·반복·분기를 단독 소유한다. 검증 helper와 단일 Claim / v2 실행 함수만 재사용하고 Governance와 Application의 판단 규칙은 유지한다.
5. **Phase 연결 — 목표 계층 결정 / 구현 미정:** Organization Graph 아래 Phase A / Phase B를 주요 Subgraph로 둔다. Handoff 저장·검증 API와 실제 Graph 연결은 후속 과제다.
6. **CLI / 폴더 제약 — Step 3 구현:** CLI 호환성만으로 Subgraph를 만들지 않는다. 같은 Graph의 staffing-approval / specialist-decisions 실행 대상 구분으로 현재 CLI 범위를 보존한다.
7. **Stage 계약 — 일부 구현 / 후속 검토:** Step 2에서 Stage 3 / 4 결과·완료 시점을 분리하고 단일 비교의 skipped를 명시했다. Staffing / Approval 결과 분리와 최종 Phase A Outcome은 후속 과제다.
8. **Preflight 책임 — Step 3 적용:** 단일 Governance 조회와 순수 배치 검증으로 분리했다. Complete Node는 Stage 3 완료 관찰과 대상 수·커서·Decision 수 불일치 방어를 위해 유지했다. 실행 시점 Authorization / Claim은 생략하지 않는다.
9. **Node / 배치 구조 — 판단 기준 확정, 배치 미정:** Application 함수당 Node나 Stage당 완료 Node를 강제하지 않는다. stages/ 디렉터리·미래 Node 수·새 Subgraph·재시도/복구 정책은 결정하지 않는다.

Step 3은 승인된 Staffing 단계 결과와 명시적 Specialist 실행 대상에만 후속 분석을 허용한다.
Phase B 진입은 여전히 승인된 해결 방향과 Handoff 검증을 별도로 요구한다.
