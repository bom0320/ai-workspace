# AI Workspace

AI Workspace는 제한된 Task Contract를 실제 Git Repository에서 안전하게 실행하고,
변경과 검증 결과를 사람이 검토할 수 있는 형태로 남기는 Node.js CLI 도구다.

현재 v0는 하나의 Codex Worker를 격리된 Git worktree에서 실행하는 흐름만 제공한다.
Task 로딩, Repository 확인, Worker 실행, 경로 범위 검사, 검증 명령 실행,
binary patch 및 실행 결과 보존, worktree 정리를 지원한다. CEO Agent, 멀티에이전트,
공유 메모리, 자동 재시도, 자동 dependency 설치는 구현되어 있지 않다.

자세한 구조와 설계 원칙은 [docs/architecture.md](docs/architecture.md)를 참고한다.

## 사전 준비

- Node.js와 pnpm
- Git과 하나 이상의 commit이 있는 대상 Repository
- PATH에서 실행할 수 있고 인증이 완료된 `codex` CLI
- 대상 Repository의 검증 명령이 요구하는 도구와 dependency

새 worktree에는 원본 작업 디렉터리의 `node_modules`, `.env`, ignored 파일이 자동으로
복사되지 않는다. Task의 검증 명령이 이 파일을 필요로 한다면 실행 전에 Repository가
worktree 자체에서 사용할 수 있는 준비 방법을 별도로 마련해야 한다. AI Workspace는
dependency 설치나 secret 복사를 자동으로 수행하지 않는다.

## 실행

```sh
pnpm install
pnpm dev ./tasks/example.json /absolute/path/to/target-repository
```

첫 번째 인자는 TaskContract JSON이고 두 번째 인자는 local Git Repository 경로다.
CLI는 원본 Repository의 HEAD에서 detached worktree를 만들며 원본 작업 디렉터리를
직접 수정하지 않는다.

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
- `result.json`: Evidence, Scope, Verification, 실패, 보존 경로를 포함한 최종 결과

CLI가 출력하는 `Run Artifacts` 경로에서 결과를 확인할 수 있다. patch 보존에 실패하면
worktree를 삭제하지 않고 `Execution Workspace retained` 경로를 출력한다. cleanup이
실패한 경우에도 같은 경로를 결과와 CLI에 남긴다.

## Patch 검토와 수동 적용

먼저 적용 대상 Repository가 기준 commit을 알고 있는지 확인하고 patch 적용 가능성을
검사한다. 깨끗한 별도 branch 또는 worktree에서 수행하는 것을 권장한다.

```sh
git cat-file -e "$(cat /path/to/run/base-commit.txt)^{commit}"
git apply --check /path/to/run/changes.patch
git apply --binary /path/to/run/changes.patch
git diff --check
```

`git apply --check`는 현재 checkout에 patch를 적용할 수 있는지만 확인한다. 실제 적용은
자동으로 수행되지 않으며, 적용 후 diff와 프로젝트 검증 명령을 다시 실행하고 사람이
commit 여부를 결정해야 한다. patch는 Worker가 만든 commit의 최종 파일 상태를
보존하지만 commit history와 metadata는 보존하지 않는다.

## Timeout

- Codex Worker 기본 timeout: 15분
- 각 Verification command 기본 timeout: 5분

CLI에서 millisecond 단위로 override하려면
`AI_WORKSPACE_WORKER_TIMEOUT_MS`와 `AI_WORKSPACE_VERIFICATION_TIMEOUT_MS` 환경변수를
사용한다. 테스트와 직접 API 사용에서도 짧은 timeout을 주입할 수 있다. timeout 시 일반
실패와 구분되는 메시지를 기록하고, macOS/Linux에서는 독립 process group에 SIGTERM을
보낸 뒤 종료되지 않은 하위 프로세스까지 SIGKILL한다. 종료 처리가 끝난 다음 변경을
수집하고 patch를 보존하며 worktree cleanup을 진행한다. Windows에서는 하위 process
tree 전체 종료가 동일하게 보장되지 않는다.

## v0의 판단 범위와 제한

- `passed: true`는 Scope 검사와 구성된 Verification command가 통과했다는 뜻이다.
  자연어 objective와 acceptance criteria가 실제로 충족됐음을 보장하지 않는다.
- ignored 파일, 빈 디렉터리, Worker commit history는 patch에 보존하지 않는다.
- 실행 환경 준비, dependency 설치, `.env`와 secret 전달은 자동화하지 않는다.
- retry, rollback, patch 자동 적용, commit, push, merge는 수행하지 않는다.
- E2E 테스트는 PATH에 가짜 `codex` 실행 파일을 제공한다. 실제 Codex 인증, 모델 동작,
  네트워크, prompt 준수, 실제 프로젝트의 build 환경을 검증하는 테스트가 아니다.
- 첫 실제 적용에서는 버려도 되는 branch와 Repository 복제본으로 Task scope, 검증 명령,
  timeout, patch 적용 가능성을 먼저 확인해야 한다.
