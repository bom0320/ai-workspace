# Development Organization Workflow Architecture

이 문서는 Development Organization의 실행 계약, Phase 간 Handoff, Graph State / Output 소유권과
Graph 계층을 설명한다. Stage / Node / Application의 설계 판단 기준은
[Workflow Responsibility Boundaries](workflow-responsibility-boundaries.md)에 둔다. Step 2.5에서는 Organization을 최상위 Graph, Phase A / Phase B를 주요
Subgraph로 두는 실행 계층을 결정했다. 현재 구현은 Phase A의 Staffing / Approval, Specialist Decisions / Comparison, CEO Synthesis와 선택적 Human Direction Governance까지 통합했으며
Phase B Graph는 CEO Work Decomposition과 명시적으로 선택된 Work Item의 Detailed Planning을 실행한다. Organization Graph와 Phase 간 자동 연결은 아직 없다.

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
실행 메커니즘을 맡는다. Step 7.2는 Human Direction Review에 한정한 메모리 Checkpoint / Interrupt / Resume를 연결했다. 프로세스 재시작 복구는 지원하지 않는다.
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
| Phase B 진입 | Phase A 완료의 `ApprovedDecision`과 `ExecutionDelegation`을 Ledger에서 검증한 뒤 업무 분해로 전달 | Governance는 승인 기록의 무결성을 검증하고 Planning / Execution은 실제 사용 시점의 적격성을 검증 |
| Phase B | 상세 업무 실행·검증·진행 평가 결과를 수집 | 개별 업무의 승인·권한·Scope·Budget·Verification을 별도로 충족 |
| 전체 종료 | 결과·미완료 사유·Human 판단 필요 여부를 구분해 반환 | 업무 완료 및 보고의 근거를 보존하고 실패를 성공으로 바꾸지 않음 |

Organization은 Domain 검증을 Graph의 조건문으로 다시 구현하지 않는다. Graph는 검증 API의 결과에
따라 이동한다. Phase 연결 인터페이스와 Organization Result Schema는 아직 정의하지 않았다.

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
→ Load System Policy and delegated assignment constraints
→ CEO Intent / Staffing / Context / Budget Proposal
→ Harness Staffing Authorization → Scope issuance when delegated
→ Specialist Authorization / Reservation / Claim
→ Independent Decisions (v2)
→ Decision Comparison (v3)
→ CEO Analysis Assessment (sufficient / refinement-required / blocked)
  → 필요 시 승인 범위 검증 · 증분 Staffing · 선택적 Specialist 분석 → Comparison
→ CEO Synthesis: Recommendation / Rationale / Evidence / Trade-off / Unresolved Issues
→ Harness Validation
→ Human Direction Governance: Approve / Request Revision / Reject
→ Approved Decision
```

여섯 업무 Stage의 계약과 Result 분리의 판단 이력은
[Phase A Stage 사례](workflow-responsibility-boundaries.md#phase-a의-여섯-업무-목적과-진행-조건)에 모은다.
현재 단일 Decision 경로는 Comparison Application을 호출하지 않는다.
Stage 3 완료 후 Stage 4가 skipped / insufficient-decisions를 명시한다.

Staffing Approval은 분석 조직·Context·호출 예산에 대한 승인이다. Direction Governance는 종합된
해결 방향에 대한 승인이다. 두 승인은 서로 다르며 Staffing Scope만으로 해결 방향이 승인됐다고 보지 않는다.
Override도 변경 대상의 검증과 필요한 승인을 충족해야 하며, CEO의 제안은 승인이나 권한이 아니다.

**현재:** Phase A Graph의 기본 경로는 정책 조회 → CEO Staffing → 사전 위임 기반 Staffing Authorization을 실행한다. 유효한 위임이 없거나 제안이 위임 범위를 벗어나면 `approval-required`에서 종료한다. 만료·철회·정책 버전 불일치는 `denied`로 종료한다. 명시적인 `runStaffingApproval()` CLI 진입점은 기존 직접 확인 분기를 사용한다.

CEO의 Repository 탐색에는 System Policy를 사용하고, Specialist 배정에는 별도의 위임 제약을 전달한다. 위임의 Specialist ID, File / Directory Context Scope, 호출 예산은 계획용 정보다. Governance는 Scope 발급 시 최신 정책과 위임, Proposal 및 Snapshot을 다시 검증한다.

Synthesis 대상은 Comparison 완료 또는 단일 Decision의 정상 생략 뒤에 Assessment를 실행한다. Assessment의 출처 참조가 유효하고 결과가 충분할 때 Synthesis로 진행한다. 추가 분석 요청은 현재 대표 Decision과 연결된 Assignment만 재사용하거나, 변경분 Proposal을 같은 Staffing 승인 절차에 제출한다. 기존 Scope는 불변이다. 한 배치의 변경이 여러 Scope를 필요로 하면 선택된 변경만 담은 새 Scope 하나로 평가한다.

각 Scope의 `budget.maxAgentInvocations`는 해당 Scope의 예약 상한이다. 최초 Proposal의 `budget.maxTotalAnalysisInvocations`는 최초·후속 Scope의 누적 예약 상한으로 원본 승인에 바인딩한다. System Policy의 `analysis.maxTotalAnalysisInvocations` 안에서만 요청할 수 있으며, 자동 승인은 Human Delegation의 `maxTotalAnalysisInvocations` 상한도 충족해야 한다. 새 필드가 없는 최초 Proposal은 기존 호출 예산을 누적 상한으로 사용한다. 별도 전체 예산이 없는 위임에는 기존 호출 상한을 적용한다. 후속 Scope 발급은 최초 승인 한도를 늘리거나 초기화하지 않는다.

최초 Scope의 반복 상한은 승인 당시 System Policy의 `analysis.maxRefinementRounds`로 확정한다. 필드가 없는 기록은 기존 2회를 유지한다. Ledger는 누적 예약과 반복 상한을 따로 검증한다. 실패하거나 Claim되지 않은 호출도 예약 예산을 사용한다. 개별 호출은 기존 Authorization, Reservation, Claim을 거친다. 완료된 배치의 성공 결과만 Specialist별 대표 Decision을 갱신한다. Direction Review는 최종 분석의 성공한 Claim 출처를 Scope별로 확인하고, Human Revision은 같은 분석과 출처를 재사용한다.
`executionTarget: "specialist-decisions"`에서 승인된 결과에만 다음 일반 Node / Edge를 연결한다.

```text
preflight-specialist-decisions
→ execute-next-specialist ← remaining Assignment Edge
  (마지막 실행 성공 시 Stage 3 완료)
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
새 Subgraph나 Assignment 선택 Agent는 없다. Step 6.2에서 명시적 ceo-synthesis 대상에 Stage 5를 연결했다.
Step 7.2에서 Human Direction Governance를 연결했다. 전체 Phase A Outcome / Organization / Phase B 연결은 아직 없다.

기존 read-only Specialist의 supplied Context, 같은 비교 단위의 Goal / Snapshot, 독립 판단 원칙을 유지한다.
추가 분석·재검토 요청은 필요한 Context·권한·Budget 재검증을 거칠 미래 조직 실행 요구다.
현재 v2에 자동 재질의·토론·쓰기 권한을 추가한 것으로 해석하지 않는다.

### Phase B — Detailed Design & Execution

승인된 방향을 실제 업무로 구체화하고 실행·검증·진행을 관리한다. 다음은 목표 흐름이며 구현 상태는
[Phase B 개발 로드맵](roadmap.md#phase-b-개발-로드맵)을 따른다.

```text
Phase A Completed → Governance Handoff 검증 → CEO Work Decomposition
→ Planning Coordination → 계획 가능한 Work Item의 Detailed Planning
→ Work Execution Contract → 승인·권한 확인 → Specialist / Worker Execution
→ Verification & Review → CEO Progress Evaluation
   ├─ Continue → 다음 계획 또는 실행 가능 업무
   ├─ Rework → 업무 재계획 및 필요한 재검증·재승인
   ├─ Reassign → 담당 재배치 및 필요한 재검증·재승인
   ├─ Escalate → Human 판단 대기
   └─ Complete → Human Change Review & Delivery → CEO Executive Report
```

선행 업무 결과가 필요한 경우 해당 결과의 검증 이후 후속 업무의 상세 계획을 확정한다. 각 행은 실행 목적을 표현하며 함수·Node·Subgraph 배치는 후속 설계에서 결정한다.

#### CEO Work Decomposition

CEO는 Human이 승인한 방향을 독립적으로 완료·검증할 수 있는 하나 이상의 Work Item으로 구성하고 선행 의존성을 정의한다. 별도 업무로 분리할 판단 기준과 DAG 검증 책임은 [설계 판단 근거](workflow-responsibility-boundaries.md#phase-b-설계-판단과-책임)를 따른다.

| 구분 | Phase A CEO Staffing (Implemented) | Phase B CEO Work Decomposition (Graph Integrated) |
| --- | --- | --- |
| 목적 | 해결 방향을 판단할 분석 조직 구성 | 승인된 방향을 실현할 업무 구성 |
| 입력 | Original Human Goal / Constraints와 분석 Context | `ApprovedDecision`에서 복원된 승인 방향과 근거 |
| 출력 | `StaffingAssignment`를 포함한 StaffingProposal | Work Item과 선행 의존성으로 구성한 Work Decomposition |
| 초점 | Specialist·분석 Context·Budget | 업무 독립성·기대 산출물·의존성 |
| 실행 권한 | 제안 이후 별도 Governance 승인·Authorization 필요 | 분해 결과와 별도로 업무별 승인·Authorization 필요 |

| 분해 형태 | 예시 | Work Item과 실행 관계 |
| --- | --- | --- |
| Type A — Single Work | 작은 작업 입력 UI의 접근성과 피드백 개선 | 독립적인 완료·검증 단위 1개. 여러 Specialist가 함께 참여할 수 있다. |
| Type B — Independent Works | 서로 독립적인 관리자 통계 화면과 알림 설정 개선 | 선행 의존성 없는 복수 업무. 권한과 변경 범위가 허용하면 병렬 실행을 고려한다. |
| Type C — Dependent Works | Backend API 계약 변경 → Frontend 연동 → 통합 검증 | 복수 업무의 선행 관계를 기록한다. 선행 산출물에 따라 후속 상세 계획이 달라질 수 있다. |

독립 업무와 의존 업무는 한 계획에 섞일 수 있다. 세 형태는 Work Item 수와 의존 관계에서 파악하므로 별도 Workflow 모드나 분류용 `type` 필드가 필요하지 않다.

**현재 Application 계약:** `runWorkDecomposition({ approvedDecisionId })`은 Governance에서 승인 기록을 복원한 뒤 Context-only Codex CEO를 한 번 호출한다. CEO에게는 원본 Goal / Constraints, 승인된 Proposal, Decisions / Comparison, Snapshot, 승인 출처 ID만 전달한다. 결과는 `proposed`, `escalated`, `failed`로 구분한다. Work Item ID는 제안 내부의 의존성 참조이며 `suggestedRoles`는 역할 제안이다. Harness는 출력 구조와 의존성을 검증한다. 구조 검증은 업무 분해의 의미적 타당성을 보증하지 않는다. [Work Decomposition Application](../src/application/work-decomposition/index.ts)

**현재 Graph 계약:** Graph 입력은 `{ handoff: PhaseBHandoff }`다. Work Decomposition Node는 승인 쌍을 Ledger에서 다시 검증한 뒤 승인 방향과 위임 상한을 Application에 전달한다. 검증 실패 시 `handoffResult`에 거부를 기록하고 종료한다. Planning 실행 옵션이 없거나 결과가 `failed` 또는 `escalated`이면 END로 종료한다. [Phase B Graph](../src/workflows/development-organization/phase-b/graph.ts)

#### Work Item / Specialist Assignment / TaskContract

| 개념 | 책임 |
| --- | --- |
| Work Item | CEO가 정의하는 업무의 목적, 기대 산출물, 선행 의존성. 구현된 Schema는 제안 내부 ID, objective, deliverable, dependsOn과 선택적 rationale·suggestedRoles를 정의한다. rationale은 업무를 독립 실행 단위로 분리한 근거이며, 작성 시 비어 있지 않아야 한다. 복수 업무 제안에서 CEO는 각 업무의 책임·산출물·검증 경계를 근거로 분리 이유를 설명한다. 선행 관계는 dependsOn에 기록한다. |
| Specialist Assignment | 특정 Work Item에서 Specialist가 담당할 역할과 작업. Work Item 수와 Specialist 수는 독립적이다. Phase B의 계획 준비는 Phase A에서 승인된 Specialist 출처를 재사용하며, 기존 `StaffingAssignment`는 Phase A 분석 배치 계약이다. |
| `TaskContract` | Repository 변경의 수정 가능·금지 범위, Constraints, Acceptance Criteria, Verification을 구체화하는 기존 v1/v0 계약. 필요한 Human Task Approval과 Execution의 입력이다. |

CEO Work Decomposition의 종료점은 업무와 의존성의 제안이다. 계약 생성은 개별 Planning의 책임이며 실행 권한은 Governance 경계에서 확인한다. 읽기 전용 분석·설계·검토는 업무에 맞는 Context와 권한 계약을 사용한다. Repository 변경은 `TaskContract`와 필요한 Human Task Approval을 거친다. 테스트 명령처럼 Shell을 사용하는 업무는 변경 여부와 관계없이 별도의 실행 권한 검증이 필요하다.

#### R5 — Phase B Planning Coordination & Detailed Planning

- **Single Planning:** Work Item 하나의 목적·산출물을 실제 Repository Context에서 구체화하고, Repository 변경 업무라면 `TaskContract`를 구성한다.
- **Multi-Work Planning:** Work Item의 선행 관계와 상세 계획에 필요한 정보를 확인한다. 필요한 설계 정보가 충분하면 선행 업무 실행 전에도 상세 계획을 수립할 수 있다.
- **공통 Detailed Planning:** 개별 Work Item의 계획 기능을 두 경우에 재사용한다. 모든 `TaskContract`를 최초 Planning 시점에 일괄 생성할 필요는 없다.

**R5.1 / R5.2 구현 범위:** 기존 v1 `planTask({ goal, repositoryPath, limits, planner? })` 호출과 Fast Path를 유지한다. Phase B Planning 기능은 `executeWorkItemPlanning({ phaseB: { approvedDecisionId, workItem }, repositoryPath, limits, planner? })`로 선택한 Repository 변경 업무 하나를 계획한다. 입력은 기존 Work Item Schema를 재사용하며 Goal과 승인 Proposal은 Governance에서 복원한다. 형식 오류, 승인 복원 실패, Repository 불일치는 Planning 시작 전에 호출 오류로 전달된다.

Phase B에서는 승인 기록이 가리키는 Repository와 요청 경로를 확인한 뒤 기존 Working Tree 조사와 Planning Application을 실행한다. Phase B Planning 기능은 원본 Goal / Constraints와 승인 방향의 텍스트, Work Item의 Objective·Deliverable만 상세 계획 입력으로 구성한다. Planning Application은 일반화된 `detail`과 실제 Repository Context로 계획을 수립하며, 승인 참조와 Work Item 계약은 Workflow 기능에서 소유한다. Phase B Fast Path는 조사된 단일 Markdown/TXT 파일의 전체 Repository 상대 경로를 기준으로 Work Item Objective와 Deliverable이 지원되는 오타 교정 표현과 일치하는지 확인한다. 승인 방향도 해당 파일의 오타 교정을 명시해야 하며, 원본 Goal은 같은 교정 작업 또는 지원되는 문서 개선 목표여야 한다. 원본 Constraints는 호환되는 것으로 정의된 표현만 허용한다. 복합 요구사항이나 해석이 필요한 입력은 Planning Loop로 전달한다. TaskDraft의 최종화에는 기존 ID 발급과 원본 Human Goal Constraints 병합을 사용한다. 이 경로는 Work Item의 실행 자격이나 선행 업무 완료를 판단하지 않는다. 현재 Repository와 승인 Snapshot의 commit 차이에 대한 정책은 후속 과제다.

**R5.3 / R5.4 구현 범위:** `createPhaseBGraph({ planning: { selectWorkItemIds, detailed: { repositoryPath, limits, planner? } } })`의 선택 콜백은 `proposed`에서만 호출한다. 콜백이 명시한 Repository 변경 업무 ID가 제안에 모두 있는지 확인한 뒤, 첫 선택 순서로 중복 없이 `executeWorkItemPlanning()`을 호출한다. 알 수 없는 ID는 상세 계획 시작 전에 입력 오류로 전달한다. Graph는 업무별 `PlanningResult`를 기록하고, 결과가 `failed`이거나 선택이 소진되면 종료한다. Detailed Planning 호출에서 예외가 발생하면 Graph 호출도 거부된다.

선행 관계는 기존 `dependsOn`으로 표현한다. 별도 의존성 분류 결과나 Ready / Waiting 상태를 추가하지 않는다. 의존 업무도 설계 정보가 충분하면 상세 계획을 수립할 수 있으며, 계획 완료는 실행·검증 완료와 구분한다. 검증된 선행 산출물로 Planning을 재개하는 계약은 후속 범위다.

**Step 4.3 실행 Routing.** 현재 `workType`은 단일 Work Item이 한 번 사용할 실행 경로를 선택한다.
기본 Codex 분해 결과는 유형을 명시해야 한다. 기존 유형 미지정 Work Item은 유효한 수정 TaskContract가
등록된 경우에만 실행한다.

Read-only 계획은 기존 Work Item의 목적·산출물과 승인 Goal을 재사용한다. Planner를 호출하거나
빈 TaskContract를 생성하지 않는다. Ledger의 Read-only Execution Source는 유형 표식과 Work Item 전체를
포함하는 Decomposition Binding, 승인 Decision 참조, Snapshot에 묶인다. 읽기 요청 경로와 제한 시간은
최종 Governance 승인에서 검증하고 기존 예약의 요청·실행 Digest에 기록한다. 기존 `taskDigest` 형태는
그대로 읽고 검증한다. 이전 빈 TaskContract 기반 Read-only 출처로 새 실행을 시작할 수 없으며, 새 형식으로
등록하더라도 기존 Work Item 예약은 유지된다.

두 실행 경로 모두 실제 Git 호출의 안전 설정과 Snapshot을 확인한다. `post-checkout` 검사만
Worktree 경로에 적용한다. Read-only는 승인된 Git blob만
기존 Specialist의 격리된 임시 cwd에 전달하며 Worktree를 만들지 않는다. 단일 Context는 64 KiB로
제한하고 Codex read-only sandbox와 도구 비활성화 설정을 유지한다. 변경 업무는 기존 Codex Worktree,
Scope와 Verification을 사용한다. 분석 Evidence 검증은 출처와 참조 범위를 확인한다. 실행 준비 실패와
실행 결과는 각각 Work Item ID로 기록한다. 하나의 업무에서 여러 실행을 조정하는 기능은 후속 범위다.

**Phase B Planning Coordination.** `planning.selectWorkItemIds`로 Work Item을 한 번 선택한다.
선택 노드의 출력은 `selectedWorkItemIds`다. 초기화 노드는 빈 선택을 포함해 새 Planning 실행의
`planningResults`를 한 번 초기화하고, Detailed Planning 단독 경로에만 초기 대기열을 구성한다.
상세 계획 반복은 초기화 노드를 다시 거치지 않으며 기존 결과에 추가한다.
`planning.assignment`만 설정하면 별도 노드가 검증된 Assignment Plan을 준비하고 종료한다.
`planning.detailed`만 설정하면 기존 상세 계획과 Execution Source 등록을 유지하고,
`execution.workItem`이 설정된 경우 기존 단일 실행 경로를 사용한다.

두 기능을 함께 설정하면 Assignment 준비가 먼저 진행된다. 준비가 성공하고 저장된 Plan을 재검증할 수
있으면 선행 Work Item과 선행 Assignment가 없는 단일 Worker의 수정 업무만 Detailed Planning 초안을
작성한다. 선행 결과가 필요하거나 단일 Worker가 지정되지 않은 수정 업무는
`deferredDetailedPlanningIds`로 기록한다. Read-only 업무는 초안 대상에서 제외한다.
이 경로는 기존 단일 실행용 Execution Source를 발급하지 않는다. 협업 실행을 별도로 요청한 경우 Specialist 실행으로 이어질 수 있다. 기존 단일 실행 옵션인 `execution.workItem`이 함께 전달되면
`executionPreparationResult`에 차단 상태를 기록한다.

읽기 전용 업무에는 Specialist를 배치할 수 있다. 수정 업무에는 Specialist와 승인된
`codex-worktree` Worker를 함께 배치할 수 있다. Assignment 의존성은 같은 Work Item 안으로 제한하고
Work Item 간 선행 관계는 기존 `WorkItem.dependsOn`을 사용한다. 미지정 유형은 기존 단일 실행 경로를 유지한다.
저장된 Plan Digest와 호환되도록 새 Assignment의 식별자는 `id`에 유지한다.

Governance는 등록·조회에서 승인 출처, 등록된 Decomposition, Snapshot과 Executor를 독립적으로 검증한다.
Plan ID는 기존처럼 Decomposition·Staffing Binding, Snapshot, Assignment 목록의 Digest다. 준비 경로는
Plan을 기록하고 종료한다. 실제 CEO Assignment Adapter는 후속 범위다.

**Step 5.2.2 Specialist 협업 실행.** `execution.assignment.contexts`에 Assignment ID별
`readPaths`와 `timeoutMs`를 제공하면 준비된 Plan을 기준으로 Specialist를 순차 실행한다. 실행 시 저장된
Plan과 현재 Phase B 위임을 확인하고, 위임 예산을 기존 Work Item 예약과 합산한다. 별도 Assignment 예약을
기록한 뒤 Claim 시 권한·선행 결과를 다시 검증한다. 후속 Specialist는 검증된 선행 판단을 Repository 파일과
구분된 참고 자료로 받는다. 결과는 Snapshot 및 승인 입력에 연결된 예약에 저장하며 Graph에는 식별자와 Digest를
기록한다. 예약 이후 실패하면 예약에 연결된 실패 단계와 Digest를 보존한다. 검증된 성공 결과만 후속 입력으로 사용한다. Context가 누락된 Assignment, Worker 및 그 결과를
기다리는 Assignment는 대기한다. Work Item 간 선행 관계는 Work Item 완료 계약이 생길 때까지 보수적으로 대기한다.
Coordination의 최상위 상태는 실패, 거부, 대기, 완료 순으로 집계하며 개별 Assignment 결과와 대기 목록도 제공한다. 실행 기록은 기존 예약 예산을 계속 차지한다. Assignment 기반 Worker 수정 및 Worktree 통합은 후속 범위다.

## 4. Phase A → Phase B Handoff Contract

정상 Phase A의 `human-direction-governance` 대상은 현재 정책에 맞는 CEO 위임 제안과 한 번의 Human 동시 승인을 요구한다. 방향과 정확한 위임 범위를 승인하고 Ledger 검증을 통과하면 `phaseACompletion`에 `{ status: "completed", decision, executionDelegation }`을 기록한다. 인간은 정책 범위에서 제안을 수정할 수 있으며 실제 수정된 Grant가 확인 바인딩에 들어간다. Revision은 Synthesis와 위임 제안을 다시 생성한다. 제안 실패 시 분석과 Synthesis 결과는 보존한다.

Phase B는 같은 구조의 `PhaseBHandoff`를 받고 분해 전에 `verifyExecutionHandoff()`를 호출한다. 검증은 Ledger의 실제 Human 승인, 해당 Review의 제안, Decision과 활성 위임의 연결, 현재 정책·만료 시점 및 승인된 깨끗한 Repository Snapshot을 확인한다. 분해와 상세 계획에는 승인 방향과 위임 상한을 전달한다. 업무별 Authorization, Reservation, Claim은 별도로 실행 적격성을 검증한다. [Governance Handoff 검증](../src/application/governance/approval/features/execution-delegation/flow/verify-execution-handoff.ts)

독립 `independent-direction-review` 대상과 Governance API는 방향 단독 승인과 사후 위임을 지원한다. 이 경로의 승인 기록은 기존 출처와 효력을 유지한다. 이전 Review에 검증된 CEO 제안이 없거나 위임이 사후 승인으로 발급된 경우 정상 Handoff의 근거로 사용되지 않는다. 변경 반영은 Human Change Review & Delivery의 Apply / Commit / Push 경계에서 처리한다.

**Step 10.2-1 — Execution Delegation 발급:** 먼저 `configureExecutionSystemPolicy()`로 Repository별 실행 상한을 제시하고 별도의 일회용 Human Confirmation으로 정책 버전을 등록한다. 정책과 위임은 읽기·쓰기 각각에 File / Directory Scope를 지정하며, 명시된 검증 명령과 실행 횟수·시간 상한을 포함한다. R4의 PathScope 구조와 경로 경계 기반 포함 규칙을 사용한다. 기존 `readPaths`·`writePaths` 기록은 저장 형태를 보존하며 정확한 File Scope로 해석한다. Directory 권한에는 명시적 승인이 필요하다. 초기 명령 식별자는 고정 argv의 `git diff --check`만 지원한다. 승인된 실행 정책이 없으면 위임을 발급할 수 없다.

Phase A의 `approve` Action에 실행 위임을 포함하면 승인 바인딩이 정책 버전과 정확한 위임 범위·만료 시점을 포함한다. 확인 콜백은 이 Action을 인간에게 보여 주고 같은 바인딩의 Receipt를 받아야 한다. Governance는 확정 직전에 현재 정책을 다시 확인하고 Direction Resolution, `ApprovedDecision`, `ExecutionDelegation`을 한 번에 저장한다. 방향 단독 승인은 기존 형태를 유지한다.

Human Direction Review 대상에서는 Synthesis가 제안한 방향과 검증된 분석을 바탕으로 CEO가 예상 실행 상한을 별도로 제안한다. 제안은 읽기·쓰기 PathScope, Shell 명령, 횟수·시간 예산, 유효기간, 근거와 분석 출처를 포함하며 Synthesis digest와 정책 버전에 연결된다. 정책이 없거나 제안이 유효하지 않으면 Review는 방향만 표시한다. 제안은 검토 자료로 저장되며, 인간이 선택하거나 수정한 실제 Grant는 만료 시각을 포함한 별도 `executionDelegation` Action으로 제출하고 확인한다. 방향 수정 후에는 새 Synthesis에 대해 다시 제안한다.

방향 단독 승인 후 필요한 경우 `approveExecutionDelegation({ approvedDecisionId, repositoryPath, grant })`로 별도 위임 확인 요청을 준비한다. 새 Receipt를 함께 전달하면 기존 Decision·Repository Snapshot·실행 정책과 정확한 위임 내용에 바인딩된 사후 발급 기록만 저장한다. 같은 Decision에는 위임 하나만 발급하며, 만료나 철회 후 재위임은 별도 정책 결정으로 남긴다.

`getExecutionDelegation(approvedDecisionId)`은 Decision과 Human 확인 출처에 연결된 기록을 복원한다. 정책 교체는 이전 버전의 위임을 `superseded`로, Human 확인을 거친 정책 비활성화는 기존 위임을 `revoked`로 처리한다. 발급 기록은 보존하며 새 정책은 기존 위임을 활성화하지 않는다. 만료 시점은 상태와 별도로 확인한다.

**Step 10.2-2 — Execution Authorization:** Phase B의 내부 분해·계획 Node는 Handoff 검증 후 성공 결과를 Governance Ledger에 등록한다. 분해 바인딩은 ApprovedDecision과 Work Item 전체를, `executionSourceId`는 분해·지역 Work Item ID·TaskContract digest·승인 Snapshot을 연결한다. 계획 전후에 승인된 깨끗한 Snapshot을 확인한다. 완료된 계획은 Ledger의 최신 공동 승인, 위임과 정책의 상한 및 TaskContract의 적합성을 같은 트랜잭션에서 검증한 뒤 출처를 저장한다. 실패 시 완료된 계획과 차단 사유를 보존하고 후속 계획을 중단한다. 독립 Direction-only 계획은 기존 출처 등록 경로를 유지한다. 내부 등록 함수는 Governance 공개 API에 포함하지 않는다.

실행 권한 검증은 Ledger에서 Human Direction Approval과 위임, 현재 정책 및 계획 출처를 복원한다. 요청 경로는 정책과 위임의 Scope 안에 있고 승인 commit이 추적하는 일반 파일이어야 한다. 작업 트리에서 Symlink를 통해 해석되는 경로는 거부한다. 선행 업무가 없는 Work Item만 지원하며 쓰기 경로와 Verification 명령은 각각 `task.allowedPaths`와 `task.verification`에서 가져온다.

즉시 실행용 `authorizeExecutionForRun(request)`는 동일 Ledger 트랜잭션에서 요청과 예산을 검사하고 `reservedAt`과 `claimedAt`을 함께 기록한 후 `authorized`와 검증된 실행 입력을 반환한다. 성공 상태는 실행 권한의 사용 확정을 뜻한다. 검증된 Runtime이 확보되면 Worker 시작 직전에 이 API를 호출하고, 반환된 기준 commit과 권한 범위를 사용한다. 과거 예약과 Digest는 변경 없이 보존하며, 미사용 예약도 예산과 동일 Work Item 중복 제한에 포함한다. 과거 Permit을 소비하는 분리 API는 제거되었다. 프로세스가 저장 후 종료되면 Worker가 시작되지 않아도 사용 기록은 보존된다. Ledger 잠금은 Git 상태나 Worker 프로세스를 잠그지 않는다.

**현재 Step 4 실행 경계:** Phase B의 `execution.workItem`은 실행할 Work Item ID, 읽기 경로, 시간 제한을 지정한다. 읽기 전용 Eligibility 이후 Execution Application은 런타임 지원을 검사하고, 지원하는 경우에만 `authorizeExecutionForRun()`을 호출한다. 저장된 Permit을 입력받는 Worker 진입점은 제공하지 않는다. Phase B는 준비 판정과 실제 `workerExecutionResult`를 구분한다.

Phase B와 v0/v1 직접 실행은 동일한 Codex Worker와 공통 Worktree·Scope·Verification·Evidence·Artifact 파이프라인을 사용한다. Phase B에서 실행하려면 최신 Execution System Policy와 실제 Human이 확인한 Execution Delegation 양쪽에 `"workerMode": "codex-worktree"`가 있어야 한다. 이 필드는 기존 정책 및 위임 바인딩에 포함되며, 값이 없는 이전 기록에는 새 권한이 생기지 않는다. 기존 Decision의 위임을 수정하거나 재발급하지 않는다. 전환하려면 새 정책 버전을 승인하고 새 Phase A 방향 및 위임을 함께 승인한다.

`codex-worktree`는 Codex가 승인 Commit에 고정된 Worktree에서 파일을 탐색·수정하고 일반 개발 명령을 실행하는 권한이다. 승인 요청은 Worktree 밖의 읽기 노출 가능성과 사후 검사 한계를 명시한다. 이 모드는 `workspace-write`, 승인 승격 금지, 도구 네트워크 비활성화 및 임시 쓰기 루트 제외를 설정한다. Worktree에는 외부 의존성을 연결하지 않는다. Codex 자체의 모델 통신과 시스템 설정은 신뢰 경계에 남으며, Worktree는 파일별 읽기 제한이나 모든 프로세스 부작용의 격리를 보장하지 않는다. `task.allowedPaths`와 `task.forbiddenPaths`는 최종 변경의 사후 검사에 사용하며, 일시적인 쓰기나 외부 부작용을 되돌릴 수 없다.

`shellCommands`는 Harness의 독립 Verification 상한이다. Harness는 승인된 `git diff --check`만 고정 argv로 실행하며, 이 목록은 Codex 내부 개발 명령을 제한하지 않는다. 작업 공간 준비·Worker·Verification에는 공통 실행 시간 한도와 위임 만료 시각을 적용한다. 실패 Evidence와 Artifact는 Repository 외부에 보존한다. 원본에 자동 Apply·Commit·Push하지 않는다.

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
| [phaseAState](../src/workflows/development-organization/phase-a/state.ts) | 공통 입력과 `policyLookup`, `staffingResult`, `approvalResult`, `specialistDecisionsResult`, `decisionComparisonResult`, `synthesisResult`와 synthesisAssignments·준비된 요청·현재 Index·수집 Decision·Comparison 입력/결과를 소유 |
| 같은 파일의 `specialistDecisionsResult` | Stage 3: completed와 비어 있지 않은 AgentDecision[] 또는 failed / preflight·authorization·claim·decision / reason·assignmentId? |
| 같은 파일의 `decisionComparisonResult` | Stage 4: completed / comparison, skipped / insufficient-decisions, failed / reason. 기존 Comparison Schema 재사용 |

이전 staffingSetupState / staffingSetupOutput의 내부 상태·결과 Schema를 Phase A에 통합했다.
현재 Graph.invoke는 Phase A State를 반환하며 별도 Output StateSchema는 없다. 향후 Organization에 공개할
최종 Phase A Output은 해결 방향 승인이 구현될 때 확정한다. 현재 중간 State 전체를 미래 부모의 공개 계약으로 고정하지 않는다.

Stage 1의 staffingResult는 proposed / failed / escalated, Stage 2의 approvalResult는 approved /
approval-required / denied / rejected / failed(confirmation)만 표현한다. 정책 조회 실패는 policyLookup에
보존한다. 과거 collect-staffing-approval-result와 staffingApprovalResult Schema / State는 Step 4에서 제거했다.
Graph는 proposed일 때 승인 평가, approval-required일 때 Human 확인, approved + specialist-decisions일 때만
Preflight로 진행한다. 승인 요청의 원본 Proposal·Binding은 approvalResult 자체에 보존한다.
Entry Point는 Stage 결과를 기존 StaffingApprovalWorkflowResult로 변환하며 승인 대기는 request로 감싼다.
없거나 모순된 결과는 성공으로 변환하지 않는다. 이 반환은 전체 Phase A 성공이나 Phase B 진입 승인이 아니다.

Stage 3은 전체 준비 요청의 Decision 생성·검증이 끝나고 비어 있지 않은 묶음일 때만 완료한다.
Preflight·Authorization·Claim·Decision 실패는 즉시 종료하고 이후 Invocation / Stage 4를 실행하지 않는다.
완료되지 않은 묶음은 성공으로 노출하지 않으며 중간 collectedDecisions를 비운다.

Stage 4는 Stage 3의 완료 결과를 입력받는다. 단일 Decision이면 기존 compareDecisions()를 호출하지 않고
skipped / insufficient-decisions를 기록한다. 복수 Decision은 기존 v3 Comparison / Reference 검증을 거쳐
completed / comparison 또는 failed / reason을 기록한다. Comparison 실패 시 Stage 3의 completed와 검증된
Decision 및 collectedDecisions를 보존하며 Stage 3을 실패로 바꾸지 않는다.
이 경우 전체 성공으로 판단하거나 향후 Synthesis / 승인으로 진행해서는 안 된다. 현재 기존 specialist-decisions 대상은 Stage 4에서 END로 종료한다. ceo-synthesis 대상은
completed 또는 단일 skipped일 때만 Stage 5로 진행한다. 최종 Phase A Outcome은 아직 없다.

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
필요한 권한 검증을 생략하는 근거가 되지 않는다. 현재 Human Direction Review의 동일 프로세스 Interrupt / Resume만 구현했고, 영속 Checkpoint / 장애 복구는 미구현이다.

### 현재 Phase B StateSchema

`phaseBState`는 `handoff`, 검증 결과인 `handoffResult`, `workDecompositionResult`, 남은 선택 ID인 `pendingPlanningIds`, 업무 ID와 결과를 연결한 `planningResults`를 소유한다. 계획 결과는 실행 준비가 검증되면 `executionSourceId`를, 완료 후 검증이나 등록이 실패하면 `executionBlockedReason`을 포함한다. 공개 입력은 Phase A 완료 계약과 같은 구조의 `PhaseBHandoff`를 받는다. Phase A 내부 State와 실행 옵션은 포함하지 않는다. [Phase B State](../src/workflows/development-organization/phase-b/state.ts)

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

다음은 **결정된 상위 계층과 향후 검토할 내부 책임 구조**다. Organization Graph는 아직 없다. Phase A는 Staffing / Approval과 선택적 후속 Node를 실행하고 Phase B Graph는 Work Decomposition과 선택적 Detailed Planning을 실행한다. 아래 내부 항목은 목표 책임을 표시한다.

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
| Phase A / Phase B | 전체 Lifecycle의 주요 Subgraph 경계로 결정. 현재 두 Phase Graph를 각각 실행할 수 있으며 상위 Organization Graph 연결은 미구현 |
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
| LangGraph Runtime / Phase A Graph | [createPhaseAGraph](../src/workflows/development-organization/phase-a/graph.ts) 구현 | 정책 → Staffing → Approval → 실행 대상·승인에 따른 선택적 Specialist 실행 |
| Staffing / Approval Nodes | 정책 조회·Staffing·승인 평가·Human 확인 4개 Node 구현 | 기존 Application 호출·최소 선행조건·State 업데이트. 별도 Setup Graph나 결과 수집 Node는 없음 |
| Staffing CLI | [runStaffingApproval](../src/workflows/development-organization/phase-a/entrypoints/run-staffing-approval.ts)이 staffing-approval 실행 대상을 명시하고 개별 Stage 결과를 기존 반환 형식으로 변환 | 기존 입력·Human 확인·출력 유지, Specialist 실행 없음 |
| Staffing / Governance | [Staffing API](../src/application/staffing/index.ts), [Governance API](../src/application/governance/index.ts) 구현 | Proposal Finalization, 직접/위임 승인·Scope 발급, Authorization / Reservation / 일회 Claim 제공 |
| Specialist Decisions / Comparison | [Phase A Graph](../src/workflows/development-organization/phase-a/graph.ts)의 일반 Specialist Node / Edge가 기존 Governance·v2 / v3를 조합 | 순차 반복·Fail-fast는 Edge가 제어. 단일 Decision은 Comparison 생략; Staffing CLI에서는 미실행 |
| Planning / Execution | [v1 Planning](../src/application/planning/index.ts), [v0 Execution](../src/application/execution/index.ts) 구현 | 독립 CLI / Application capability. ApprovedDecision 입력·Phase B 실행 조정은 없음 |

현재 Stage 3 실패 단계는 preflight / authorization / claim / decision이며 미완료 묶음을 성공으로
반환하지 않는다. Stage 4 실패는 별도 decisionComparisonResult에 기록한다. Claim 세부 거부 원인은 구분하지
않는다. Budget은 예약 시 소비하고 실행 실패 후 Claim 자동 취소·재시도·환불은 제공하지 않는다.
Stage 3 / 4 결과를 전체 Organization의 성공·실패 Schema로 확장하지 않는다.

### Stage 1 / 2 책임 정리 — Step 4 적용

이전 staffingApprovalResult 결합 State와 Collect Node는 제거했다. 내부 Stage 결과는 독립적으로 유지하며
Graph는 결과별 실행 분기를, Entry Point는 기존 API 표현을 맡는다. 직접 Graph 소비자는 Stage별 결과로
이전해야 하지만 Staffing CLI의 반환·JSON 형식은 유지한다. 최종 Phase A Outcome은 여전히 미정이다.

**Planned / Not Integrated:** 전체 Organization Graph, 자동 Phase 전환, Phase B Assignment 실행 조정,
Executive Report와 영속 Checkpoint 기반 복구. 새로운 모델·API나 디렉터리를 이 목록만으로 만들지 않는다.

테스트 근거는 [Phase A Graph 테스트](../src/workflows/development-organization/phase-a/tests/graph.test.ts),
[Phase A 통합 테스트](../src/workflows/development-organization/phase-a/tests/phase-a.integration.test.ts)와
[CLI 테스트](../src/cli/commands/staffing/staffing.test.ts)에 있다. Node / Edge 분기·State 갱신,
승인 대기·거부·위조 확인·정책/Repository 변경 검증과 CLI 실행 범위의 시나리오가 존재한다.
이는 mock TTY / Codex transport를 사용한 검증이며 실제 Human·Codex·전체 조직 E2E 또는 프로세스 재시작 복구 검증을 의미하지 않는다.

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
5. **Phase 연결 — 목표 계층 결정 / 구현 미정:** Organization Graph 아래 Phase A / Phase B를 주요 Subgraph로 둔다. 당시에는 Handoff 저장·검증 API를 후속 과제로 남겼다. Step 7.2 이후 기존 Governance 조회 재사용으로 정리했으며 실제 연결은 후속 과제다.
6. **CLI / 폴더 제약 — Step 3 구현:** CLI 호환성만으로 Subgraph를 만들지 않는다. 같은 Graph의 staffing-approval / specialist-decisions 실행 대상 구분으로 현재 CLI 범위를 보존한다.
7. **Stage 계약 — 일부 구현 / 후속 검토:** Step 2에서 Stage 3 / 4 결과·완료 시점을 분리하고 단일 비교의 skipped를 명시했다. Staffing / Approval 결과는 Step 4에서 분리했으며 최종 Phase A Outcome은 후속 과제다.
8. **Preflight 책임 — Step 3 적용:** 단일 Governance 조회와 순수 배치 검증으로 분리했다. 당시 Complete Node를 유지했으나 Step 3.1에서 실행 전 진행 상태 검사와 마지막 실행의 완료 확정으로 통합했다. 실행 시점 Authorization / Claim은 생략하지 않는다.
9. **Node / 배치 구조 — 판단 기준 확정, 배치 미정:** Application 함수당 Node나 Stage당 완료 Node를 강제하지 않는다. stages/ 디렉터리·미래 Node 수·새 Subgraph·재시도/복구 정책은 결정하지 않는다.

Step 3은 승인된 Staffing 단계 결과와 명시적 Specialist 실행 대상에만 후속 분석을 허용한다.
이후 Phase B 설계에서 승인 기록의 복원과 Planning / Execution 적격성 확인을 서로 다른 시점에 두기로 결정했다. 현재 기준은 [Phase A → Phase B Handoff Contract](#4-phase-a--phase-b-handoff-contract)를 따른다.

### Phase A Refactoring Step 3.1 — Specialist 완료 실행 경계 통합

Stage 3의 완료 결과는 마지막 execute-next-specialist 업데이트에서 확정한다. Graph는 실패 시 종료,
미완료 시 다음 Assignment 반복, completed일 때만 Comparison 진입을 담당한다. 별도 완료 Node는 제거했다.
실행 전 요청·커서·수집 수 불일치를 검사해 추가 Authorization을 차단하고, 마지막 성공 후 전체 대상 수와
Decision 수·커서 일치를 확인한다. Stage 3 / 4 Schema와 Preflight 단일 조회·개별 Authorization / Claim은 그대로다.
별도 완료 Stream 이벤트 대신 마지막 Execute 업데이트로 Stage 3 완료를 관찰하며 Stage 4 실패는 완료된
Stage 3을 지우지 않는다. Phase A 전체 완료·해결 방향 승인이나 재시도·복구를 의미하지 않는다.

### Step 6.2 — CEO Synthesis 실행 계약 (Implemented)

```text
executionTarget: ceo-synthesis
  승인 → Preflight → Specialist 반복 → Comparison
    ├─ failed → END (Synthesis 미실행)
    └─ completed / 단일 skipped → run-ceo-synthesis → END
                                  proposed / escalated / failed
```

기존 staffing-approval / specialist-decisions 대상은 각각 기존 종료 지점을 유지한다.
Synthesis Node는 저장 Scope에서 Preflight가 추출한 synthesisAssignments와 기존 공통 Goal / SHA,
Stage 3 Decisions와 Stage 4 결과를 Synthesis Application에 전달한다. Agent·timeout은 Graph 생성 옵션의
synthesis에 두고 State에는 넣지 않는다. Graph는 Stage 진입·종료만 제어하며 출처 검증은 Application이 한다.

synthesisResult는 SynthesisResult Schema를 재사용하고 앞선 Stage 결과를 덮어쓰지 않는다.
새 invoke에서는 synthesisAssignments / synthesisResult도 초기화한다. proposed는 Human 검토용 제안이지
ApprovedDecision·Phase A 완료·Phase B 진입 허가가 아니다. 당시 미구현이던 방향 승인 기록과 동일 프로세스 Resume는 Step 7.2에서 추가했다. Handoff·영속 복구·자동 재시도는 아직 없다.

Application 계약과 SourceReference의 구체적인 범위·한계는
[CEO Synthesis 구현](architecture.md#step-62--ceo-synthesis-application--graph-integration)을 따른다.

### Step 6.2 내부 계약 리팩터링

Graph 실행 대상·Stage 5 진입 / 종료·State 채널은 유지했다. Synthesis Application 내부를 Model / Protocol /
CEO Adapter / Flow / Validation으로 정리했다. 공개 API 이름은 유지하지만 Proposal의 rationale은 목록으로,
tradeoffs는 benefit / cost / reason / sources로 변경했다. 실패 값도 입력·실행·Timeout·JSON·Schema·Reference·
Coverage로 구분한다. Graph fixture와 결과 소비자는 이 Output Schema 변경을 반영해야 한다.
Propose는 쟁점별 처리 위치를 검증하고 Escalation에는 전체 배치 Coverage를 요구하지 않는다.
상세 규칙과 정적 검증 한계는 [Synthesis 구현 계약](architecture.md#sourcereference-검증과-한계)을 따른다.

### Step 7.2 — Human Direction Governance

아래 흐름은 Step 7.2 당시 방향 검토를 설명한다. 현재 독립 검토는 `independent-direction-review`에서 제공하며 정상 완료 경로는 [Handoff Contract](#4-phase-a--phase-b-handoff-contract)를 따른다.

```text
run-ceo-synthesis (proposed + 신뢰된 Review 등록)
  → human-direction-review [interrupt]
  → Command({ resume: { reviewId, binding, action, feedback? } })
  → finalize-direction-review
      approved / rejected / denied / failed / confirmation-required → END
      revision-requested → run-ceo-synthesis → 새 Review → interrupt
```

**초기 Step 7.2 설계 이력 (아래 Trust Boundary Simplification에서 변경):**
Review 준비는 Synthesis Node에서 검증 직후 수행한다. 별도 prepare Node에 복사된 proposed State를
전달하면 Application의 실제 검증 출처를 확인할 수 없기 때문이다. Decision·Comparison·Synthesis
Application은 검증 성공 경로에서 객체 식별자와 분리된 원본을 프로세스 내부 일회용 기록으로 연결한다.
Human Governance 대상의 Node만 이 출처를 즉시 소비하여 Ledger에 기록한다. Schema·Digest·State만
통과한 객체나 기존 ceo-synthesis 실행 결과를 복사하여 Review로 등록하는 경로는 허용하지 않는다.

Ledger의 optional directionAnalyses / directionReviews / approvedDecisions는 역사적 기록에
기본값을 추가하거나 읽기 시 저장 형식을 바꾸지 않는다. 분석 기록은 실제 claimed Invocation과 원본
Goal / Snapshot / Assignment에 연결된다. Governance는 이 연결을 확인하며 Synthesis의 Reference /
Coverage·Evidence 검증을 다시 구현하지 않는다.

DirectionReview는 Proposal을 한 번 저장하고 분석 Digest·Scope Version·이전 Review·Revision 번호와
Binding으로 연결한다. 실제 Human Receipt는 Review와 정확한 action / feedback에 묶인 별도 확인 Binding을
사용한다. approve / request-revision / reject 모두 같은 신뢰된 Confirmation 경계를 거친다.
Human 대기는 Ledger Lock 밖에서 수행하며 이후 최신 정책·Repository를 다시 검증한다.
결과는 directionGovernanceResult에 기록하고 승인된 경우에만 ApprovedDecision을 발급한다.
ApprovedDecision은 Review / Binding / 실제 승인 Record를 참조하며 getApprovedDecision()으로
Proposal·Goal·Repository Snapshot·Human 승인 근거를 복원한다. 이 조회는 과거 Record Integrity만 검사한다. 최신 Policy / Repository / Delegation에 대한 Current Eligibility는 Review 등록·확정, Scope 조회·Authorization 경로에서 계속 검증한다. Task 실행 권한이나 Phase B Handoff 허가는 아니다.

Revision은 기존 분석과 이전 Proposal·기록된 Feedback만 SynthesisContext.revision에 추가한다.
최대 두 번이며 새 Review ID / Binding을 발급한다. Specialist·Comparison·Authorization / Claim을
재실행하지 않는다. 새로운 조사나 Goal 변경이 필요하면 CEO는 Escalation해야 하며 자동 재분석 경로는 없다.
정적 검증은 Feedback에 대한 답변의 의미적 충분성을 증명하지 않는다.

PhaseAState에는 directionReview / directionAction / directionGovernanceResult만 추가했다.
실제 HumanConfirmation 객체와 Agent·Callback은 State / Resume에 넣지 않는다.
interrupt Node는 부작용 없이 중단하고 Resume 시 처음부터 다시 실행된다. Finalize는 별도 Node이며
승인 중복 발급을 Ledger Transaction에서 차단한다. 자동 Retry / Replay는 설치하지 않는다.

#### 동일 프로세스 실행 예시

```ts
const graph = createPhaseAGraph({
  executionTarget: "independent-direction-review",
  confirmDirection: (request) =>
    confirmHumanAction(request.binding, JSON.stringify(request)),
});
const config = { configurable: { thread_id: "direction-review-1" } };
await graph.invoke({ goal, repositoryPath }, config);
const snapshot = await graph.getState(config);
const review = snapshot.values.directionReview;
await graph.invoke(new Command({
  resume: { reviewId: review.id, binding: review.binding, action: "approve" },
}), config);
```

Command는 @langchain/langgraph, confirmHumanAction은 infrastructure/terminal 공개 API다.
같은 Graph 인스턴스와 Thread ID를 사용한다. MemorySaver는 해당 인스턴스의 메모리에만 있으며 프로세스
재시작·전원 장애·저장 직후 실패의 exactly-once 복구를 지원하지 않는다. Resume 값은 인증이 아니며,
confirmDirection 콜백이 없으면 실제 확정 없이 confirmation-required로 종료한다.
Resume 자체가 없으면 interrupt 승인 대기를 유지한다. 새 입력 invoke는 Resume가 아닌 새 실행이다.
새 실행에서는 이전 Review / Action / 결과를 초기화한다. 기존 Staffing CLI에는 새로운 명령을 추가하지 않았다.

검증 범위는 실제 Git·signed Ledger·일회용 Receipt와 mock TTY / Codex transport를 사용하는 통합
테스트다. 실제 Codex·Human 전체 E2E와 Phase B 진입은 후속 Phase A Checkpoint의 검증 대상이다.

### Step 7.2 내부 책임 리팩터링 — 당시 구조

Direction Review의 단일 flow.ts는 다음 책임으로 분리했다. 공개 Governance 함수 이름과 결과 Schema는 유지한다.

- flow/analysis-provenance.ts: 실제 검증 결과의 일회용 증거를 소비하여 claimed Invocation / Decision / Comparison 기록을 연결한다.
- flow/review-management.ts: 검증된 Synthesis와 기존 분석을 연결하고 Review Binding·Revision 등록·현재 Review 조회를 관리한다.
- flow/direction-approval.ts: pending Action과 Confirmation Binding을 확인하고 Human 승인·수정 요청·거부를 Transaction에서 확정한다.
- flow/approved-decision.ts: 과거 인간 승인 기록과 원본 분석·Proposal을 조회한다.
- 당시 shared/resolve-context.ts에 있던 조회·복원은 현재 flow/context/resolve-review-context.ts, Scope·Review Binding 및 Revision 무결성 검증은 flow/validation/validate-review-record.ts로 분리했다.
- Direction Review 계약은 model/action.ts / review.ts / result.ts가 소유한다. Model 간 의존성은 action → review → result 순서로 구성하며 공개 Export·Schema 의미와 Flow 실행 순서는 유지한다.

getApprovedDecision()은 signed Ledger와 발급 당시 Policy / Delegation / Scope 및 Review·실제 Human Record의 연결을 검증한다.
이후 정책 갱신·위임 교체·Repository 변경만으로 과거 기록 조회를 막지 않는다. 반면 getDirectionReview()는
진행 중인 Workflow / Revision 입력용이므로 기존 최신 적격성 검증을 유지한다. prepareDirectionConfirmation() /
finalizeDirectionReview()와 getApprovedStaffingScope() / Authorization도 최신 검증을 생략하지 않는다.
읽을 수 있는 승인 기록이 있다는 사실은 현재 후속 실행 허가가 아니다. Phase B Handoff는 여전히 미구현이다.

Graph는 Human Governance 실행 대상에서만 구체적인 Provenance 기록 함수를 Node에 제공한다.
Node의 Boolean 기록 옵션은 제거했으며 Synthesis Node는 원본 / Revision Context 선택, Application 실행,
Review 등록 순서로 읽힌다. Revision Context 조회는 내부 보조 함수로 분리하되 등록은 같은 Node에서
직렬화 전에 수행한다. 새 Node / Subgraph / Registry는 추가하지 않았고 Interrupt / Resume Edge는 유지한다.

### Step 7.2 — Trust Boundary Simplification

**현재 기준:** 동일 프로세스의 Phase A Graph와 Application 실행 코드를 신뢰한다. 실제 외부 입력은
Goal / Repository와 Resume의 Human Action이다. 새 invoke는 START에서 과거 Stage 결과를 초기화하고
Application을 순서대로 실행한다. Resume는 action / reviewId / binding / feedback만 검사하며 Proposal
또는 State 교체를 받지 않는다. Graph의 updateState·내부 Node 호출·내부 모듈 import는 신뢰된 운영 코드의
기능이며 외부 입력 인터페이스로 노출하지 않는다. 이 전제를 임의 프로세스 코드 실행 방어로 확대하지 않는다.

이 모델에서 세 Application의 WeakMap 결과 증거와 recordDirectionDecision / recordDirectionComparison은
제거했다. 기존 Evidence·Reference·Synthesis Schema / SourceReference / Coverage 검증은 그대로다.
공개 registerDirectionReview API가 허용했던 직접 등록 경로는 닫았다. 내부 writer는 Synthesis Node 한 곳에서
실제 runSynthesis()의 proposed 결과를 받은 직후 호출한다. Governance는 분석의 타당성을 다시 증명하지 않고
현재 Scope와 원본 Goal / Snapshot / Assignment 연결·Revision 동일 분석·Review Binding을 검증한다.

```text
Decision + Evidence 검증 → Comparison + Reference 검증 → Synthesis + Output 검증
  → 최초 Review {원본 Context, Proposal, Binding} → Human Confirmation → 승인/수정/거부 기록
  → Revision: 최초 Context + 이전 Proposal / 실제 Feedback → Synthesis → 새 Review / Binding
```

Context는 최초 Review에 한 번 저장한다. Revision은 previousReviewId로 같은 Context를 재사용한다.
새 실행은 directionAnalyses를 쓰지 않는다. 과거 directionAnalyses / context 없는 Review는 기존 경로로
조회하고 승인할 수 있으며 읽기 시 삭제·마이그레이션하지 않는다. 새 Context는 기존 Review Binding과
analysisDigest에 포함된다. ApprovedDecision은 계속 Review / 실제 Human 기록을 참조한다.
기록 무결성과 현재 적격성의 분리, Confirmation 일회성·Action Binding, 중복 승인 차단은 유지한다.

이는 내부 raw writer를 악성 동일 프로세스 코드로부터 격리하는 보안 장치가 아니다. 내부 writer의 유일한
cross-module 호출을 공개 barrel 규칙의 좁은 예외로 기록했다. 외부 State 복원·임의 Node 실행을 입력으로
허용하는 모델은 현재 지원하지 않는다. 영속 복구·Phase B Handoff는 여전히 별도 범위다.
