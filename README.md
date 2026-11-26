# AI Workspace

AI Workspace는 개발자와 기존 AI Coding Agent가 실제 Git Repository에서 함께 일하기 위한
Agent Development Environment(ADE)이자 Development Governance Harness다. 개발자와 팀의
작업 방식·권한·검증 규칙을 코드화하여 실행 범위, Context, Evidence, Human approval을 통제한다.
현재 operator interface는 Node.js CLI로 제공된다. 최종 목표는 CEO가 여러 전문 AI 직원의 의사결정과
상세 설계·구현·테스트·리뷰를 관리하고 Human이 승인과 Evidence로 통제하는 AI Development Organization이다.

Development Organization이 현재 실행 모델의 기준이다. 각 Phase는 독립 Graph API로 제공된다.

- Phase A는 Human Goal의 해결 방향을 분석하고 승인한다. System Policy, Staffing 승인, Specialist Authorization과 읽기 전용 분석, Comparison, Assessment·Refinement, CEO Synthesis, Human Direction Review 순서로 진행한다.
- Phase B는 검증된 Handoff를 받아 Work Item을 분해·선택하고 Specialist에게 배정한다. 읽기 Assignment는 분석과 Evidence를 기록한다. 수정 Assignment는 승인된 Read Session에서 계획을 구체화하고, TaskContract Binding과 별도 Write Authorization·Claim을 거쳐 격리된 Worktree에서 구현·검증한다.
- Application은 역할별 기능을 제공하고 Workflow는 실행 순서·분기·상태를 조정한다. Governance는 승인·권한·기록 무결성을 소유하며 Runtime은 제한된 분석·계획·구현을 수행한다.
- Organization 상위 Graph, 자동 Phase 전환, Integration, Evaluation, Rework, Reporting과 Delivery 연결은 후속 범위다.

`createPhaseAGraph()`는 기본적으로 방향과 실행 위임의 동시 승인까지 진행한다. 방향 단독 승인이 필요한 경우
`directionApproval: "direction-only"`를 선택한다. 이 방식은 같은 분석·승인 경계를 거치며 완료된 Phase B Handoff를 발급하지 않는다.
Staffing·Refinement 승인이 필요할 때는 동일한 Human 확인 콜백을 사용한다. 콜백이 없으면 승인 필요 상태에서
종료하고, 거절이나 정책 검증 실패 후에는 실행을 진행하지 않는다. 방향 검토는 동일한 Graph 인스턴스와
`configurable.thread_id`에서 Interrupt / Resume를 사용한다. Resume action의 Review ID·Binding과 실제 Human Receipt를 검증한다.

- [Project Direction](docs/project-direction.md)
- [Architecture](docs/architecture.md)
- [Workflow Architecture](docs/workflow-architecture.md)
- [Roadmap](docs/roadmap.md)

공유 계약은 [Contracts 소유권과 의존 방향](docs/architecture.md#contracts-소유권과-의존-방향)을 따른다.
업무와 배정은 Management 계약, 구현 계획과 실행 계약은 Specialist 계약으로 공유한다. Agent Protocol, 실행 State,
Phase Handoff 및 Governance 기록은 해당 기능이 소유한다.

## 사전 준비

- Node.js 20 이상과 pnpm (설치된 LangChain core의 Node 요구사항)
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
pnpm dev governance setup /path/to/system-policy.json
```

CLI는 `governance setup / delegate / revoke / approve`를 제공한다. 인자 없는 실행은 안내와 종료 코드 1을 반환한다.
전체 실행은 [Phase A API](src/workflows/development-organization/phase-a/index.ts)와
[Phase B API](src/workflows/development-organization/phase-b/index.ts)를 사용한다. 검증된 공동 승인 Handoff를
Phase B에 전달하는 방법과 Human 콜백 예시는 [Workflow Architecture](docs/workflow-architecture.md#4-phase-a--phase-b-handoff-contract)에 있다.
정책 설정과 실제 Human 확인은 [CLI 문서](docs/cli-and-human-interface.md)를 따른다.

## 과거 독립 Decision 검증 기록

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

제거 전 Automated Decision CLI E2E는 explicit / interactive 입력에서 Frontend → UX → Comparator와
Comparison presentation 연결, 동일 commit SHA, Decision 전달 구조, Comparator Context의 files 부재,
Specialist 간 isolation, Repository unchanged와 Evidence 실패 시 fail-fast를 확인한다.
Command unit test는 동일 Goal / Decision 배열의 identity와 Comparison 실패 전파도 확인한다.

이 자동 E2E는 deterministic fake Codex executable을 사용한다. 실제 모델의 Comparison 품질을
평가하는 benchmark가 아니며, 별도 외부 프로젝트의 반복 Real Codex Comparison 품질 관찰은
이번 closeout에 기록하지 않는다. Relation / rationale / statement의 의미적 정확성은 Harness의
구조·참조 검증으로 증명되지 않는다. 구현 범위와 남은 평가는 [Roadmap](docs/roadmap.md#v3--agreement--conflict--structured-decision-comparison)에 둔다.

## Assignment 기반 Task Detailing

Phase B의 수정 Assignment는 Governance의 Write Eligibility 확인 후 승인된 Read Session의 Context로
상세 계획을 수립한다. Codex Planner가 추가 파일을 요청하면 같은 Session에서 승인된 Snapshot을 조회한다.
Planner가 구조화된 Implementation Plan을 반환하면 Harness가 TaskContract를 생성하고 Governance가
Assignment에 귀속시킨다. 수정 실행에는 별도의 Write Authorization과 Claim이 필요하다.

독립 v1 Planning과 단순 문구 수정용 Fast Path는 제거했다. 다음 수치는 독립 CLI가 제공되던 당시의 기록이다.

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

위 수치는 독립 CLI 실행을 제공하던 시점의 기록이다. `Approval Wait`는 Human interaction 시간이며
당시 CLI의 Total에는 Review·Delivery·Cleanup 결정 대기도 포함됐다.

## Review와 Post-Execution Delivery

기존 Git Worktree 실행 기반은 검토를 위해 workspace를 유지한다. Review·Delivery·Cleanup은 현재 Phase B Graph에 연결되지 않았다. Review 모듈은 workspace path,
changed paths, 실제 diff, patch artifact 위치, 존재하는 Worker Result를 표시한다.
`Continue / Abort`로 확인 완료 여부를 받고, Continue 및 Execution / Verification 성공과
patch 보존이 확인된 경우에만 Delivery를 진행한다.

| 단계 | Human 선택 | 현재 안전 조건 / 결과 |
| --- | --- | --- |
| Review | Continue / Abort | Abort·Review 실패 시 Apply / Commit / Push 없음 |
| Apply | Apply / Skip | Dirty 원본 차단. `git apply --check` 후 적용. Force / 3way / reset / stash 없음 |
| Commit | Commit / Skip | 유효한 Conventional Commit 메시지 필요. changedPaths만 stage, 기존 staged 변경 차단 |
| Push | Push / Skip | Detached HEAD 차단, delivery commit과 HEAD 일치 확인, 기존 remote upstream에만 일반 push |
| Cleanup | Delete / Keep | Abort·Delivery 실패 후에도 별도 선택. Worktree만 Delete, artifacts는 유지 |

Execution Authorization, Change Review, Apply, Commit, Push 및 Cleanup은 별도 결정이다.
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

### Phase B 실행 흐름

```text
Phase A Handoff → Work Decomposition → Work Item Selection → Specialist 배정
→ Assignment Plan 등록 → 선택적 Assignment 읽기 실행
→ Governance Authorization / Reservation / Claim → 승인된 Snapshot Context
→ Specialist 읽기 실행 → Evidence 검증 → Phase B State
```

## TaskContract 예시

```json
{
  "id": "task-example-001",
  "goalId": "goal-example-001",
  "objective": "Clarify the README introduction",
  "targetRepository": "ai-workspace",
  "allowedPaths": ["README.md"],
  "forbiddenPaths": ["docs/architecture.md"],
  "constraints": ["Keep the existing section headings"],
  "acceptanceCriteria": ["The introduction states what the Harness does"],
  "verification": ["git diff --check"]
}
```

`allowedPaths`와 `forbiddenPaths`는 Repository 상대 경로의 정확한 문자열 일치만
지원한다. glob, 정규식, directory prefix는 지원하지 않는다. 예를 들어 `src/`는
`src/cli/cli.ts`를 허용하지 않는다.

기존 Worker 실행에서 독립 Verification의 예로 승인된 `git diff --check`를 사용한다.
범위 검사는 파일 쓰기를 사전에 차단하는 기능이 아니다. Worker와 Verification 실행
후 시작 commit 대비 실제 변경 경로를 수집해 위반을 탐지한다. 위반한 변경도 결과
patch에는 남을 수 있으므로 사람이 반드시 검토해야 한다.

## Execution 실행 결과

Phase B 읽기 실행의 결과 참조는 `assignmentExecutionResult`에 기록된다. 기존 Worker 실행 기반은 실행 결과의 `artifacts.directory`가 가리키는 Repository 밖의 임시 루트에 산출물을 보존한다.

```text
ai-workspace-governed-runs-*/run-*/
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

Workspace는 실제 AI 작업용
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

별도 Human 검토 후 artifact를 수동 적용할 때 사용할 수 있는 경로다.
`git apply --check`는 현재 checkout에 patch를 적용할 수 있는지만 확인한다. 위 명령은
사용자가 직접 실행하며, 적용 후 diff와 프로젝트 검증 명령을 확인하고 commit 여부를 결정한다.
CLI에서도 명시적 Apply 승인 없이는 적용하지 않는다. patch는 Worker가 만든 commit의 최종 파일 상태를
보존하지만 commit history와 metadata는 보존하지 않는다.

## Timeout

- Phase B 읽기 실행에는 Claim의 남은 시간과 위임 만료 시점이 적용된다.
- Codex Specialist 및 Comparator 기본 timeout은 각각 15분이다.

## 실행의 판단 범위와 제한

- `passed: true`는 Scope 검사와 구성된 Verification command가 통과했다는 뜻이다.
  자연어 objective와 acceptance criteria가 실제로 충족됐음을 보장하지 않는다.
- ignored 파일, 빈 디렉터리, Worker commit history는 patch에 보존하지 않는다.
- 실행 환경 준비, dependency 설치, `.env`와 secret 전달은 자동화하지 않는다.
- retry, rollback, 승인 없는 patch 적용·commit·push, 자동 merge는 수행하지 않는다.
- 자동 Phase B 실행 테스트는 Codex 프로세스 응답을 대체한다. 실제 Codex 인증, 모델 동작,
  네트워크, prompt 준수, 실제 프로젝트의 build 환경을 검증하는 테스트가 아니다.
- 첫 실제 적용에서는 버려도 되는 branch와 Repository 복제본으로 Task scope, 검증 명령,
  timeout, patch 적용 가능성을 먼저 확인해야 한다.