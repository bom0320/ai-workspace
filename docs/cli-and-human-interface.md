# CLI and Human Interface

이 문서는 [AI Workspace Architecture](architecture.md)의 책임 경계를 terminal entry와
Human interaction에 적용한다. 현재 구현과 향후 확장 방향을 구분하며,
application의 내부 구조 기준은 architecture.md의 7절을 따른다.

## 1. CLI의 역할

CLI는 AI Workspace를 terminal 환경에서 실행하기 위한 entry point다.

```text
pnpm dev <repository> "<objective>"
  ↓
src/cli/cli.ts
  ↓
AI Workspace의 application use-case 호출
```

CLI 자체가 Planning이나 Execution의 핵심 로직은 아니다.
실제 기능은 `planTask()`와 `executeTask()` 등 application layer에 있다.
CLI는 Human input을 받아 use-case를 호출하고 결과를 출력하는 adapter다.

```text
CLI = 입구
Application = 실제 기능
```

## 2. Human Interface / Human UI의 의미

Human UI는 사람이 시스템과 상호작용하는 접점을 의미하며, 웹 UI일 필요는 없다.
현재 AI Workspace는 terminal-based Human UI를 사용한다.
Goal 입력, TaskContract 확인, Approve / Reject, 결과 확인이 모두 이 접점에 속한다.

현재 Goal은 명령 인자로 전달한다. 다음은 interaction의 개념 예시이며,
별도의 interactive Goal 입력 prompt나 선택형 TUI가 구현되어 있다는 뜻은 아니다.

```text
Goal: README 설명을 더 명확하게 수정해줘
Planning: completed
Task Contract:
{ ... }
Approve / Reject (enter Approve to execute):
Approve
```

향후 웹 UI를 도입하더라도 같은 application use-case를 재사용할 수 있어야 한다.

## 3. cli.ts와 Human UI의 관계

`cli.ts`는 CLI 프로그램 전체의 entry point이고,
Human UI는 프로그램 실행 중 사람이 입력하거나 판단하고 결과를 확인하는 부분이다.
Human UI가 CLI에 포함될 수 있지만 둘은 같은 개념이 아니다.

```text
cli.ts
  → Goal 입력                         [Human Interface]
  → planTask() / Planning              [Application]
  → TaskContract 표시                 [Human Interface]
  → Approve / Reject                  [Human Interface]
  → executeTask() / Execution          [Application]
  → Result 표시                       [Human Interface]
```

CLI는 두 use-case를 연결하는 adapter다. Planning과 Execution application은
서로 직접 의존하지 않으며, 승인 입력이나 terminal 출력에 의존하지 않는다.

## 4. pnpm dev의 의미

`pnpm dev`는 고정적으로 개발 서버 실행을 의미하지 않는다.
`package.json`의 `scripts.dev`에 등록된 명령을 실행한다.
현재 프로젝트의 명령은 다음과 같다.

```json
"dev": "TSX_TSCONFIG_PATH=./tsconfig.json tsx src/cli/cli.ts"
```

따라서 이 프로젝트에서는 AI Workspace의 terminal entry point를 실행한다.
입력 인자가 없으면 입력 부족 오류로 종료하며, 서버를 시작하지 않는다.

현재 사용 경로:

```sh
# Goal → Planning → Approval → Execution
pnpm dev . "README 설명을 더 명확하게 수정해줘"

# Planning 결과만 확인
pnpm plan . "README 설명을 더 명확하게 수정해줘"

# 기존 v0 TaskContract JSON 실행 경로
pnpm dev execute tasks/example.json .
```

`plan` 모드는 Execution을 시작하지 않는다. 명시적 `execute` 모드는 사람이 준비한
TaskContract를 실행하는 기존 경로이며, v1의 Goal 기반 승인 flow와 구분한다.

## 5. CLI 내부 책임 분리

현재 CLI는 다음 구조를 사용한다. 테스트는 관련 구현과 함께 배치한다.

```text
src/
├─ cli/
│  ├─ cli.ts
│  ├─ commands/
│  │  ├─ plan.ts
│  │  └─ execute.ts
│  └─ prompts/
│     └─ approve-task.ts
└─ application/
   ├─ planning/
   └─ execution/
```

- `commands/`: 입력을 use-case 인자로 변환하고 application을 호출한다.
  `plan.ts`는 GoalSpec 생성/검증과 PlanningResult 반환을 담당한다.
- `prompts/`: Human에게 입력과 선택을 받는다.
  현재 `approve-task.ts`가 TaskContract 출력과 승인 입력을 함께 처리한다.
- `cli.ts`: terminal flow 연결, 결과 출력, exit code 처리를 담당한다.
- `application/`: 실제 Planning / Execution logic을 소유한다.

필요한 interaction과 출력 책임이 커질 때 다음 구성을 확장 후보로 사용할 수 있다.
아래의 `ask-goal.ts`와 `presenters/task-contract.ts`는 현재 구현된 파일이 아니다.

```text
cli/
├─ cli.ts
├─ commands/
│  ├─ plan.ts
│  └─ execute.ts
├─ prompts/
│  ├─ ask-goal.ts
│  └─ approve-task.ts
└─ presenters/
   └─ task-contract.ts
```

`presenters/`는 application 결과를 Human이 읽을 수 있게 표현하는 책임이다.
현재는 CLI와 승인 prompt, Execution command에 출력 코드가 있으며,
별도 presenter 계층을 미리 만들 필요는 없다.
CLI 구조 정리를 이유로 application logic을 cli 폴더로 이동하지 않는다.

## 6. v1 기준 전체 흐름

```text
pnpm dev <repository> "<objective>"
  ↓
cli.ts → Human Goal 입력
  ↓
runPlanCommand() → planTask()
  ↓
Repository inspection → Planner / Planning Loop
  ↓
TaskDraft → Harness buildTaskContract() → TaskContract
  ↓
TaskContract 표시 → Human Approval
  ├─ Reject → 종료
  └─ Approve
       ↓
     runExecuteCommand() → executeTask()
       ↓
     Worker → Verification → Result 출력
```

v0에서는 Human이 TaskContract를 직접 작성했다면,
v1에서는 Human의 입력 수준이 Goal로 올라간다.

```text
v0: Human → TaskContract → Execution
v1: Human → Goal → Planning → TaskContract → Human Approval → Execution
```

현재 CLI는 완료된 `PlanningResult.task`를 메모리에서 그대로 Execution에 전달한다.
전달을 위해 TaskContract를 파일에 저장했다가 다시 읽는 우회 경로는 사용하지 않는다.
Planning 실패나 integration error가 발생하면 Execution을 시작하지 않는다.

## 7. 왜 Human Approval이 필요한가

Planning Agent의 complete decision은 실행 허가가 아니다.
TaskContract는 AI의 판단을 Harness가 검증하고 Human constraints를 보존하여 확정한 제안이며,
Goal 기반 flow에서 최종 실행 권한은 Human에게 있다.

```text
AI Planning → Proposed TaskContract → Human Approval → Execution
```

최소 v1에는 Approve / Reject 두 선택지만 있으면 충분하다.
현재 prompt는 TaskContract 전체를 표시하고, 앞뒤 공백과 대소문자를 정리한 입력이
`approve`일 때만 Execution을 시작한다. Reject, 빈 입력, 다른 입력, EOF는 승인하지 않는다.

Revise, re-plan, advanced approval policy는 향후 확장 후보이며 현재 구현되어 있지 않다.
이 승인은 Task 실행 경계다. 최종 Merge / Release에 대한 Human 권한은 별도 경계로 유지한다.

## 8. v0~v5에서 CLI / Human UI의 발전

v0 Execution과 v1 Goal-based Planning / Approval flow는 현재 구현되어 있다.
아래 v2~v5는 planned evolution이며, 현재 실행 가능한 기능이나 확정된 구현 구조를 의미하지 않는다.

### v0 — Reliable Worker

하나의 Agent가 제한된 작업을 안전하게 수행한다.
CLI는 `TaskContract → Worker → Verification → Result`의 기본 로그와 결과를 보여준다.
Workspace 생성, Worker 완료, Changed Paths, Verification 상태가 주요 정보다.

### v1 — Goal-to-Task Planning

`Goal → Repository 기반 TaskContract 생성 → Approval → Execution`을 연결한다.
Human UI는 Goal 입력, TaskContract 표시, Approve / Reject를 제공한다.
현재 구현 범위가 이 단계이며, Goal은 argument로 받고 Approval은 terminal 입력으로 받는다.

### v2 — Independent Agent Opinions (Planned)

두 전문 Agent가 독립 판단한 결과를 각각 보여주는 방향이다.
새로운 interaction보다 Agent별 Recommendation / Reason presenter가 중요하다.

```text
[Frontend Agent] Recommendation / Reason
[Product Agent]  Recommendation / Reason
```

### v3 — Conflict / Agreement (Planned)

두 의견의 Agreement, Conflict, Uncertainty를 구조화하여 비교한다.
Human이 일치점과 충돌을 CLI에서 구분해서 확인할 수 있어야 한다.

### v4 — CEO Decision (Planned)

CEO가 두 의견을 종합한 최종 Decision, Reason, Final TaskContract를 설명한다.
v1의 승인 경계를 재사용하여 Human이 CEO Decision을 Approve / Reject하는 방향이다.
현재 CEO integration이나 해당 승인 화면은 구현되어 있지 않다.

### v5 — Single Agent vs Multi-Agent (Planned)

CLI를 실험 결과 비교 인터페이스로 확장한다.
Single Agent와 Multi-Agent의 success, changed files, verification, time, cost를 표시하고,
scope precision, cost efficiency, conflict detection 등을 비교하는 방향이다.
이 단계에는 experiment result / telemetry presenter가 필요할 수 있다.
현재 이 비교 기능과 metrics 수집이 구현되어 있다는 뜻은 아니다.

## 9. CLI 구현 전략

CLI 전체를 지금 한 번에 완성하지 않는다.
버전이 발전하면서 실제 필요한 interaction과 presenter만 추가한다.

```text
v0 → 기본 로그
v1 → Goal / Approval
v2 → Agent Opinion Presenter
v3 → Conflict / Agreement Presenter
v4 → CEO Decision + Human Approval 재사용
v5 → Experiment / Metrics Presenter
```

Fancy TUI, Web Dashboard, 복잡한 상태 UI는 현재 범위에 필요하지 않다.
역할이 실제로 생길 때 출력이나 prompt를 분리하며, 미래 로드맵만을 이유로
새 framework나 상위 workflow/orchestrator 계층을 만들지 않는다.

## 10. 장기적인 인터페이스 경계

Application layer는 UI에 의존하면 안 된다.
장기적으로 여러 interface가 동일한 application logic을 호출할 수 있어야 한다.

```text
CLI           ┐
Web UI        ├→ application/planning
API           ├→ application/execution
Agent Runtime ┘
```

현재 CLI는 AI Workspace의 첫 번째 Human Interface다.
Web UI / API adapter는 향후 선택지이며 현재 구현된 인터페이스로 가정하지 않는다.
인터페이스마다 입력·표현·승인 방식은 달라도 use-case의 책임은 application에 남긴다.
AI 호출 주체가 추가되더라도 Human Governance 경계를 우회하는 권한을 주지 않는다.
