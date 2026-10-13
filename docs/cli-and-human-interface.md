# CLI and Human Interface

이 문서는 사람이 현재 Harness를 어떻게 관찰하고 조작하는지 설명한다.
실행 준비·TaskContract 예시·artifact 사용법은 [README](../README.md), 내부 책임 경계는
[Architecture](architecture.md), 미래 단계는 [Roadmap](roadmap.md)에 둔다.

## 1. CLI의 역할

> CLI is an operator/debug interface for the Harness, not the core product value.

CLI는 Goal 입력, TaskContract 표시, Approval, Review, Apply / Commit / Push,
Cleanup decision, telemetry / result 출력을 담당한다. Harness를 사람이 관찰하고 통제하는
adapter이며 Planning / Execution / Governance의 core logic을 소유하는 새로운 상위 계층은 아니다.
현재 Human gate와 후속 stage 연결은 CLI가 담당하고, 계약·실행·Git 안전 검사는 각 모듈에 남긴다.

```text
pnpm dev → src/cli/cli.ts → application use-case 호출
```

Human Interface는 웹 UI에 한정되지 않는다. 사람이 입력·판단·결과 확인을 하는 접점이며
현재는 terminal-based CLI다. `cli.ts`는 프로그램 entry이고 Human UI는 그 실행 중의 상호작용이다.
Fancy TUI나 Web UI 자체가 현재 프로젝트의 핵심 가치는 아니다.

## 2. 실행 경로

`pnpm dev`는 개발 서버라는 고정 의미가 아니라 package.json의 script를 실행한다.
현재 script는 `TSX_TSCONFIG_PATH=./tsconfig.json tsx src/cli/cli.ts`다.

```sh
# Repository path와 Goal을 interactive input으로 받기
pnpm dev

# 같은 Goal flow에 argument로 입력 전달
pnpm dev . "README.md의 소개 문구를 더 명확하게 수정해줘"

# Planning 결과만 확인; Execution과 후속 Human gate 없음
pnpm plan . "README.md의 소개 문구를 더 명확하게 수정해줘"

# 기존 v0 경로: 사람이 작성한 TaskContract JSON으로 Execution 시작
pnpm dev execute tasks/example.json .
```

Goal path / objective는 trim하고 빈 값을 허용하지 않는다. Goal 기반 flow는 Planning 실패나
Task Reject 시 Execution을 시작하지 않는다. 완료된 `PlanningResult.task`는 파일로 저장했다가
읽는 우회 없이 Execution에 전달한다. 명시적 `execute` 경로는 Planning / Task Approval을
거치지 않지만 Execution 이후 Review / Delivery / Cleanup은 동일하게 연결된다.

## 3. 현재 Human Interaction Flow

```text
Goal
→ Planning
→ TaskContract 표시
→ Approve / Reject
→ Execution in isolated worktree
→ Scope / Verification / Evidence preservation
→ Review 자동 출력
→ Continue / Abort
→ Apply / Skip
→ Commit / Skip → Commit message
→ Push / Skip
→ Delete / Keep
```

이 도식은 성공 경로다. 각 단계의 Skip·실패·승인은 다음 단계 실행 조건과 구분한다.

| Human gate | 진행 조건 / 선택의 의미 |
| --- | --- |
| Task Approval | Approve만 Worker 실행 허가. Reject·다른 입력·EOF는 실행하지 않음 |
| Review | 항상 workspace·changed paths·diff·patch 위치·존재하는 Worker Result 표시. Continue만 Delivery 진행 허가 |
| Apply | Review Continue 및 Execution·Verification 성공, patch 보존 확인 후 표시. Apply만 원본 반영 |
| Commit | Apply 성공 후 표시. Commit 선택 시 메시지 입력·검증. Skip은 working tree 변경 유지 |
| Push | Commit 성공 후 표시. Push 선택 시 기존 upstream에만 전달. Skip·실패는 local commit 유지 |
| Cleanup | Review Abort·Delivery Skip/실패 후에도 별도 결정. Delete는 workspace만 제거, Keep·다른 입력·EOF는 유지 |

승인 입력은 공백·대소문자를 정리한 지정 단어만 인정한다. Commit message는 자동 보정하지
않으며 허용된 Conventional Commit 형태를 충족해야 한다. 자세한 Delivery 안전 조건과
메시지 예시는 [README](../README.md#review와-post-execution-delivery)를 따른다.

Review는 “Review할지”를 묻는 선택 단계가 아니다. Execution 종료 후 workspace가 살아 있는
상태에서 diff를 자동 출력하고, 확인 완료 여부만 Continue / Abort로 받는다. Diff 출력은 64KiB,
Worker output은 16KiB로 제한한다. 전체 변경은 표시된 workspace나 patch artifact에서 확인한다.
Review에 필요한 workspace / base commit이 없거나 diff 조회에 실패하면 Delivery를 차단한다.
실패한 Execution도 사용 가능한 workspace를 Review할 수 있지만 원본 적용은 허용하지 않는다.

Review Abort, Apply·Commit·Push Skip/실패, Cleanup Keep/실패는 이미 성공한 Execution을
실패로 바꾸지 않는다. Cleanup 실패 시 경로를 출력하고 artifact는 삭제하지 않는다.
현재 result.json은 Execution snapshot이며 후속 Human 결정 이력 저장소는 아니다.

## 4. 현재 CLI 파일 책임

테스트는 구현 파일과 함께 배치하며 아래에서는 생략한다.

```text
src/cli/
├─ cli.ts
├─ commands/
│  ├─ plan.ts
│  ├─ execute.ts
│  ├─ delivery/
│  │  ├─ delivery.ts
│  │  ├─ apply.ts
│  │  ├─ commit.ts
│  │  └─ push.ts
│  ├─ review/
│  │  └─ review.ts
│  └─ cleanup/
│     └─ workspace-cleanup.ts
├─ prompts/
│  ├─ ask-goal.ts
│  ├─ approve-task.ts
│  ├─ apply-changes.ts
│  ├─ delivery.ts
│  ├─ review.ts
│  └─ cleanup.ts
└─ presenters/
   ├─ task-contract.ts
   └─ timing.ts
```

- `cli.ts`: interactive / argument / plan / execute 진입 경로와 Goal-based terminal flow 연결.
- `commands/plan.ts`: GoalSpec 생성·검증, `planTask()` 호출, PlanningResult 반환.
- `commands/execute.ts`: `executeTask()` 호출과 결과 출력, Review → Delivery → Cleanup 연결.
- `commands/review/`: 변경 presentation과 Review completion gate.
- `commands/delivery/`: Apply 성공 후 Commit, Commit 성공 후 Push의 승인·결과 연결.
- `commands/cleanup/`: Delete / Keep 결정에 따라 infrastructure의 worktree 제거 호출.
- `prompts/`: Human input / decision. `approve-task.ts`는 승인 입력만 담당한다.
- `presenters/`: TaskContract와 timing을 보여주며 입력·승인 판단을 하지 않는다.

현재 Review와 Execution 결과 presentation 일부는 해당 command에 있다. 모든 출력을
새 presenter로 추출하거나 구현되지 않은 파일을 미리 나열하지 않는다.
Git command는 CLI에 직접 넣지 않고 `infrastructure/git` API를 사용한다.

## 5. 관찰할 결과와 Timing

CLI는 Worker 완료, Scope / Verification 결과, changed paths, run artifact 경로를 출력한다.
Timing에는 Planning, Approval Wait, Workspace, Worker와 내부 setup / Codex process /
output processing, Verification, 실행한 Cleanup, Total이 포함될 수 있다.
수행되지 않은 단계의 값은 생략될 수 있다.

Approval Wait는 Human interaction이며 system latency와 구분한다. Goal 기반 Total은 입력 완료
이후 Review / Delivery / Cleanup의 대기도 포함한다. 개별 Human gate의 시간을 모두 따로
측정하는 것은 아니다. Execution snapshot telemetry와 CLI의 end-to-end timing은 범위가 다르다.

## 6. 인터페이스 경계

```text
CLI → Application
Application → CLI를 모름
```

`planTask()` / `executeTask()`의 실제 use-case logic은 application에 유지한다.
UI가 바뀌어도 계약과 실행 정책은 UI에 종속되지 않아야 한다. 향후 Web UI / API adapter는
같은 application logic을 사용할 수 있지만 현재 구현된 인터페이스는 아니다.
Human 권한을 새 interface가 우회하지 않아야 한다.

Revise, re-plan, 복잡한 approval policy, fancy TUI는 현재 제공하지 않는다.
Specialist / Conflict / CEO / Evaluation의 발전 계획은 이 문서에 반복하지 않고
[Roadmap](roadmap.md)에 둔다.
