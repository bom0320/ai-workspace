# Repository Working Rules

## 1. Project Purpose

이 프로젝트는 개발자와 AI Coding Agent가 실제 Repository에서 함께 일하기 위한 ADE이자 Development Governance Harness다. North Star와 Make vs Adopt의 기준은 [Project Direction](docs/project-direction.md)에 둔다.

현재 v0 Safe Execution, v1 Goal-to-Task Planning, v2 Governed Independent Decision, v3 Structured Decision Comparison이 구현되어 있으며 다음 원칙을 따른다.

> Reliable Worker before Agent Team

다중 Agent 조직을 먼저 만들기보다 하나의 제한된 작업을 안전하게 실행하고 검증하는 기반을 우선한다. 시스템의 책임과 경계에 관한 기준 문서는 `docs/architecture.md`다. 구현이 문서와 충돌하거나 문서에 없는 중요한 경계를 요구하면 임의로 결정하지 말고 먼저 보고한다.

## 2. Current Stack

- Node.js
- TypeScript
- pnpm
- tsx
- Vitest
- Zod

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
- Worker는 scoped execution, Specialist는 supplied Context의 독립 판단을 수행한다.
- Git / Process 및 runtime은 기술적 실행 수단이다. v4 Workflow Runtime은 LangGraph.js 채택 확정 / 설치·통합 미구현이며, 기존 Codex 기반 Agent Execution Runtime을 우선 재사용한다. Harness가 Governance 의미·실행 허용 조건을 소유하고 LangGraph.js는 workflow 실행 메커니즘을 맡는다.
- Comparison은 기존 독립 Decision의 Concern별 관계와 source reference를 다룬다. Synthesis / Human governance history는 미구현이며 v4는 CEO Agent의 판단·종합·보고와 전체 조직 workflow를 목표로 하되 현재 미구현이다. 별도 Coordinator / DecisionRun / DecisionRound는 선행 구현하지 않는다.

현재 GoalSpec / TaskContract와 Decision model / protocol의 존재를 장기 Shared State나 durable execution으로 설명하지 않는다. 범용 기능과 실행 모델 변경은 Project Direction의 Design Decision Filter로 평가한다.

## 5. Repository Structure

- `docs/architecture.md`: 시스템 설계와 책임 경계의 기준 문서
- `src/cli/cli.ts`: interactive workflow selector와 explicit command의 CLI entry point
- `src/contracts/`: runtime-validated contract와 TaskContract loader
- `src/application/planning/`: Goal-to-Task Planning use-case와 public API
- `src/application/decision/`: 독립 Decision use-case와 public API; flow/context, orchestration, validation은 실제 책임별 grouping
- `src/application/comparison/`: 독립 AgentDecision을 Concern 단위로 비교하고 source reference를 검증하는 use-case와 public API; Decision 실행과의 조합은 CLI command가 담당
- `src/application/execution/`: Task 실행 모듈의 public API
- `src/application/execution/flow/`: Task 실행 순서와 orchestration
- `src/application/execution/model/`: 실행 상태와 결과 모델
- `src/application/execution/worker/`: 제한된 Task를 수행하는 Worker integration
- `src/services/scope/`: 변경 경로 Scope 정책 검사
- `src/services/verification/`: verification command 실행
- `src/services/artifacts/`: 실행 디렉터리, patch, 결과 persistence
- `src/services/evidence/`: 실행 중 변경 사실 수집
- `src/infrastructure/process/`: 외부 command 실행과 process lifecycle
- `src/infrastructure/git/`: Repository resolution과 격리된 Git worktree lifecycle
- co-located `*.test.ts`: 해당 구현 모듈의 unit test

현재 존재하지 않는 디렉터리를 예상 구조로 미리 추가하지 않는다.

## 6. Coding Rules

- TypeScript의 strict 설정을 유지한다.
- Runtime boundary validation에는 Zod schema를 사용한다.
- Contract는 Zod schema를 source of truth로 삼고 `z.infer`로 TypeScript 타입을 생성한다.
- 불필요한 class hierarchy를 만들지 않는다.
- 실제 책임이 없는 repository / service / manager abstraction을 만들지 않는다.
- 새로운 dependency는 현재 작업에 실제 필요가 있을 때만 추가한다.
- 기존 contract의 의미를 요청 없이 변경하지 않는다.
- 요청과 관계없는 refactoring을 하지 않는다.
- 테스트는 가능하면 구현 파일과 co-location을 유지한다.
- Cross-module import는 `@/*` source alias와 각 module의 `index.ts`를 사용한다.
- Same-module internal import는 상대경로를 사용하며, 상위 mega barrel은 만들지 않는다.

## 7. Validation

작업 완료 전 기본적으로 다음 명령을 실행한다.

```sh
pnpm typecheck
pnpm test
git diff --check
```

실제 기능에 별도 실행 경로나 명령이 있으면 해당 작업에서 추가로 검증한다. Agent의 완료 보고만으로 성공을 판단하지 않고 실제 명령 결과를 확인한다.

## 8. Change Discipline

- 요청된 범위 밖의 파일을 수정하지 않는다.
- Architecture 변경이 필요할 때 코드로 몰래 우회하지 않는다.
- Architecture와 구현이 충돌하면 변경 전에 먼저 보고한다.
- 작업 완료 후 변경 파일, 검증 결과, 남아 있는 한계를 보고한다.
