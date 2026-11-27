# Repository Working Rules

## 1. Project Purpose

이 프로젝트는 개발자와 AI Coding Agent가 실제 Repository에서 함께 일하기 위한 ADE이자 Development Governance Harness다. North Star와 Make vs Adopt의 기준은 [Project Direction](docs/project-direction.md)에 둔다.

Development Organization이 현재 실행 모델의 기준이다. 각 Phase는 독립 Graph API로 제공된다.

- Phase A는 Human Goal의 해결 방향을 분석하고 승인한다. System Policy, Staffing 승인, Specialist Authorization과 읽기 전용 분석, Comparison, Assessment·Refinement, CEO Synthesis, Human Direction Review 순서로 진행한다.
- Phase B는 검증된 Handoff를 받아 Work Item을 분해·선택하고 Specialist에게 배정한다. 읽기 Assignment는 분석과 Evidence를 기록한다. 수정 Assignment는 승인된 Read Session에서 계획을 구체화하고, TaskContract Binding과 별도 Write Authorization·Claim을 거쳐 격리된 Worktree에서 구현·검증한다.
- Application은 역할별 기능을 제공하고 Workflow는 실행 순서·분기·상태를 조정한다. Governance는 승인·권한·기록 무결성을 소유하며 Runtime은 제한된 분석·계획·구현을 수행한다.
- Phase B는 옵션에 따라 Assignment 결과를 Work Item별로 통합하고, 선택된 전체 Work Item의 `FinalResult`를 생성한다. Organization 상위 Graph, 자동 Phase 전환, Evaluation, Rework, Reporting과 Delivery 연결은 후속 범위다.

> Reliable Worker before Agent Team

독립 Planning·Decision·Staffing 실행 경로는 과거 개발 이력이다. 현재 Workflow에서 필요한 공통 엔진만
재사용하며 제거된 독립 Workflow를 복원하지 않는다. 기준 문서는 [Architecture](docs/architecture.md)와
[Workflow Architecture](docs/workflow-architecture.md)다. 중요한 경계가 문서와 충돌하면 변경 전에 보고한다.

## 2. Current Stack

- Node.js 20 이상
- TypeScript
- pnpm
- tsx
- Vitest
- Zod
- LangGraph.js (`@langchain/langgraph`, 필수 `@langchain/core`)

이 Repository는 Next.js / React 애플리케이션이 아니다. Node.js 기반 CLI 및 development tooling 프로젝트다.

## 3. Core Development Principles

- 구현은 현재 요청에 필요한 최소 범위로 유지한다.
- 미래 기능을 위한 선행 추상화를 만들지 않는다.
- 실제 책임이 생기기 전에 디렉터리나 계층을 미리 만들지 않는다.
- `docs/architecture.md`의 개념적 계층을 그대로 코드 폴더 구조로 복사하지 않는다.
- framework-first가 아니라 responsibility-first로 구조를 확장한다.
- 하나의 작은 실행 흐름을 끝까지 연결하고 검증한 뒤 다음 기능을 추가한다.
- Reliable Worker before Agent Team 원칙을 유지한다.

## 4. Architecture Boundaries

현재 책임과 future / conditional model은 [Architecture](docs/architecture.md)를 따른다.

- Human은 승인과 최종 governance 결정을 소유한다.
- Harness는 개발 도메인의 Contract / Authority / Context / Evidence / Verification 의미와 use-case 상태 제어를 소유한다.

`createPhaseAGraph()`는 기본적으로 방향과 실행 위임의 동시 승인까지 진행한다. 방향 단독 승인이 필요한 경우
`directionApproval: "direction-only"`를 선택한다. 이 방식은 같은 분석·승인 경계를 거치며 완료된 Phase B Handoff를 발급하지 않는다.
Staffing·Refinement 승인이 필요할 때는 동일한 Human 확인 콜백을 사용한다. 콜백이 없으면 승인 필요 상태에서
종료하고, 거절이나 정책 검증 실패 후에는 실행을 진행하지 않는다. 방향 검토는 동일한 Graph 인스턴스와
`configurable.thread_id`에서 Interrupt / Resume를 사용한다. Resume action의 Review ID·Binding과 실제 Human Receipt를 검증한다.

현재 GoalSpec / TaskContract와 Decision model / protocol 또는 Graph State의 존재를 durable execution으로 설명하지 않는다. Graph State는 실행 데이터이며 Governance Ledger를 대체하지 않는다. 범용 기능과 실행 모델 변경은 Project Direction의 Design Decision Filter로 평가한다.

## 5. Repository Structure

- `docs/architecture.md`: 시스템 설계와 책임 경계의 기준 문서
- `docs/workflow-architecture.md`: Organization 실행 계약·Phase Handoff·State / Output 소유권과 Step 2.5 재검토 기준
- `src/cli/cli.ts`: 사람의 Governance 정책·위임·승인 관리 명령.
- `src/contracts/`: 역할 간 공유 도메인의 Zod 스키마, 파생 타입 및 순수 불변 조건. `management/`는 업무·배정·출처, `specialist/`는 전문가·권한 표현·구현 계획·실행 계약, `governance/`는 공유 Staffing 정책, `repository/`는 Snapshot·Context 스코프·검사 파일 계약을 소유한다. `goal.ts`는 Human Goal, `shared/`는 실제 여러 계약에서 사용하는 순수 검증을 제공한다.
- `src/application/management/`: 분석·실행 배정, 비교·Assessment·Synthesis, 업무 분해.
- `src/application/specialist/`: 승인된 분석, Assignment 상세 계획, Assignment 실행 연결.
- `src/application/governance/`: 승인·권한·Ledger·예약·일회 Claim 검증 및 기록.
- `src/application/governance/authorization/features/assignment-execution/flow/`: Assignment의 Context·Binding·예약·Claim·Read Session·Write 실행 권한. 프로세스 내부 Claim 등록은 발급 파일에, Runtime Permit 등록은 Write 소비 파일에 캡슐화한다.
- `src/application/task-execution/`: `runtime/`은 Specialist가 예약 전에 호출하는 환경 검사, `flow/`는 승인 Permit을 소비하는 Worktree 실행·검증·결과 확정, `worker/`는 Codex 프로세스 실행.
- `src/application/integration/`: `assignment/`은 Work Item의 산출물을 통합하고, `work-item/`은 Ledger에 기록된 전체 선택 결과에서 FinalResult를 만든다. 기존 승인 Snapshot의 격리 Worktree와 검증·Artifact 기능을 공유한다.
- `src/workflows/development-organization/phase-a/` 및 `phase-b/`: 각 Phase의 Graph, State, Data Flow 및 테스트.
- Workflow의 `features/`는 Phase의 업무 진행 단계로 구분한다. Graph Node와 Factory는 `nodes/`에 두고, 호출 연결·사전 검증·복수 실행 조정·State 변환은 각 Feature에서 실제 책임에 맞게 배치한다. [Workflow Feature와 Application 대응](docs/workflow-architecture.md#현재-workflow-feature와-application의-대응)
- `src/infrastructure/codex/`: 외부 Codex 실행 설정과 격리 Context lifecycle.
- `src/services/scope/`: 변경 경로 Scope 정책 검사
- `src/services/verification/`: verification command 실행
- `src/services/artifacts/`: 실행 디렉터리, patch, 결과 persistence
- `src/services/evidence/`: 실행 중 변경 사실 수집
- `src/infrastructure/process/`: 외부 command 실행과 process lifecycle
- `src/infrastructure/git/`: Repository resolution과 격리된 Git worktree lifecycle
- `src/workflows/development-organization/phase-a/tests/`: Phase A Graph 계약·분기와 Workflow 통합 테스트; 개별 기능 테스트는 해당 구현과 co-location 유지
- co-located `*.test.ts`: 해당 구현 모듈의 unit test

현재 존재하지 않는 디렉터리를 예상 구조로 미리 추가하지 않는다.

Application은 업무 로직과 기능별 `model/`, Agent `protocol/`, 기능 입출력 `data-flow/`를 소유한다.
Workflow는 State와 Phase Handoff를 소유한다. Contracts는 Application·Workflow·Services·Infrastructure·CLI를 import하지 않는다.
새 계약은 역할 간 공유되는 독립 개념일 때 Contracts에 둔다. 스키마 검증은 구조와 순수 불변 조건을 확인하며
실제 승인·Authority·Ledger 무결성은 Governance가 검증한다.

## 6. Coding Rules

- TypeScript의 strict 설정을 유지한다.
- TypeScript 포맷은 `.prettierrc.json`을 따른다. `pnpm format`으로 적용하고 `pnpm format:check`로 확인한다.
- Runtime boundary validation에는 Zod schema를 사용한다.
- Contract는 Zod schema를 source of truth로 삼고 `z.infer`로 TypeScript 타입을 생성한다.
- 불필요한 class hierarchy를 만들지 않는다.
- 실제 책임이 없는 repository / service / manager abstraction을 만들지 않는다.
- 새로운 dependency는 현재 작업에 실제 필요가 있을 때만 추가한다.
- 기존 contract의 의미를 요청 없이 변경하지 않는다.
- 요청과 관계없는 refactoring을 하지 않는다.
- 테스트는 가능하면 구현 파일과 co-location을 유지한다.
- Cross-module import는 `@/*` source alias와 각 module의 `index.ts`를 사용한다.
- 좁은 내부 연결 예외: Phase A의 `features/decision-support/synthesis/nodes/run-ceo-synthesis.ts`만 Governance의 내부 `direction-review/flow/review-management.ts`에서 `registerDirectionReview`를 직접 import한다. 원시 Review 등록은 public barrel에 노출하지 않고 실제 `runSynthesis()` 검증 성공 직후에만 호출한다.
- 좁은 내부 연결 예외: `integration/assignment/flow/integrate-assignment-results.ts`만 Governance의 `records/work-item-integrations/work-item-integration-records.ts`에서 통합 기록 writer를 직접 import한다. Cleanup 성공 후 기록하며 writer는 public barrel에 노출하지 않는다.
- Same-module internal import는 상대경로를 사용하며, 상위 mega barrel은 만들지 않는다.

## 7. Validation

작업 완료 전 기본적으로 다음 명령을 실행한다.

```sh
pnpm typecheck
pnpm format:check
pnpm test
git diff --check
```

실제 기능에 별도 실행 경로나 명령이 있으면 해당 작업에서 추가로 검증한다. Agent의 완료 보고만으로 성공을 판단하지 않고 실제 명령 결과를 확인한다.

## 8. Change Discipline

- 요청된 범위 밖의 파일을 수정하지 않는다.
- Architecture 변경이 필요할 때 코드로 몰래 우회하지 않는다.
- Architecture와 구현이 충돌하면 변경 전에 먼저 보고한다.
- 작업 완료 후 변경 파일, 검증 결과, 남아 있는 한계를 보고한다.

Resume는 인증이 아니며 HumanConfirmation 객체를 State에 저장하지 않는다. MemorySaver는 영속 복구가 아니다. Revision은 기존 분석으로 Synthesis만 최대 두 번 실행하며 Specialist / Comparison / Claim을 재실행하지 않는다. ApprovedDecision은 Task 실행 권한이 아니다.

Step 7.2의 신뢰 경계는 동일 프로세스의 Workflow / Application 코드를 신뢰한다. 외부 요청에 Graph updateState / 내부 Node 직접 호출 / 내부 Review writer를 노출하지 않는다. 새 invoke는 START 초기화를 거치고 Resume는 Human Action만 받는다. Decision / Comparison / Synthesis의 별도 WeakMap 증거는 사용하지 않으며 최초 Review에 원본 Context를 보존한다. directionAnalyses는 과거 Ledger 읽기 호환성에만 남긴다.
