# AI Workspace Architecture

## 1. Architecture Scope

이 문서는 현재 코드 구조, runtime boundary와 E2E 흐름, current model과 future model의 채택 조건을
설명한다. North Star와 Make vs Adopt는 [Project Direction](project-direction.md), 다음 검증 질문은
[Roadmap](roadmap.md), 사용법은 [README](../README.md), Human 조작은
[CLI and Human Interface](cli-and-human-interface.md)에 둔다.

현재 구현은 이 브랜치의 v0 / v1 / v2 코드 기준이다. Future responsibility는 현재 runtime이나
추가할 폴더의 명세가 아니며, 특정 framework/runtime 도입을 확정하지 않는다.

## 2. Current Architecture

현재는 Codex CLI를 Planner / Worker / decision-only Specialist로 사용하는 Development Governance Harness다.
독립적인 대상 Git Repository에 연결하며, 대상이 이 시스템의 코드나 조직 구조를 포함할 필요는 없다.

```text
CLI: workflow selection / explicit arguments / Human gates / presentation
  ├─ application/planning → TaskContract
  ├─ application/execution → ExecutionResult → Review / Delivery / Cleanup
  └─ application/decision → { snapshot, decisions: AgentDecision[] }
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
- CLI: 인자 없는 workflow selector, 명시적 plan / decision / execute, Task Approval과
  Review / Apply / Commit / Push / Cleanup 및 결과 presentation.

현재 stack은 Node.js / TypeScript / pnpm / tsx / Vitest / Zod다. Codex CLI는 외부 실행 도구이며
package dependency가 아니다. 지원 Agent integration은 Codex CLI 하나이고 provider registry나 generic
runtime layer는 없다. Comparison / synthesis / Agent discussion / Coordinator / Human governance history /
automatic retry / crash resume는 미구현이다. Decision 결과는 메모리와 terminal에만 존재하며 persistence가 없다.

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
→ { snapshot, decisions: AgentDecision[] }
→ Human-readable presentation
```

각 Context는 같은 Goal / repositoryCommitSha와 해당 Specialist의 files만 담고 repositoryRoot나
다른 Specialist의 Decision을 포함하지 않는다. CLI use-case는 두 역할에 같은 파일 목록을 주지만,
하위 independent flow는 Specialist별 files를 받을 수 있다. 현재 순차 실행이며 자동 파일 선택은 없다.

오류는 fail-fast로 전파하며 다음 Specialist를 실행하거나 partial result를 반환하지 않는다.
Decision은 Planning / Execution에 자동 연결되지 않고 Comparison / Synthesis / Review / Git Delivery를
수행하지 않는다. 결과를 배열로 수집하는 것은 Decision persistence가 아니다.

## 4. Current Responsibility Boundaries

| 소유자 | 현재 책임 | 경계 |
| --- | --- | --- |
| Human / CLI adapter | workflow·입력, Task Approval, Review / Delivery / Cleanup, 결과 표시 | core use-case 조립을 소유하지 않음 |
| Planning application / Codex Planner | 조사·limits·계약 생성 / supplied PlannerContext로 inspect 또는 complete | inspection은 수정 권한이 아니며 Planner는 별도 cwd·제한된 도구 설정으로 실행 |
| Harness contract transformation | ID 주입, Human constraints 보존, Goal의 targetRepository, Zod validation | AI가 시스템 ID나 Human 제약을 소유하지 않음 |
| Execution application / Codex Worker | workspace와 Worker / Scope / Verification / artifacts 연결 / scoped 수정 | 정상 종료 때 workspace를 지우지 않으며 verification command는 Harness가 실행 |
| Decision entry `runDecision` | 입력 검증, Snapshot / Goal / explicit Context와 두 Specialist 구성 | CLI presentation을 알지 않음 |
| Decision Context flow | Snapshot capture/assert, commit 기준 파일 loading | working tree에서 Context를 임의로 읽거나 자동 탐색하지 않음 |
| Decision orchestration / validation | 순차 독립 실행, Snapshot 전후 검사, Evidence exact path / line invariant | Agent끼리 판단 전달·비교·종합하지 않음 |
| Codex Specialist | 제한된 Context로 판단, strict JSON parsing과 schema, Harness identity 주입 | Context와 Evidence의 일치 검증은 flow가 담당 |
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

### Execution artifacts / Human gate / Telemetry

Workspace는 실행용 worktree이고 artifacts는 task.json / base-commit.txt / changes.patch / result.json이다.
ExecutionResult는 완료 시점 snapshot이며 Review / Delivery / Cleanup 결과를 이후 저장하는 기록이 아니다.
Cleanup은 workspace만 대상으로 하고 artifacts는 유지한다. Artifact preservation은 durable execution이 아니다.

Human gate와 Delivery는 실행 성공과 별개다. Duration telemetry는 운영 데이터이며 Evidence와 구분한다.
CLI의 Goal flow Total은 이후 Human 대기를 포함할 수 있지만 Execution snapshot timing은 포함하지 않는다.
Decision Duration은 input 완료 후 실행·표시 구간의 전체 시간이며 개별 Specialist tracing backend는 없다.

## 5. Target Responsibility Model

현재 책임 위에 향후 Comparison / Synthesis / Human escalation을 추가하는 모델이다.
독립 plane, 별도 CEO / Coordinator 또는 ADE layer를 만들라는 명세가 아니다.

```text
Human ↔ CLI / Human decision surface
              ↓
AI Workspace Governance: Contract / Authority / Context / Decision / Evidence
              ├─ 현재: Planning / Execution / Independent Decision
              ├─ 향후: Comparison / Synthesis / Human escalation
              └─ 실행 위임 → Replaceable runtime + Git / Process infrastructure → Repository
```

Harness가 use-case의 순서와 상태 제어·Domain 의미를 소유한다. 외부 runtime이 실행 일부를 맡더라도
framework run/session/step이 core model에 불필요하게 누출되어서는 안 된다.
실제 두 번째 구현이나 중복 책임이 생기기 전에 generic SpecialistRunner, provider registry,
`infrastructure/codex` 같은 abstraction을 미리 만들지 않는다. 도입 순서와 판단은
[Project Direction](project-direction.md#build-vs-adopt), v3 이후 checkpoint는
[Roadmap](roadmap.md#runtime-framework-evaluation)을 따른다.

## 6. Current and Conditional Domain Models

| 모델 / 개념 | 상태 | 현재 의미 또는 채택 조건 |
| --- | --- | --- |
| RepositorySnapshot | Current | model/snapshot.ts의 repositoryRoot / commitSha. Decision의 Repository provenance |
| SpecialistDefinition / SpecialistAuthority | Current | model/specialist.ts / authority.ts. id / role / objective / authority, RepositoryAccess와 shellExecution |
| SpecialistContext | Current | protocol/context.ts. GoalSpec / repositoryCommitSha / InspectedFile[] |
| AgentDecision / EvidenceReference | Current | protocol/decision.ts의 strict Zod schema와 inferred type. recommendation / evidence / risks / uncertainty와 Harness identity, path / optional lines / description |
| ComparisonRelation / ComparisonGapKind / ComparisonPosition / ComparisonFinding / ComparisonGap / ComparisonResult | Domain Model v0, type-only | application/comparison/model/comparison.ts. Finding은 agreement / conflict / trade-off, Gap은 uncertainty / limitation / separate-concern. Concern은 string, Position은 specialistId와 원본 Decision의 evidenceIndexes로 참조. Comparator / schema / validation / flow는 미구현 |
| DecisionRound | Conditional | 동일 Snapshot 아래 독립 Decision들의 고유 비교 단위가 실제 필요할 때만. Workflow step 복제라면 만들지 않음 |
| DecisionRun | Conditional | Goal → Decision / Evidence → Human governance result의 고유 audit lifecycle이 필요할 때만. Runtime run/session 복제라면 만들지 않음 |
| Synthesis / CEO / Coordinator | Future / Conditional | 종합·escalation 책임과 별도 Agent 구현 여부를 구분. Runtime 평가 후 선택 |
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
SpecialistAuthority가 해당한다. 현재 RunDecisionInput / RunDecisionResult는 작은 use-case entry에
함께 선언되어 있으며 구조적 대칭만을 위해 model 파일로 분리하지 않는다.

> model ≠ 모든 타입을 넣는 곳

system-wide contract는 `contracts`, 역할 간 message contract는 `protocol`에 둔다.

#### protocol

컴포넌트나 역할 사이에서 주고받는 구조화된 message contract를 둔다.
Planning에는 PlannerContext, PlannerDecision, InspectRequest, InspectResult, TaskDraft가 있다.
Decision에는 SpecialistContext, AgentDecision, EvidenceReference와 Decision Zod schema가 있다.

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
아래 예시에서는 CLI entry와 세부 파일을 생략한다.

```text
src/
├─ cli/  # operator adapter; 세부 구조는 CLI 문서 참조
├─ application/
│  ├─ comparison/  # Domain Model v0만 존재; 실행 use-case는 미구현
│  │  ├─ model/
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
- v2의 독립 Specialist 실행과 미래 comparison / synthesis / Human governance history를 구분한다.
- Decision Context는 Snapshot commit의 explicit files이며 다른 Specialist의 Decision을 포함하지 않는다.
- Schema 및 Evidence path / line 검증을 Decision의 의미적 정확성 보장으로 과장하지 않는다.
- Generic runtime 문제는 기존 기술을 먼저 평가한다. Runtime은 교체 가능하며 governance 의미는 프로젝트가 소유한다.
- 실제 domain 의미 없는 Run / Round 복제나 CEO / Coordinator 역할명을 구현 약속으로 만들지 않는다.
- Runtime boundary는 Zod validation을 사용하며 현재 요청에 필요하지 않은 추상화를 만들지 않는다.
