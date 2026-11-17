# Workflow Responsibility Boundaries — Stage / Node / Application

이 문서는 Development Organization Workflow에서 책임을 나누는 **설계 판단의 기준 기록**이다.
기존 구조에서 드러난 문제, 선택 이유와 대안, 유지할 계약과 후속 검토 사항을 함께 보존한다.
[Workflow Architecture](workflow-architecture.md)는 실제 실행 구조·Phase 계약·State / Output·Handoff를,
[Architecture](architecture.md)는 전체 시스템과 Application 구현·검증 이력을 소유한다.
프로젝트 목적과 Governance 원칙은 [Project Direction](project-direction.md), 구현 순서는
[Roadmap](roadmap.md)을 따른다.

아래의 **확정 원칙**, **현재 구현 사실**, **미적용 개선 방향**을 구별한다. Step 2에서 Stage 3 / 4의 Result와 완료 시점을 분리했다.
Step 4에서 Stage 1 / 2의 중복 통합 State도 제거했다. 이 문서는 새 타입·Schema·디렉터리·Node 수·Subgraph 수를 확정하지 않는다.
Organization Graph, CEO Synthesis, Human Direction Governance, Phase B, Interrupt / Resume와 Checkpoint
Recovery는 미구현이다. 기존 Staffing·Governance·Decision·Comparison과 LangGraph 기반 Phase A는 구현되어 있다.

## 1. 문제와 책임 모델

초기 리팩토링에서는 폴더와 실행 경계를 먼저 정하고 기능을 배치했다. Staffing Setup Subgraph를 통한
CLI 범위 보존과 내부 State 분리를 검토한 뒤, 전체 조직 관점에서 Phase A / Phase B를 주요 실행 경계로
정하고 Setup을 제거했다. 이후 단일 Specialist Node가 함수형 Orchestrator를 호출하던 구조도 제거해
Assignment 반복·실패·Comparison 진입을 Phase A Edge로 옮겼다.

하지만 실행 제어 이관만으로 업무 책임이 분리되지는 않았다. Specialist의 배치 검증·단일 실행·결과 확정은
Workflow의 여러 위치에 있었고 Staffing / Approval 및 Decision / Comparison 결과 계약이 결합되어 있었다.
Step 2에서 후자의 결과·완료 순서는 분리했고 Step 4에서 Staffing / Approval의 중복 내부 결과도 제거했다. 코드가 흩어졌다는 사실만으로 다시 합치거나 Node를 더 나누면 소유권과 실행 범위를 재차 혼동할 수 있다.
따라서 **기능의 소유자 → 업무 목적과 완료 조건 → 실행·관찰 단위 → 코드 배치** 순서로 판단한다.

Stage는 Application의 기능 소유권을 바탕으로 Workflow에서 달성할 **업무 목적, 입력·출력 계약과
성공·실패 조건**을 정의한다. 아래 구분은 설계 기준이며 새로운 Runtime 객체나 Stage Schema의 선언이 아니다.

| 개념 | 소유하는 책임 |
| --- | --- |
| Application | 실제 기능과 비즈니스 규칙의 단일 소유자 |
| Stage | 업무 목적, 필요한 입력·출력, 성공·실패 조건 및 완료 의미 |
| Graph | 실행 순서·조건 분기·Workflow 반복·Stage 전환과 종료 제어 |
| Node | State에서 입력을 선택해 하나의 실행 단위를 수행하고 부분 State 업데이트를 반환하는 함수 |

Stage와 Application을 1:1로 강제하지 않는다. 한 Stage가 여러 Application을 사용하거나 같은 Application이
여러 Stage에 참여할 수 있다. Stage 하나가 여러 Node로 실행될 수도 있다. Application 기준의 코드 분류와
LangGraph의 Stage별 실행 구성은 별개 결정이며 `stages/` 도입이나 Application 폴더의 1:1 복제는 결정하지 않는다.

## 2. 첫 번째 경계 — Stage

### Phase A의 여섯 업무 목적과 진행 조건

다음은 업무 경계다. Stage 1~4의 기반 기능과 Stage 3 / 4의 독립 결과·완료 계약은 구현되었다. Step 4에서 Stage 1 / 2의 결과와 외부 반환 계약도 분리했다.
Stage 5~6은 목표이며 새 Application 패키지가 존재한다는 뜻이 아니다.

| Stage | 주요 소유 Application | 입력 → 성공 결과 / 완료 조건 | 다음 Stage 진행 조건 |
| --- | --- | --- | --- |
| 1. CEO Staffing | `staffing` | 원본 Goal / Constraints와 정책·Snapshot Context → 검증·최종화된 `StaffingProposal` | Proposal이 proposed일 때 승인 평가로 진행. Proposal 자체는 실행 권한이 아님 |
| 2. Human Staffing Approval | `governance/approval` | 원본 Proposal과 적용 정책·필요한 Human 확인 → 실제 승인과 `ApprovalRecord`, `ApprovedOperatingScope` 발급·저장 확정 | 승인된 경우에만 실행 대상으로 진행. 대기·거부·확인 실패는 차단; 실행 전 최신 권한 검증은 별도 |
| 3. Independent Specialist Decisions | `decision` (실행 권한은 Governance) | 승인된 실행 대상·검증된 Context와 공통 Goal / Snapshot → 모든 대상의 독립 분석·Snapshot / Evidence 검증을 마친 `AgentDecision[]` | 전체 대상이 완료된 경우에만 비교 또는 단일 Decision 후속 경로로 진행 |
| 4. Decision Comparison | `comparison` | 같은 비교 단위의 독립 Decision과 원본 Goal / Snapshot SHA → 관계 분석과 원본 참조 검증을 마친 `ComparisonResult` | 비교 성공 또는 허용된 생략 경로에서만 후속 종합으로 진행. 단일 Specialist의 비교는 skipped / insufficient-decisions로 명시 |
| 5. CEO Synthesis | 향후 `synthesis` 기능 | 독립 판단·비교 결과·근거 → CEO 종합 보고안 | 보고안에 필요한 검증 후 Human Direction Governance로 전달하는 목표. CEO는 최종 승인 권한을 갖지 않음 |
| 6. Human Governance | 향후 해결 방향의 Governance 승인·수정·거절 기능 | 종합 보고안과 원본 Goal / Constraints·근거 → Human이 승인한 방향인 `ApprovedDecision` | 실제 방향 승인과 Handoff 검증을 충족해야 Phase B 진입. 수정·거절의 효과와 재검증은 후속 계약 대상 |

Staffing Approval은 분석 조직·Context·Invocation Budget에 대한 승인이다. Human Governance는 종합된
해결 방향의 승인·수정·거절을 담당한다. 두 승인과 Phase B의 Task Approval·Repository 수정·Delivery 권한은
대상과 효과가 다르다. CEO Synthesis는 독립 Decision과 비교 근거를 종합해 방향을 제안하며 승인하지 않는다.
Specialist Decisions의 업무 범위는 독립 Decision 생성·검증까지이고, 관계 분석은 Comparison의 별도 목적이다.

Stage와 Application의 다대다 관계는 실제 실행에서도 드러난다. Specialist Stage는 Decision뿐 아니라
Governance의 Authorization / Claim을 사용한다. Governance는 Staffing Approval과 Specialist 실행의
서로 다른 Stage에서 재사용된다. Stage를 나눈다고 Application 기능을 복제하거나 Stage마다 새 Application을
만들지 않는다.

### Stage 결과와 외부 Workflow 결과

Stage가 성공해도 다음 Stage의 선행조건을 만족하지 않으면 진행할 수 없다. Proposal은 Stage 1의 성공
산출물이지만 Stage 2의 승인·Scope 발급을 대신하지 않는다. 모든 Decision이 생성됐어도 Comparison이
실패했다면 후속 종합이나 전체 Workflow를 성공으로 반환해서는 안 된다.

| 수준 | 관찰해야 할 의미 |
| --- | --- |
| 개별 Stage 결과 | 그 업무 목적의 달성 여부와 산출물·실패·대기·거부·Escalation·생략 사유 |
| 다음 Stage 진입 | 선행 산출물과 해당 시점의 정책·권한·검증을 충족하는가? |
| 외부 Workflow 결과 | 요청한 실행 범위가 어디까지 완료됐는가? 후속 업무가 막혔는가? 전체 성공인가? |

Graph의 END는 실행 경로의 종료다. Stage 성공이나 전체 업무 완료를 의미하지 않는다. 명시적 생략도
실행 성공과 구분하되, 어떤 생략이 후속 진행을 허용하는지는 업무 계약으로 판단한다. 현재 단일 Decision은
Comparison을 호출하지 않는 허용 경로이며 Stage 4에 skipped / insufficient-decisions를 기록한다.

### 현재 Stage 계약과 이전 결합을 분리한 이유

[PhaseAState](../src/workflows/development-organization/phase-a/state.ts)의 현재 계약은 다음과 같다.

| 현재 데이터 / 실행 | 현재 의미와 관찰 한계 |
| --- | --- |
| staffingResult / approvalResult | Stage 1의 proposed / failed / escalated와 Stage 2의 approved / approval-required / denied / rejected / confirmation failed를 독립 관리 |
| runStaffingApproval()의 반환 | Entry Point가 policyLookup / staffingResult / approvalResult를 기존 외부 StaffingApprovalWorkflowResult로 변환. 합친 결과를 State에 저장하지 않음 |
| specialistDecisionsResult | Stage 3만 표현. completed와 비어 있지 않은 Decision 배열 또는 preflight / authorization / claim / decision 실패 |
| decisionComparisonResult | Stage 4의 completed / comparison, skipped / insufficient-decisions, failed / reason |
| execute-next-specialist의 마지막 성공 업데이트 | 전체 Assignment 성공을 확인해 Stage 3을 확정한 뒤 Stage 4로 진행. Comparison은 완료 결과를 소비 |

**이전 계약과 변경 이유:** 과거에는 Comparison이 필요한 경우 비교까지 성공해야 Stage 3 결합 결과가
completed가 되었고, Comparison 실패가 Decision 생성 실패처럼 보였다. Step 2에서 Stage 3 완료 후 독립
Stage 4로 진행하도록 분리했다. Stage 3 실패 시 미완료 묶음은 여전히 성공으로 반환하지 않는다.
반면 Stage 4만 실패하면 이미 검증된 Decision을 보존한다. 이것은 전체 Phase A 성공이나 후속 진행 허용이 아니다.
기존 specialistDecisionsResult의 comparison / comparison 실패 단계와 specialistComparison 채널을 제거했으므로
호출자는 새 Stage 4 결과를 확인해야 한다. Stage 1 / 2는 Step 4에서 독립 결과로 정리했으며 최종 Phase A Output은 여전히 후속 과제다.

## 3. 두 번째 경계 — Graph Node

현재 내부 기능 모듈은 Phase A의 features/ 아래에, 외부 호출 인터페이스는 entrypoints/에 배치한다.
이는 디렉터리 분류 기준의 정리이며 새 Application 계층·Stage·Node·Subgraph를 추가한 것이 아니다.

### Node 분리 판단

Node는 Workflow가 독립적으로 실행하고 결과를 관찰해 후속 실행을 제어할 필요가 있는 작업 단위다.
Application 함수나 파일 하나에 Node 하나를 대응시키지 않는다.

| 기준 | 판단 질문 |
| --- | --- |
| 실행 경계 | 독립적인 실행·관찰이 필요한가? |
| 분기 경계 | 결과에 따라 후속 실행 경로가 달라지는가? |
| 실패 경계 | 실패를 다른 작업과 구분해 처리해야 하는가? |
| 신뢰·재실행 경계 | 권한·부작용·재시도·재개를 별도로 제어해야 하는가? |

모든 기준을 만족해야 하는 것은 아니다. 실제 Graph 수준에서 독립적으로 관리할 이유가 있는지가 최종
기준이다. Node는 필요한 State 입력을 선택하고 하나의 실행 단위에 필요한 Application 기능을 조합해 부분
State 업데이트를 반환한다. Graph는 Node 순서·분기·Workflow 반복·Stage 전환·종료를 제어한다.
Node가 다른 Node를 직접 호출해 별도의 Orchestrator를 만들지 않는다.

### 현재 Phase A의 9개 Node에 적용

다음은 [실제 Graph](../src/workflows/development-organization/phase-a/graph.ts)와 Node 호출에 대한 분석이다.
유지는 현재 책임을 지킬 근거, 조정·통합 검토는 미적용 방향을 뜻한다. 파일 이동·삭제 계획은 아니다.

| Node / 코드 근거 | 현재 실행·관찰 경계 | 유지 또는 조정·통합 검토 근거 |
| --- | --- | --- |
| [load-system-policy](../src/workflows/development-organization/phase-a/features/governance/nodes/load-system-policy.ts) | Repository 입력 확인, Governance 정책 조회, 과거 실행 State 초기화. ready / denied로 분기 | 유지 근거: 정책 조회 실패 시 CEO 실행을 차단하는 독립적인 선행조건. 정책 유효성 자체는 Governance가 판단 |
| [run-staffing](../src/workflows/development-organization/phase-a/features/staffing/nodes/run-staffing.ts) | 기존 runStaffing을 한 번 호출해 proposed / failed / escalated 관찰 | 유지 근거: 독립 CEO 실행과 성공·실패·Escalation 분기. Proposal 완성 Loop·최종화는 Application 내부에 유지 |
| [evaluate-staffing-approval](../src/workflows/development-organization/phase-a/features/governance/nodes/evaluate-staffing-approval.ts) | 원본 Proposal로 approveStaffingProposal 호출, approved / approval-required / denied에 따라 다음 경로 선택 | 유지 근거: Human 확인 필요 여부가 바뀌는 분기. 위임 승인 시 여기서 Scope 발급까지 완료될 수 있어 순수 조회로 취급하거나 무조건 재실행하면 안 됨 |
| [confirm-staffing-approval](../src/workflows/development-organization/phase-a/features/governance/nodes/confirm-staffing-approval.ts) | 승인 필요 시 분리된 review로 Human 콜백 호출, 원본 Proposal·실제 receipt로 최종 승인 요청 | 유지 근거: Human 대기·거부·예외와 최신 정책 재검증의 경계. 내부의 확인과 확정을 함수 개수만으로 나누지 않음. 현재 Interrupt / Resume는 아님 |
| 과거 collect-staffing-approval-result (Step 4에서 제거) | Stage 1 / 2 종료 결과를 다시 통합해 저장하던 Node | Graph의 분기는 각 Stage 결과로, 외부 반환 변환은 Entry Point로 분리. 별도 Node·중복 State 없이 기존 CLI 계약 유지 |
| [preflight-specialist-decisions](../src/workflows/development-organization/phase-a/features/decision/nodes/preflight-specialist-decisions.ts) | 저장 Scope 대조·모든 Assignment의 요청 구성·배치 검증 후 준비 결과 반환 | 유지 근거: 전체 검사 실패 시 첫 Reservation도 만들지 않는 실행 전 경계. Step 3에서 Scope 조회는 Node 한 곳에 두고 helper는 순수 배치 검증으로 변경 |
| [execute-next-specialist](../src/workflows/development-organization/phase-a/features/decision/nodes/execute-next-specialist.ts) | 한 요청의 Authorization → Claim·v2 실행 → Decision 수집·Index 갱신. authorization / claim / decision 실패와 준비 요청 부재 시 preflight 실패 기록 | 유지 근거: Assignment별 실행·관찰과 즉시 중단. 반복은 Edge가 결정하며 Invocation은 로컬 변수. 권한 부작용을 고려해 무조건 여러 Node로 쪼개지 않음 |
| [compare-specialist-decisions](../src/workflows/development-organization/phase-a/features/comparison/nodes/compare-specialist-decisions.ts) | 모든 Decision 수집 후 Stage 3 완료 결과로 기존 compareDecisions 호출 또는 단일 비교 생략 | 독립 Stage 4로 completed / skipped / failed 기록. 실패해도 Stage 3 결과 보존 |
| 과거 complete-specialist-decisions (Step 3.1에서 제거) | 비어 있지 않은 전체 Specialist 결과를 Comparison 전에 확정 | Step 2에서 Stage 3 완료를 분리했고 Step 3.1에서 검사를 Execute Node에 통합. 완료 계약이 별도 Node를 요구하지는 않음 |

### Graph 반복과 Application 내부 Loop

반복문의 존재 자체가 Graph 소유권을 뜻하지 않는다.

| 반복 | 소유자와 이유 |
| --- | --- |
| CEO의 Inspection·Proposal 완성 Loop | Staffing Application: 하나의 Staffing 기능을 완성하는 내부 판단·조사 과정 |
| Assignment 순서·한 Specialist 완료 후 다음 실행·실패 시 중단 | Phase A Graph: 업무 목록의 진행·분기·종료를 Workflow가 관찰하고 통제 |
| 입력·파일·Evidence 검증과 데이터 처리 | 해당 Application: 그 기능의 정확성·정책을 위한 내부 반복 |

현재 runIndependentDecisions()는 배열을 처리하는 내부 반복을 갖지만 Phase A의 실행 함수는 매번 입력
한 개만 전달한다. 이를 이유로 기존 v2 알고리즘을 다시 쓰거나 모든 내부 반복을 Graph로 옮기지 않는다.
과거 단일 run-specialist-decisions Node → 함수형 runSpecialistDecisions() 구조는 Graph가 시작만 하고
내부 반복·실패를 관찰하지 못하는 한계로 제거했다. 이를 목표 구조로 다시 도입하지 않는다.

### Node 조합·완료 시점과 부작용

하나의 Node가 여러 Application을 호출할 수 있다. execute-next-specialist는 Authorization을 호출하고
재사용 실행 함수를 통해 Claim과 Decision을 연결한다. Reservation을 만들거나 Claim을 소비하는 작업을
무조건 Node별로 나누면 그 사이의 State·재시도·재개·중복 부작용 계약이 필요해진다. Invocation은 State에
권한 증거처럼 저장하지 않고, 소비된 Claim을 자동 재사용하지 않는 현재 원칙을 유지한다.
단일 Node에 연결했다고 원자적 실행 완료나 exactly-once가 보장되는 것도 아니다.

완료 Node는 Stage 최종 결과를 독립적으로 확정·관찰할 이유가 있을 때 둔다. 단순 변환·내부 검증을 별도
Node로 강제하지 않으며 모든 Stage에 완료 Node를 요구하지 않는다. 이전 구현과 Step 2 적용 결과는 다음과 같다.

```text
이전 구현
  Execute Next Specialist (Phase A Edge 반복)
    ├─ 1 Decision → Complete Specialist Decisions → END
    └─ 2+ Decisions → Comparison → Complete Specialist Decisions → END

이전 — Step 2 구현
  Preflight → Execute Next Specialist (Phase A Edge 반복)
            → Complete Specialist Decisions (Stage 3 완료)
            → Decision Comparison (Stage 4: 단일 skipped, 복수 completed / failed)

현재 — Step 3.1 구현
  Preflight → Execute Next Specialist (Phase A Edge 반복, 마지막 성공에서 Stage 3 완료)
            → Decision Comparison (Stage 4: 단일 skipped, 복수 completed / failed)
```

Comparison은 Stage 3 내부의 완료 조건이 아닌 Stage 4의 업무다. 현재 단일 생략을 명시하고 Comparison 실패 시
Stage 3 완료를 보존한다. 결과 소비자는 Stage 3만으로 전체 성공을 판단해서는 안 되며 Stage 4 실패는 후속
진행을 차단해야 한다. Staffing CLI 계약은 유지했고 Graph State의 결과 소비 방식은 변경되었다. CEO Synthesis와 Human
Governance의 Node 개수나 별도 Subgraph 도입은 미래 실행·분기·실패·재개 요구 없이 미리 확정하지 않는다.

## 4. 세 번째 경계 — Application과 Workflow

Application은 실제 기능과 비즈니스 규칙의 단일 소유자다. Workflow는 이를 조합해 업무 흐름을 구성하며
기존 정책을 별도로 재정의하거나 검증을 우회하지 않는다.

| Application | 기능·검증의 소유권 |
| --- | --- |
| Staffing | Proposal 생성·최종화, Staffing 정책 검증 및 Proposal 완성을 위한 내부 Loop |
| Governance Approval | 승인 정책·Delegation·Human Confirmation 유효성 검증과 승인 기록·Scope 발급 |
| Governance Authorization | Invocation 적격성, 최신 Scope / Assignment / Context·정책·예산 검증, Reservation 및 Claim |
| Decision | Specialist 실행 계약과 Snapshot / Evidence 검증 |
| Comparison | 독립 Decision 관계 분석, 결과의 Specialist ID / Evidence Reference 유효성 검증 |
| Synthesis (예정) | CEO 종합 분석, 보고안 검증과 결과 계약 |
| Human Governance (예정) | 해결 방향의 Human 승인 정책과 기록 |


### 현재 호출 관계와 신뢰 검증

#### Staffing Approval

```text
Workflow의 원본 Proposal 준비 → approveStaffingProposal()
→ Governance의 승인 판단·필요 시 Scope 발급 → 결과를 받아 Graph 분기
```

[Approval Application](../src/application/governance/approval/features/proposal-management/flow/approve-staffing-proposal.ts)은
Proposal·Snapshot·최신 정책·Delegation·Confirmation Binding을 검증하고 승인 기록·Scope를 저장한다.
Workflow는 approved / approval-required / denied 결과를 읽어 Human 확인 실행 여부를 정한다.
Human 확인이 필요하면 review 사본을 전달하고 원본 Proposal과 실제 Confirmation으로 같은 API를 다시
호출한다. CEO를 재실행하거나 Boolean 승인값을 만들지 않는다. Human 대기는 Ledger Lock 밖에서 하고,
대기 후 최신 Repository·정책을 Governance가 재검증한다. receipt는 Node 로컬의 일회용 객체이며 State에
직렬화한 값이 인증된 확인 증거라고 보지 않는다.

#### Specialist Authorization

```text
Workflow의 Assignment·Context 요청 준비 → authorizeSpecialistInvocation()
→ Governance의 최신 권한·Context·예산 검증 → Reservation 저장 → allowed / denied
```

[Authorization Application](../src/application/governance/authorization/features/specialist-invocation/flow/authorize-invocation.ts)이
저장 Scope·Assignment·Context·최신 정책·실행 적격성·잔여 예산을 확인하고 Ledger Transaction에서 예약을
저장한다. 예산은 예약 시 소비한다. Workflow는 기존 API에 요청을 전달하고 거부 시 다음 실행을 차단한다.
State의 approved나 Preflight 통과를 대신 권한으로 사용하거나 예산 정책을 다시 계산하지 않는다.

#### Specialist Execution

```text
Workflow → runAuthorizedSpecialistDecision()
→ claimAuthorizedInvocation() → Claim이 반환한 Invocation
→ runIndependentDecisions() → Snapshot / Evidence Validation → AgentDecision
```

[단일 실행 함수](../src/workflows/development-organization/phase-a/features/decision/execution/authorized-specialist-decision.ts)는
Governance Claim을 호출한 뒤 반환된 Invocation의 Snapshot·Goal·Specialist·Assignment Objective·files를
[Decision Application](../src/application/decision/flow/orchestration/run-independent-decisions.ts)에 전달한다.
Claim은 저장 Reservation의 존재·Binding / Digest·최신 승인/정책/Context와 일회 사용 여부를 검증하고
claimedAt을 저장한 뒤에만 성공한다. Ledger Lock은 반환 전에 해제되므로 Specialist는 Lock 밖에서 실행한다.
Decision Application은 실제 실행과 전후 Snapshot·supplied Context의 Evidence를 검증한다.

Workflow는 Claim 거부 시 Decision을 호출하지 않는다. InvocationClaimError로 Claim / Decision 실패를
구별하며 메시지 패턴으로 추측하지 않는다. Claim 세부 거부 원인은 현재 구분할 수 없다. 실행 실패 시 Claim을
자동 취소·재사용·환불하지 않는다. Claim 저장과 실제 실행 사이 TOCTOU·프로세스 종료·결과 유실은 남으며
같은 Node에 묶어도 실행 완료의 원자성은 없다.

#### Comparison

```text
Workflow의 동일 비교 단위 Goal / Snapshot SHA·검증된 Decisions 준비
→ compareDecisions() → Comparison Application의 Reference Validation → ComparisonResult
```

[Comparison Application](../src/application/comparison/flow/compare-decisions.ts)은 두 개 이상 Decision,
Specialist 중복 부재·Snapshot SHA 등의 선행조건을 확인하고 Comparator 결과의 Specialist ID·Evidence
Reference를 검증한다. Workflow는 Stage 3 완료 후 API를 호출하고 실패 시 이미 완료된 Stage 3은 보존하되 후속 종합을 차단한다.
Evidence 경로·줄 범위 또는 Reference 구조의 유효성이 AI 분석 내용의 사실성·의미적 정확성을 보장하지는 않는다.
이 검증을 Workflow에 복제하지 않는다.

### Specialist Preflight의 중복과 목적 구분

Step 3 이전에는 Preflight Node와 Workflow Validation이 각각 getApprovedStaffingScope()를 호출했다.
현재 [Preflight Node](../src/workflows/development-organization/phase-a/features/decision/nodes/preflight-specialist-decisions.ts)가
Governance를 통해 한 번 조회하고 State의 승인 ID / Version과 대조한다. 이어
[순수 배치 검증 함수](../src/workflows/development-organization/phase-a/features/decision/validation/validate-specialist-request-batch.ts)에
그 Scope와 생성한 요청을 전달한다. 함수는 조회·예약·승인 인증을 하지 않는다.

| 검사 / 시점 | 현재 소유자와 유지·제거 이유 |
| --- | --- |
| 저장 Scope·승인 기록·최신 정책·Repository 검증 / 배치 준비 시 | Governance 조회 API. Node만 한 번 호출하며 Validation의 두 번째 조회는 제거 |
| State 승인 결과와 저장 Scope ID / Version 대조 | Node. 호출 대상 Binding 확인이며 State에 실행 권한을 부여하지 않음 |
| Request Schema·Scope / Version·Assignment 소속·중복 요청·누락·순서·Sparse Array / 첫 예약 전 | 순수 Workflow Validation. 모든 승인 Assignment를 한 번씩 순서대로 준비하고 분리하기 위한 배치 검사 |
| 동일 Specialist의 중복 배치 금지 | Staffing validateProposal 정책. Governance 조회의 validateStoredIssuance → validateCurrentStaffingPolicy → validateStaffingProposal에서도 재사용하므로 Workflow의 별도 Specialist Set 검사는 제거 |
| Assignment·Context·최신 Scope·정책·Budget·Reservation / 개별 실행 시 | Governance Authorization. 배치 준비 이후 변경을 거부하기 위해 유지 |
| Reservation Binding·최신 정책·Snapshot·Context·일회 사용 / 실행 직전 | Governance Claim. Preflight나 Authorization 성공으로 생략하지 않음 |

Mock이 반환한 잘못된 Scope는 실제 Governance가 인증한 Scope와 다르다. Workflow에서 Specialist 중복 정책을
다시 검사하는 Mock 테스트 대신 실제 Staffing 검증·Governance 승인 API가 중복 Specialist Proposal을
거부하는 통합 테스트를 둔다. 요청 중복·누락·잘못된 Context를 같은 문제로 취급하지 않는다.
배치 검증의 소속·Version 확인은 요청과 준비 입력의 일관성 검사이며 실행 권한 판단은 아니다.

### Node 선행조건과 Stage 완료 검증 — Step 3 판단

Step 3 당시에는 Complete Node를 유지했다. Graph의 커서 비교는 반복 종료 시점만 정하며 Decision 수가 실행 대상 수와
일치함을 증명하지 않는다. Node의 비어 있지 않음·대상 수·커서 일치 검사는 불완전한 State가 Stage 3
성공이 되는 것을 막는다. 별도 업데이트로 Stage 3 완료를 Comparison 전에 관찰하는 기존 계약도 유지한다.
당시에는 같은 불일치 검사를 유지하고 별도 완료 업데이트를 관찰하기 위해 독립 Node를 남겼다.

**Step 3.1 판단 변화:** 완료 상태 갱신과 검증이 Execute / Complete에 분산되어 있었으므로 마지막
Specialist 실행 성공 시 같은 업데이트로 Stage 3 결과를 확정하도록 통합했다. 독립적인 Stage 결과는
유지하되 별도 실행 Node는 제거했다. 실행 전 비어 있지 않은 요청·정수 커서·커서 범위·수집 수 일치·
미완료 상태를 확인해 잘못된 진행 상태로 추가 Authorization을 하지 않는다. 실행 후 수집 수·새 커서·
대상 수가 정확히 일치해야 완료하며, 실패 시 부분 수집 결과를 성공으로 노출하지 않는다.

별도 Complete Node Stream 이벤트는 사라졌다. 대신 마지막 execute-next-specialist 업데이트에서
Stage 3 완료를 Comparison보다 먼저 관찰한다. Graph는 completed인 경우에만 비교로 진행하고, 그 외에는
남은 Assignment 반복 또는 종료만 제어한다. Application의 Evidence·권한 정책은 복제하지 않는다.
별도 Node를 제거해도 Reservation / Claim·실행 완료가 원자적이거나 안전하게 재실행 가능해지는 것은 아니다.

| 방어적 검사 | 유지 이유 |
| --- | --- |
| load-system-policy의 빈 Repository 경로 | Workflow 필수 입력 오류를 denied로 표현. Governance는 실제 경로·저장 정책을 검증하며 별도 신뢰 경계 |
| run-staffing의 ready, evaluate의 proposed, confirm의 approval-required | Edge는 정상 경로를 선택하고 Node는 자신의 입력 계약을 검사. 업무 정책을 재판단하지 않음 |
| evaluate / confirm의 결과 Schema 및 final approved / denied 확인 | Application 결과를 State에 전달하는 Runtime 경계. 예상하지 못한 결과를 승인으로 취급하지 않음 |
| compare의 Stage 3 완료 및 비교 Context 확인 | Stage 3 완료 결과만 사용하고 실패 의미를 Stage 4에 보존. 실제 Reference 검증은 Comparison Application |

### Graph State / Checkpoint와 Governance Ledger

Graph State는 실행 진행 데이터다. 준비 요청·Index·수집 Decision·결과를 전달하며 현재 새 invoke에서는
과거 실행의 데이터를 초기화한다. Governance Ledger는 승인·권한·예약·Claim의 신뢰 기록이다.
State Schema 통과, approved 표시, 저장한 Scope 객체나 Invocation만으로 실제 권한을 인정하지 않는다.
실제 유효성은 Application의 신뢰 검증으로 확인한다.

향후 Checkpoint로 State를 복원해도 Ledger를 대체하지 않으며 최신 검증을 건너뛰거나 이미 소비한 Claim을
재사용하는 근거가 되지 않는다. 현재 Checkpoint Recovery·자동 Retry / Replay는 없으며 Graph 재호출은
새 Proposal·Scope·Reservation을 만들 수 있다. 전체 idempotency·crash recovery는 보장하지 않는다.

## 5. 설계 판단의 발전과 트레이드오프

다음 기록은 기존 구현 이력을 대체하지 않는다. 과거 Graph / 폴더 변화는
[Architecture의 Step 2.5 이력](architecture.md#910-step-25--workflow-boundary--structure),
[Specialist Graph 이관](architecture.md#912-langgraph-step-3--phase-a-specialist-decisions-integration)에 남아 있다.

### 5.1 폴더 우선에서 소유권·실행 경계 우선으로

1. **당시 구조와 가정:** 기존 Workflow 이름과 CLI 범위를 중심으로 Graph·State·Node의 폴더와 응집성을 정했다.
2. **발견한 문제:** Setup 독립 실행 범위와 업무 기능 소유권을 같은 문제로 취급했고, Specialist 검증·실행 기능의 위치만으로 책임을 파악하기 어려웠다.
3. **선택한 원칙:** 기능 소유자와 Stage 목적·완료 조건을 먼저 정하고 실행 관리 요구로 Node·코드 배치를 판단한다.
4. **이유와 대안:** 기존 폴더를 유지하거나 policy / staffing / approval 분류만 통일해도 실행 계약은 명확해지지 않는다. 실행 범위와 기능 소유권을 각각 검토하는 편이 변경 이유를 설명할 수 있다.
5. **유지할 계약:** 기존 Application 기능·Governance 안전성·CLI 실행 범위와 Phase A / Phase B 중심의 실행 계층을 유지한다.
6. **한계와 후속 과제:** 이 원칙만으로 파일 위치는 결정되지 않는다. 실제 호출·데이터 흐름을 확인해야 하며 stages/ 도입이나 Application 폴더 복제는 미정이다.

### 5.2 함수와 Node의 1:1 대응을 피하는 이유

1. **당시 구조와 가정:** 조회·실행·승인 평가·결과 수집이 각각 Node로 구성되어 있다. 이를 함수마다 Node를 두는 일반 규칙으로 해석할 여지가 있었다.
2. **발견한 문제:** collect Node는 주로 정규화이고, evaluate Node는 Scope 발급 부작용이 있을 수 있다. 함수 수만으로는 제어·신뢰 경계의 차이를 설명하지 못한다.
3. **선택한 원칙:** 실행·분기·실패·신뢰/재실행 요구로 독립 Node의 필요성을 판단하며 한 Node의 여러 Application 조합을 허용한다.
4. **이유와 대안:** 함수마다 나누면 관찰은 세밀해지지만 Reservation·Claim 사이 복원 상태와 중복 부작용 관리가 늘어난다. 모두 합치면 독립 실패·분기 지점이 사라지므로 두 극단을 피한다.
5. **유지할 계약:** Human 확인은 Lock 밖에서 수행하고 원본 Proposal을 최종 승인에 사용한다. Invocation과 receipt는 State의 권한 증거로 보관하지 않는다.
6. **적용 결과와 후속 과제:** Step 4에서 collect Node와 중복 State를 제거하고 분기는 Graph, 외부 표현은 Entry Point에 배치했다. 미구현 기능의 Node 수나 재개 정책을 선행 결정하지 않는다.

### 5.3 함수형 Specialist Orchestrator에서 Graph 반복으로

1. **당시 구조와 가정:** 하나의 run-specialist-decisions Node가 Preflight부터 Comparison까지 기존 runSpecialistDecisions()를 호출했다.
2. **발견한 문제:** LangGraph는 시작만 제어하고 Assignment 반복·다음 Authorization·실패 종료·Comparison 진입은 함수 내부에 남았다.
3. **선택한 원칙:** Phase A의 일반 Node / 조건부 Edge가 Assignment 순차 반복과 실패·완료 분기를 직접 소유한다. 이 전환은 현재 구현되었다.
4. **이유와 대안:** 같은 함수를 이동·개명하거나 Wrapper로 유지하면 실행 소유권은 바뀌지 않는다. 반면 Application의 내부 Loop까지 옮기는 것도 기능 경계를 침범한다.
5. **유지할 계약:** 전체 Preflight 후 첫 예약, 한 Assignment의 완료 후 다음 실행, 즉시 중단, 일회 Claim, 예약 시 Budget 소비와 기존 v2 / v3 검증을 유지한다.
6. **한계와 후속 과제:** 초기 이관에서는 Stage 결과가 결합되어 있었고 Step 2에서 Stage 3 / 4를 분리했다. 자동 재시도·환불·복구는 없고 Graph 재호출은 같은 실행의 안전한 Resume가 아니다.

### 5.4 Specialist Decisions와 Comparison 완료 경계 분리

1. **당시 구조와 가정:** 배치 전체의 성공·실패를 한 결과로 표현하고 Comparison 성공 후 Specialist 결합 결과를 확정했다.
2. **발견한 문제:** 모든 Decision이 성공한 뒤 Comparison만 실패해도 specialistDecisionsResult가 failed이며 Stage 3 완료를 독립적으로 드러내기 어렵다.
3. **선택한 원칙:** 업무상 Decision 생성·검증과 관계 비교를 별도 Stage로 보고 Stage 3 완료 뒤 Stage 4로 진행한다. Step 2에서 코드·결과 Schema·테스트에 적용했다.
4. **이유와 대안:** 결합 결과 유지는 외부 실패 처리가 간단하지만 실패 의미·완료 시점이 섞인다. 결과 분리는 관찰을 개선하지만 State 중복과 외부 API·부분 결과 공개의 설계 부담이 생긴다.
5. **유지할 계약:** Comparison 실패를 전체 성공이나 후속 진행 허용으로 반환하지 않는다. 같은 Goal / Snapshot 비교, 단일 Comparison 생략, Reference 검증을 유지한다.
6. **한계와 후속 과제:** Stage 3 / 4 결과·단일 skipped·완료 순서를 분리하고 중복 specialistComparison 채널을 제거했다. 외부 소비자는 새 결과 구조로 이전해야 하며 최종 Phase A Outcome·Synthesis 진입은 미구현이다. 독립 Stage라는 이유로 새 Subgraph를 만들지 않았다.

### 5.5 Preflight와 Governance 신뢰 검증의 구분

1. **당시 구조와 가정:** Node의 승인 Scope 조회와 별도 배치 Validation, Authorization / Claim의 재검증을 각각 쌓았다.
2. **발견한 문제:** Scope 조회·소속 검사 일부가 중첩되며 배치 일관성과 실행 권한의 정책 소유권이 혼동될 수 있다.
3. **선택한 원칙:** Workflow는 배치 전체 준비·일관성을, Governance는 실제 Scope·Context·권한·예산·예약·Claim 유효성을 소유한다.
4. **이유와 대안:** 모든 중복을 제거하면 뒤쪽 오류 전 예산 소비나 최신 권한 검증 누락 위험이 있다. 모두 유지하면 비용과 정책 중복이 늘 수 있으므로 시점·목적으로 구분한다.
5. **유지할 계약:** Preflight 실패 시 예약하지 않으며 통과 후에도 개별 Authorization / Claim을 수행한다. State / Checkpoint는 Ledger를 대체하지 않는다.
6. **적용 결과와 한계:** Step 3에서 Node의 단일 Governance 조회와 순수 배치 검증으로 분리하고 Specialist 중복 정책 검사는 Staffing에 일원화했다. 개별 Authorization / Claim의 최신 검증은 유지하며 조회와 실행 사이 TOCTOU를 제거한 것은 아니다.

### 5.6 Stage 1 / 2 내부 결과와 외부 반환 계약 분리 — Step 4

1. **기존 문제:** Staffing / Approval 결과가 이미 있었지만 Collect Node가 staffingApprovalResult로 다시 저장했다. 분기와 CLI 표현이 한 결과에 결합되었다.
2. **판단:** Stage 1은 staffingResult, Stage 2는 approvalResult를 소유한다. 정책 조회 실패는 policyLookup에 남기며 Approval에 Staffing 실패·Escalation을 넣지 않는다.
3. **선택 이유:** Graph는 각 Stage 결과로 종료·Human 확인·Specialist 진입을 정하고 Entry Point만 기존 외부 결과로 변환한다. 단순 결과 변환은 별도 실행·관찰 Node가 필요하지 않다.
4. **트레이드오프:** 직접 Graph 호출자는 제거된 staffingApprovalResult 대신 Stage별 결과를 읽어야 한다. 저장소에서는 Entry Point와 테스트가 해당 소비자였으며 외부 배포 소비자는 확인할 수 없다. 기존 runStaffingApproval / CLI 반환은 유지한다.
5. **검증과 안전성:** 미승인 시 Specialist 차단, 최신 정책·Repository 재검증, 원본 Proposal·일회 Receipt·Scope 발급과 Preflight 단일 Governance 조회를 유지한다. 새 invoke는 Stage 결과를 초기화한다. Stream에서는 Staffing과 Approval을 독립 관찰한다.
6. **남은 한계:** 최종 Phase A Outcome과 Checkpoint / Resume는 별도 설계다. Stage 결과나 State Schema가 승인·실행 권한의 원본이 되지 않는다.

## 6. 향후 리팩토링의 적용 순서와 미결정 사항

1. 실제 호출과 기능·정책의 소유 Application을 확인한다. 새 Workflow에 기존 검증을 복사하지 않는다.
2. 업무 목적·입력·성공 산출물·미완료 결과와 다음 Stage 진입 조건을 구분한다.
3. 결과를 독립적으로 관찰·분기·실패 처리해야 하는 단위를 Node로 정한다. 함수 수나 폴더 대칭을 근거로 삼지 않는다.
4. Workflow 반복과 Application 내부 Loop를 구분하고 Graph가 순서·진입·종료를 단독 소유하는지 확인한다.
5. 승인·Reservation·Claim·Repository 부작용에 대해 실패·재실행·재개 시 무엇이 남는지 확인한다.
6. 현재 API / CLI·실패 결과·부분 성공 공개·State / Ledger의 경계를 보존하며 계약 변경과 검증을 함께 계획한다.

Step 2는 Stage 3 / 4 결과·완료 시점과 단일 Comparison 생략을 구현했다. Step 4에서 Stage 1 / 2의
중복 결과·collect Node도 제거했다. Step 3에서 Preflight 조회는 한 번으로 정리했고 Step 3.1에서는 완료 검사를 마지막 Execute 업데이트에 통합했다. 미래 Result 필드·Zod Schema·폴더 구조·추가 Subgraph·
미래 Node 수·Retry / Resume 정책은 이번 기록에서 확정하지 않는다.

Phase B에도 동일 기준을 적용하되 업무 분해·Assignment 모델·다중 실행·재작업·재배치·검증·진행 평가의
구체적인 계약은 별도 설계 대상이다. 기존 Planning / Execution의 기능을 재사용하고 모든 Assignment에
TaskContract를 강제하지 않는다. 이 판단 기준의 존재가 Phase B나 Synthesis·Human Governance·Organization
Graph·Checkpoint Recovery의 구현 완료를 뜻하지 않는다.
