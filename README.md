# AI Workspace

AI Workspace는 제한된 Task Contract를 Git Repository에서 안전하게 실행하고,
변경과 검증 결과를 검토용으로 남기는 Node.js CLI 도구다.

현재 v1은 자연어 Goal을 TaskContract로 만드는 Planning과 하나의 Codex Worker를
격리된 Git worktree에서 실행하는 흐름을 제공한다. 기존 v0의 TaskContract JSON 실행도
유지한다. Repository 조사, Adaptive Planning, 경로 범위 검사, 검증 명령 실행,
binary patch 및 실행 결과 보존에 이어 Human Review와 승인 기반 Apply / Commit / Push,
workspace Delete / Keep을 지원한다. CEO Agent, 멀티에이전트, 공유 메모리,
자동 재시도, 자동 dependency 설치는 구현되어 있지 않다.

자세한 구조와 설계 원칙은 [docs/architecture.md](docs/architecture.md)를 참고한다.

## 사전 준비

- Node.js와 pnpm
- Git과 하나 이상의 commit이 있는 대상 Repository
- PATH에서 실행할 수 있고 인증이 완료된 `codex` CLI
- 대상 Repository의 검증 명령이 요구하는 도구와 dependency

원본 Repository에 설치된 `node_modules`가 있으면 worktree에서 symlink로 재사용한다.
없으면 dependency를 설치하지 않으므로 검증에 필요한 dependency는 미리 준비해야 한다.
`.env`와 다른 ignored 파일은 자동으로 복사하지 않는다. AI Workspace는 dependency
설치나 secret 복사를 자동으로 수행하지 않는다.

## 실행

```sh
pnpm install
pnpm dev
```

인자 없이 실행하면 Repository path와 Goal을 terminal에서 입력받는다.
인자로 전달하거나 Planning 결과만 확인할 수도 있다.

```sh
pnpm dev . "README.md의 소개 문구를 더 명확하게 수정해줘"
pnpm plan . "README.md의 소개 문구를 더 명확하게 수정해줘"
```

기존 v0의 명시적 TaskContract JSON 실행은 `execute` command로 제공한다.

```sh
pnpm dev execute ./tasks/example.json /absolute/path/to/target-repository
```

Worker는 원본 Repository의 HEAD에서 만든 detached worktree에서 실행된다.
원본 작업 디렉터리 반영은 실행 후 별도의 Apply 승인으로만 진행한다.

## Adaptive Planning / Fast Path

기존 Planning은 단순한 작업에서도 Codex Planner를 호출했다. 현재는 Repository overview를
수집하고 `inspectInitialFiles()`로 Goal에 명시된 파일을 exact-match inspection한 뒤,
보수적인 trivial task detection을 수행한다.

```text
Goal
↓
Repository inspection
↓
Initial exact-match inspection
↓
Trivial task detection
├─ YES → Fast Path TaskDraft → TaskContract
│          rounds = 0, Planner LLM 호출 = 0
└─ NO  → 기존 Planning Loop → Codex Planner → inspect / complete
```

Fast Path는 모든 자연어를 이해하려 하지 않고, 확실한 textual edit만 처리한다.
예를 들어 `README.md의 소개 문구를 수정해줘`, `README의 오타를 수정해줘`,
`notes.txt의 문구를 수정해줘`가 대상이다. 복잡하거나 모호한 요청은 기존 Planner로
fallback한다. `README 좀 더 정확하게 수정해줘`처럼 구체적인 textual edit 의도가
불명확한 요청도 fallback한다.

- 대상은 `.md`, `.txt`이며 initial inspection 결과가 정확히 한 파일이어야 한다.
- 파일명은 실제 Repository 파일과 일치해야 하며 basename ambiguity를 방지한다.
- `../README.md`, `..\README.md` 같은 traversal 표현은 Fast Path에서 차단한다.
- 삭제, 이동, rename, 코드 구현·리팩토링·dependency·API·설정 변경은 대상으로 삼지 않는다.
- False positive보다 false negative를 허용한다. 애매하면 Planner를 사용한다.

Fast Path도 기존 `buildTaskContract()`를 사용해 Harness ID와 Human constraints를 보존하고
최종 schema validation을 수행한다. Planning limits와 inspection safety 검사는 유지한다.
Fast Path의 verification은 `git diff --check`이며, 일반 작업은 TaskContract에 지정된
verification command를 Harness가 실행한다.

### E2E 측정

초기 E2E와 Fast Path 적용 후 해당 trivial README edit E2E에서 관찰한 값이다.
동일한 조건의 반복 benchmark나 모든 작업에 대한 성능 보장을 의미하지 않는다.

| 항목 | 초기 E2E | Fast Path E2E |
| --- | ---: | ---: |
| Planning | 53.7s | 0.0s |
| Approval Wait | — | 6.4s |
| Workspace | — | 0.1s |
| Worker | 167.0s | 13.4s |
| Verification | 17.5s | 0.0s |
| Cleanup | — | 0.0s |
| Total | 265.1s | 20.0s |

Fast Path 측정의 Planning rounds와 Planner calls는 모두 0이다. Planning은
53.7s → 0.0s, Total은 265.1s → 20.0s로 약 92% 감소했다. 초기 병목은 반복되는
Planning LLM 호출과 Worker의 Codex process였으며, workspace 생성·cleanup 같은
Harness 자체 비용은 작았다. Worker 시간 감소 전체를 Fast Path만의 효과로 보지는 않는다.

`Approval Wait`는 Human interaction 시간이며 순수 자동 처리 시간과 구분한다.
현재 CLI의 Total에는 Review·Delivery·Cleanup 결정 대기도 포함된다. 위 수치는 관찰된
실행의 기록이며 모델·작업·verification command·사람의 응답 시간에 따라 달라진다.
`0.0s`는 CLI 표시 정밀도에 따른 값이다.

## Review와 Post-Execution Delivery

Workspace lifecycle은 Execution lifecycle과 분리되어 있다.

```text
create → execute → verify → preserve evidence → review → delivery → cleanup
```

Execution이 끝나도 worktree를 바로 제거하지 않는다. Review는 선택 여부를 묻지 않고
항상 실행되며 Workspace path, Changed Paths, 실제 workspace diff, Patch artifact 위치,
Worker Result가 있으면 그 내용을 자동으로 보여준다. Diff는 실행 시작 commit 기준으로
Worker commit과 새 파일도 포함하며 64KiB로 출력이 제한된다. Worker output은 16KiB로
제한되며 전체 변경은 살아 있는 workspace와 patch artifact에서 확인할 수 있다.

Review 이후 `Continue / Abort`를 받는다. Continue는 Delivery 진행을 허용하고,
Abort는 원본 반영과 Commit / Push를 모두 건너뛴다. Execution·Verification 성공과 patch
보존이 확인된 경우에만 Apply가 가능하다. Review 실패 시에도 Delivery를 진행하지 않는다.

각 Human decision은 서로 다른 단계다.

```text
Task Approval ≠ Change Review ≠ Apply Approval
              ≠ Commit Approval ≠ Push Approval ≠ Cleanup Decision
```

### Apply

`Apply / Skip`을 받으며 verified `changes.patch`를 사용한다. 원본 Repository에
staged·unstaged·untracked 변경이 있으면 차단한다. `git apply --check` 성공 후에만
`git apply`를 실행하며 force, `--3way`, reset, stash fallback은 사용하지 않는다.

### Commit

Apply 성공 후 `Commit / Skip`을 받는다. Commit을 선택하면 메시지를 입력받고
`type: subject` 또는 `type(scope): subject` 형식을 검사한다. 허용 type은 다음과 같다.

```text
feat: ...
fix(scope): ...
docs: ...
refactor: ...
perf: ...
test: ...
chore: ...
```

Subject는 비어 있으면 안 되며 newline은 허용하지 않는다. Invalid message는 자동 보정하지
않고 Commit을 차단한다. Execution의 `changedPaths`만 stage하며 `git add .`는 사용하지
않는다. 기존 staged changes가 있으면 차단한다. Skip하면 적용된 변경을 working tree에 유지한다.

### Push

Commit 성공 후 `Push / Skip`을 받는다. Detached HEAD를 차단하고 현재 HEAD가 방금 생성한
Delivery commit인지 확인한다. 기존 remote upstream이 확인된 경우에만 해당 branch에
일반 push를 수행한다. Force push나 upstream 자동 생성은 하지 않는다.
Skip하거나 Push가 실패하면 local commit은 유지된다.

### Cleanup

Review·Delivery가 끝나면 `Delete / Keep`을 받는다. Review Abort나 Delivery 실패 후에도
별도로 결정한다. Delete는 execution worktree만 제거하고, Keep은 workspace를 유지한다.
Artifacts는 어느 선택에서도 유지한다. Cleanup 실패 시 workspace 경로를 출력한다.

Review Abort, Delivery Skip·실패, Cleanup Keep·실패는 이미 완료된 Execution의 `passed`를
false로 바꾸지 않는다. ExecutionResult와 Review / Delivery / Cleanup 결과는 구분한다.

### 전체 흐름

```text
Natural Language Goal
↓
Repository Inspection
↓
Adaptive Planning
├─ Fast Path → TaskContract
└─ Codex Planner → TaskContract
↓
Human Task Approval
↓
Isolated Git Worktree
↓
Codex Worker
↓
Scope + Verification
↓
Preserve Evidence
↓
Human Review
├─ Abort → Delivery Skip
└─ Continue
     ↓
   Apply / Skip
     ↓ (applied인 경우만)
   Commit / Skip
     ↓ (committed인 경우만)
   Push / Skip
↓
Delete / Keep Workspace
```

Task Approval을 Reject하면 Execution을 시작하지 않는다. Scope·Verification·artifact 보존이
실패하면 Delivery는 진행하지 않으며, 생성된 workspace의 cleanup은 별도로 결정한다.

## TaskContract 예시

```json
{
  "id": "task-example-001",
  "goalId": "goal-example-001",
  "objective": "Add a focused TaskContract validation test",
  "targetRepository": "ai-workspace",
  "allowedPaths": [
    "src/contracts/task.ts",
    "src/contracts/task.test.ts"
  ],
  "forbiddenPaths": ["docs/architecture.md", "README.md"],
  "constraints": ["Do not add dependencies"],
  "acceptanceCriteria": ["The focused validation test passes"],
  "verification": [
    "pnpm typecheck",
    "pnpm exec vitest run src/contracts/task.test.ts"
  ]
}
```

`allowedPaths`와 `forbiddenPaths`는 Repository 상대 경로의 정확한 문자열 일치만
지원한다. glob, 정규식, directory prefix는 지원하지 않는다. 예를 들어 `src/`는
`src/cli.ts`를 허용하지 않는다.

범위 검사는 파일 쓰기를 사전에 차단하는 기능이 아니다. Worker와 Verification 실행
후 시작 commit 대비 실제 변경 경로를 수집해 위반을 탐지한다. 위반한 변경도 결과
patch에는 남을 수 있으므로 사람이 반드시 검토해야 한다.

## 실행 결과

기본 결과 위치는 CLI를 실행한 디렉터리 아래다.

```text
.ai-workspace/runs/run-*/
├── task.json
├── base-commit.txt
├── changes.patch
└── result.json
```

- `task.json`: 실행에 사용한 TaskContract
- `base-commit.txt`: patch를 생성한 기준 commit SHA
- `changes.patch`: 기준 commit 대비 최종 변경을 담은 binary Git patch
- `result.json`: Evidence, Scope, Verification, Execution 실패, telemetry, artifact 및
  `workspace.path`를 포함한 Execution 완료 시점의 결과

CLI가 출력하는 `Run Artifacts` 경로에서 결과를 확인할 수 있다. Workspace는 실제 AI 작업용
Git worktree이며 Delete할 수 있다. Artifacts는 영구 실행 evidence로, workspace cleanup
후에도 유지된다. `result.json`은 Execution 시점의 snapshot이며 이후 Review / Delivery /
Cleanup 결과를 저장하는 파일은 아니다. 따라서 저장된 workspace 경로가 Delete 이후에도
남을 수 있다. Patch 보존에 실패하면 Apply를 차단하며 workspace cleanup은 별도로 결정한다.

## Patch 검토와 수동 적용

먼저 적용 대상 Repository가 기준 commit을 알고 있는지 확인하고 patch 적용 가능성을
검사한다. 깨끗한 별도 branch 또는 worktree에서 수행하는 것을 권장한다.

```sh
git cat-file -e "$(cat /path/to/run/base-commit.txt)^{commit}"
git apply --check /path/to/run/changes.patch
git apply --binary /path/to/run/changes.patch
git diff --check
```

CLI Delivery를 Skip했거나 artifact를 나중에 적용할 때 사용할 수 있는 경로다.
`git apply --check`는 현재 checkout에 patch를 적용할 수 있는지만 확인한다. 위 명령은
사용자가 직접 실행하며, 적용 후 diff와 프로젝트 검증 명령을 확인하고 commit 여부를 결정한다.
CLI에서도 명시적 Apply 승인 없이는 적용하지 않는다. patch는 Worker가 만든 commit의 최종 파일 상태를
보존하지만 commit history와 metadata는 보존하지 않는다.

## Timeout

- Codex Worker 기본 timeout: 15분
- 각 Verification command 기본 timeout: 5분

CLI에서 millisecond 단위로 override하려면
`AI_WORKSPACE_WORKER_TIMEOUT_MS`와 `AI_WORKSPACE_VERIFICATION_TIMEOUT_MS` 환경변수를
사용한다. 테스트와 직접 API 사용에서도 짧은 timeout을 주입할 수 있다. timeout 시 일반
실패와 구분되는 메시지를 기록하고, macOS/Linux에서는 독립 process group에 SIGTERM을
보낸 뒤 종료되지 않은 하위 프로세스까지 SIGKILL한다. 종료 처리가 끝난 다음 변경을
수집하고 patch를 보존한다. 생성된 worktree의 Delete / Keep은 CLI에서 별도로 결정한다. Windows에서는 하위 process
tree 전체 종료가 동일하게 보장되지 않는다.

## v0 / v1의 판단 범위와 제한

- `passed: true`는 Scope 검사와 구성된 Verification command가 통과했다는 뜻이다.
  자연어 objective와 acceptance criteria가 실제로 충족됐음을 보장하지 않는다.
- ignored 파일, 빈 디렉터리, Worker commit history는 patch에 보존하지 않는다.
- 실행 환경 준비, dependency 설치, `.env`와 secret 전달은 자동화하지 않는다.
- retry, rollback, 승인 없는 patch 적용·commit·push, 자동 merge는 수행하지 않는다.
- E2E 테스트는 PATH에 가짜 `codex` 실행 파일을 제공한다. 실제 Codex 인증, 모델 동작,
  네트워크, prompt 준수, 실제 프로젝트의 build 환경을 검증하는 테스트가 아니다.
- 첫 실제 적용에서는 버려도 되는 branch와 Repository 복제본으로 Task scope, 검증 명령,
  timeout, patch 적용 가능성을 먼저 확인해야 한다.
