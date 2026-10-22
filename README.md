# AI Workspace

AI Workspace는 개발자와 기존 AI Coding Agent가 실제 Git Repository에서 함께 일하기 위한
Agent Development Environment(ADE)이자 Development Governance Harness다. 개발자와 팀의
작업 방식·권한·검증 규칙을 코드화하여 실행 범위, Context, Evidence, Human approval을 통제한다.
현재 operator interface는 Node.js CLI로 제공된다. 최종 목표는 CEO가 여러 전문 AI 직원의 의사결정과
상세 설계·구현·테스트·리뷰를 관리하고 Human이 승인과 Evidence로 통제하는 AI Development Organization이다.

현재 다음 흐름이 구현되어 있다.

- **v0 — Safe Execution**: TaskContract JSON을 isolated Git worktree에서 실행하고 Scope / Verification /
  Evidence와 binary patch·결과를 보존한다. Human Review와 승인 기반 Apply / Commit / Push, Delete / Keep을 제공한다.
- **v1 — Goal-to-Task Planning**: 자연어 Goal을 repository inspection과 Adaptive Planning으로
  TaskContract로 변환하고, Human Task Approval 뒤 단일 Codex Worker로 실행한다.
- **v2 — Governed Independent Decision**: 같은 Snapshot / Goal과 명시적 Context 아래 Frontend / UX
  Specialist를 Codex로 순차 독립 실행하고 구조화된 AgentDecision과 Evidence를 검증·표시한다.
- **v3 — Structured Decision Comparison**: 독립 AgentDecision을 Concern 단위로 비교해
  Agreement / Conflict / Trade-off와 Uncertainty / Limitation / Separate Concern을 구조화하고,
  원본 Specialist / Evidence reference를 검증한다.

Agent discussion / synthesis / CEO / Coordinator, 공유 메모리, 자동 retry와 dependency 설치는
미구현이다. Agents SDK integration, OPA, Temporal / Restate 등 외부 후보도 현재 도입되어 있지 않다.

문서는 다음 책임으로 나눈다.

- [Project direction](docs/project-direction.md): 왜 만드는가 — North Star와 설계 판단 기준
- [Architecture](docs/architecture.md): 어떻게 구성되는가 — 현재 구현과 목표 책임 경계
- [Roadmap](docs/roadmap.md): 어디로 가는가 — 구현 상태와 v4 이후 검증 단계
- [CLI / Human interface](docs/cli-and-human-interface.md): 사람이 현재 어떻게 조작하는가

**v4 — CEO Governance / AI Organization Orchestration은 진행 중이며 전체 Workflow는 미완성**이다.
Authority / Staffing schema, Invocation Eligibility Evaluation, CEO propose / inspect / escalate protocol과
Snapshot 기반 Staffing Context Discovery / 추가 Inspection 및 공통 repository-inspection 재사용이 구현되어 있다.
CEO Adapter / Staffing Loop, Proposal Finalization, Human Staffing Approval / Scope 발급과 실제
Authorization·Specialist 실행 연결은 아직 없다.

목표 Workflow는 **Phase A — Decision & Approval**과 **Phase B — Detailed Design & Execution**으로 나뉜다.
CEO가 Specialist 판단을 종합해 해결 방향에 대한 Human 승인을 받은 뒤에도 업무를 분해·배치하고,
여러 직원의 설계·개발·검증과 재작업·재배치·진행 평가를 관리하여 Executive Report까지 연결한다.
현재 v2 Specialist는 read-only Decision Agent이며, 다중 Writing Worker·병렬 실행·Worktree 통합은 미구현이다.
Workflow Runtime은 **LangGraph.js 채택 확정 / 설치·통합 미구현**이고 기존 Codex 실행과 v0–v3 API를 재사용한다.

LangGraph.js는 workflow 실행 메커니즘을 맡고 Authority / Context / Evidence / 승인 정책은 Harness가
소유한다. 별도 채택 평가·선행 Runtime Spike 없이 v4 구현 과정에서 통합·검증한다.
판단 기준은 [Project Direction](docs/project-direction.md#build-vs-adopt), 책임 경계는
[Architecture](docs/architecture.md#5-target-responsibility-model), 순서는
[Roadmap](docs/roadmap.md#v4--ceo-governance--ai-organization-orchestration)에 둔다.

아래는 지금 사용할 수 있는 기능과 사용법이다.

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

인자 없이 실행하면 workflow를 선택한다. 제목은 한 번만 표시한다.

```text
AI Workspace

Select workflow:

1. Plan & Execute
2. Plan only
3. Decision
4. Execute existing task

>
```

Plan & Execute / Plan only는 Repository와 Goal을, Decision은 Repository / Decision Goal /
Context Files를 입력받는다. Context Files는 한 줄에 한 경로씩 최소 1개를 입력한 뒤 빈 줄로 마친다.
Execute existing task는 Task path와 Repository를 입력받는다.
인자를 직접 전달하면 selector를 거치지 않는다.

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

## Decision quick example

Clean Repository와 명시적 repository-relative UTF-8 text 파일이 필요하다.

```sh
pnpm decision . \
  "Evaluate the current decision architecture" \
  src/application/decision/flow/run-decision.ts \
  src/application/decision/flow/orchestration/run-independent-decisions.ts
```

Snapshot capture 후 해당 commit의 Git blob에서만 파일 내용을 읽는다. 빈 경로·absolute path·`..`
traversal, 없는 파일·directory·binary/invalid UTF-8 입력은 거부한다. Dirty Repository나 실행 전후
Snapshot drift, runtime / schema / Evidence 오류가 있으면 전체 명령이 실패하고 partial result를 표시하지 않는다.

Frontend / UX Specialist는 같은 Goal / commit과 같은 선택 파일을 각각 받고 순차 실행한다.
`read` authority는 supplied Context 읽기이며 전체 target filesystem 접근이 아니다.
다른 Specialist의 Decision을 전달하지 않고 Harness가 specialistId를 주입한다.
Evidence는 제공 파일의 exact path와 line 조건·범위를 검사한다. Schema / Evidence 검증 통과가
recommendation의 의미적 정확성을 보장하지는 않는다.

Decision command는 `runDecision()`의 실제 Goal / Snapshot SHA / 원본 AgentDecision[]을
`compareDecisions()`에 전달한다. 출력은 Snapshot, 각 Specialist의 Recommendation / Evidence /
Risks / Uncertainty, Comparison의 Findings / Gaps와 전체 Decision Duration이다. 비교 결과가 모두
비어 있으면 `Comparison: no material relationships found.`를 표시한다. Comparator의 JSON protocol과
source reference도 검증하며 실패 시 전체 명령이 실패한다.
Synthesis / final recommendation / winner / automatic resolution / persistence와 Planning·Execution
자동 연결은 없다. 이 명령은 Repository 변경,
Task Approval / Review / Apply / Commit / Push / Cleanup flow를 실행하지 않는다.
상세 입력·오류·출력은 [CLI / Human interface](docs/cli-and-human-interface.md#decision-flow)를 따른다.

### v2 실제 E2E 기록

제공된 단일 실제 interactive Codex 실행에서 관찰된 기록이다. 이번 문서 수정에서 재측정한 수치나
반복 benchmark, 성능 보장이 아니다.

| 항목 | Observed run |
| --- | --- |
| 경로 | pnpm dev → Decision → Repository: . → Decision Goal → 5 Context files → Frontend → UX → Decision output |
| Snapshot | `2d92c683e3f96329559b62c4a32b56a54b70c5b7` |
| Decision Duration | 80.3s |

이 실행은 Same Goal / Same Snapshot / Limited Context / Read-only Authority / Independent Decisions /
Structured AgentDecision / Evidence Validation / CLI integration / Actual Codex execution이 연결됨을 확인했다.
다른 작업·모델·환경에서의 성공률, 판단 품질이나 Multi-Agent 우위를 입증하지 않는다.

### v3 automated E2E coverage

Automated Decision CLI E2E는 explicit / interactive 입력에서 Frontend → UX → Comparator와
Comparison presentation 연결, 동일 commit SHA, Decision 전달 구조, Comparator Context의 files 부재,
Specialist 간 isolation, Repository unchanged와 Evidence 실패 시 fail-fast를 확인한다.
Command unit test는 동일 Goal / Decision 배열의 identity와 Comparison 실패 전파도 확인한다.

이 자동 E2E는 deterministic fake Codex executable을 사용한다. 실제 모델의 Comparison 품질을
평가하는 benchmark가 아니며, 별도 외부 프로젝트의 반복 Real Codex Comparison 품질 관찰은
이번 closeout에 기록하지 않는다. Relation / rationale / statement의 의미적 정확성은 Harness의
구조·참조 검증으로 증명되지 않는다. 구현 범위와 남은 평가는 [Roadmap](docs/roadmap.md#v3--agreement--conflict--structured-decision-comparison)에 둔다.

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

Execution 종료 후에도 workspace는 유지된다. Review는 항상 실행되며 workspace path,
changed paths, 실제 diff, patch artifact 위치, 존재하는 Worker Result를 표시한다.
`Continue / Abort`로 확인 완료 여부를 받고, Continue 및 Execution / Verification 성공과
patch 보존이 확인된 경우에만 Delivery를 진행한다.

| 단계 | Human 선택 | 현재 안전 조건 / 결과 |
| --- | --- | --- |
| Task Approval | Approve / Reject | Goal flow에서 Approve 전에는 Execution 없음 |
| Review | Continue / Abort | Abort·Review 실패 시 Apply / Commit / Push 없음 |
| Apply | Apply / Skip | Dirty 원본 차단. `git apply --check` 후 적용. Force / 3way / reset / stash 없음 |
| Commit | Commit / Skip | 유효한 Conventional Commit 메시지 필요. changedPaths만 stage, 기존 staged 변경 차단 |
| Push | Push / Skip | Detached HEAD 차단, delivery commit과 HEAD 일치 확인, 기존 remote upstream에만 일반 push |
| Cleanup | Delete / Keep | Abort·Delivery 실패 후에도 별도 선택. Worktree만 Delete, artifacts는 유지 |

Task Approval ≠ Change Review ≠ Apply Approval ≠ Commit Approval ≠ Push Approval ≠ Cleanup Decision.
Commit Skip은 working tree 변경을, Push Skip·실패는 local commit을 유지한다.
Cleanup Keep·실패나 Delivery 결과가 이미 성공한 Execution의 `passed`를 바꾸지 않는다.
상세 interaction과 실제 CLI 파일 책임은 [CLI / Human interface](docs/cli-and-human-interface.md)를 참조한다.

Commit message는 다음 형태를 사용한다. Subject는 비어 있으면 안 되며 newline은 허용하지 않는다.
Invalid message는 자동 보정하지 않고 Commit을 차단한다. Upstream 자동 생성과 force push는 하지 않는다.

```text
feat: ...
fix(scope): ...
docs: ...
refactor: ...
perf: ...
test: ...
chore: ...
```

### Goal-based Action Governance 흐름

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
`src/cli/cli.ts`를 허용하지 않는다.

범위 검사는 파일 쓰기를 사전에 차단하는 기능이 아니다. Worker와 Verification 실행
후 시작 commit 대비 실제 변경 경로를 수집해 위반을 탐지한다. 위반한 변경도 결과
patch에는 남을 수 있으므로 사람이 반드시 검토해야 한다.

## Execution 실행 결과

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
- Codex Specialist 기본 timeout: 각 15분
- Codex Comparator 기본 timeout: 15분 (현재 Decision CLI에는 두 runtime의 override 입력 없음)
- 각 Verification command 기본 timeout: 5분

아래 환경변수와 patch / cleanup 설명은 Execution에 한정한다. Specialist / Comparator 실패는 Decision command 전체를
reject하며 임시 cwd를 제거하고, Decision patch나 artifact를 만들지 않는다.

Execution CLI에서 millisecond 단위로 override하려면
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
- 자동 E2E 테스트는 PATH에 가짜 `codex` 실행 파일을 제공한다. 실제 Codex 인증, 모델 동작,
  네트워크, prompt 준수, 실제 프로젝트의 build 환경을 검증하는 테스트가 아니다.
- 첫 실제 적용에서는 버려도 되는 branch와 Repository 복제본으로 Task scope, 검증 명령,
  timeout, patch 적용 가능성을 먼저 확인해야 한다.
