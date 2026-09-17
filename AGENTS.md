# Repository Working Rules

## 1. Project Purpose

이 프로젝트는 여러 Repository를 대상으로 AI Agent의 조직 운영과 안전한 Repository 실행을 연결하는 AI Development Workspace다.

현재는 v0 단계이며, 다음 원칙을 따른다.

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

`docs/architecture.md`가 정의하는 planned architecture의 책임 경계는 다음과 같다.

- Human owns governance.
- CEO owns orchestration and decisions.
- Worker owns scoped execution.
- Harness controls execution.
- Verifier evaluates evidence.
- Shared State stores organizational truth.

현재 코드에는 이 구성요소들이 모두 구현되어 있지 않다. 존재하지 않는 계층이나 동작을 구현된 기능처럼 가정하거나 문서화하지 않는다. 현재 구현된 시스템 contract는 TaskContract이며, 나머지 planned architecture는 실제 요구가 생길 때 점진적으로 구현한다.

## 5. Repository Structure

- `docs/architecture.md`: 시스템 설계와 책임 경계의 기준 문서
- `src/cli.ts`: 현재 CLI entry point
- `src/contracts/`: 시스템 경계에서 사용하는 runtime-validated contracts
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
