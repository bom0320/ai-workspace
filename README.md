# AI Workspace

AI Workspace는 개발자와 기존 AI Coding Agent가 실제 Git Repository에서 함께 일하기 위한
Agent Development Environment(ADE)이자 Development Governance Harness다. 개발자와 팀의
작업 방식·권한·검증 규칙을 코드화하여 실행 범위, Context, Evidence, Human approval을 통제한다.
현재 operator interface는 Node.js CLI로 제공된다. 최종 목표는 CEO가 여러 전문 AI 직원의 의사결정과
상세 설계·구현·테스트·리뷰를 관리하고 Human이 승인과 Evidence로 통제하는 AI Development Organization이다.

현재 다음 흐름이 구현되어 있다.

- **v0 — Safe Execution**: isolated Git worktree, Scope, Verification, Evidence와 binary patch 보존 기반을 구현했다.
  기존 실행 기반과 Review, Delivery, Cleanup 모듈은 후속 Assignment 수정 실행에 재사용할 수 있다.
- **v1 — Goal-to-Task Planning**: 자연어 Goal에서 TaskContract를 만드는 독립 CLI를 검증했다.
  현재 TaskContract는 Phase B의 Assignment 기반 Task Detailing에서 생성한다.
- **v2 — Governed Independent Decision**: 같은 Snapshot / Goal과 명시적 Context 아래 Frontend / UX
  Specialist를 Codex로 순차 독립 실행하고 구조화된 AgentDecision과 Evidence를 검증·표시한다.
- **v3 — Structured Decision Comparison**: 독립 AgentDecision을 Concern 단위로 비교해
  Agreement / Conflict / Trade-off와 Uncertainty / Limitation / Separate Concern을 구조화하고,
  원본 Specialist / Evidence reference를 검증한다.

Agent discussion / CEO 전체 조직 운영 / Coordinator, 공유 메모리, 자동 retry와 dependency 설치는
미구현이다. Agents SDK integration, OPA, Temporal / Restate 등 외부 후보도 현재 도입되어 있지 않다.

문서는 다음 책임으로 나눈다.

- [Project direction](docs/project-direction.md): 왜 만드는가 — North Star와 설계 판단 기준
- [Architecture](docs/architecture.md): 어떻게 구성되는가 — 현재 구현과 목표 책임 경계
- [Roadmap](docs/roadmap.md): 어디로 가는가 — 구현 상태와 v4 이후 검증 단계
- [CLI / Human interface](docs/cli-and-human-interface.md): 사람이 현재 어떻게 조작하는가

**v4 — CEO Governance / AI Organization Orchestration은 진행 중이며 전체 Workflow는 미완성**이다.
CEO Staffing / Snapshot Context Discovery / Proposal Finalization, Human Staffing Approval·Delegation,
Scope 발급과 Authorization·Reservation·일회 Claim이 구현되어 있다. Phase A Workflow API는 승인 Scope의
동적 Specialist를 기존 v2로 순차 실행하고 둘 이상이면 기존 v3 Comparison을 호출한다.
CLI `staffing`은 Staffing → Approval → Scope 발급까지 연결하며, 이후 Decision 묶음 실행은 별도 API다.
CEO Synthesis와 Human Direction Governance는 API / Graph에 연결했다. Phase B는 승인된 방향을 업무로 분해하고 Specialist 배정을 등록하며, 명시적으로 요청한 Assignment 읽기 실행을 지원한다. Assignment 상세 계획, Repository 수정 및 Delivery 연결은 후속 범위다.

목표 Workflow는 **Phase A — Decision & Approval**과 **Phase B — Detailed Design & Execution**으로 나뉜다.
CEO가 Specialist 판단을 종합해 해결 방향에 대한 Human 승인을 받은 뒤에도 업무를 분해·배치하고,
여러 직원의 설계·개발·검증과 재작업·재배치·진행 평가를 관리하여 Executive Report까지 연결한다.
현재 v2 Specialist는 read-only Decision Agent이며, 다중 Writing Worker·병렬 실행·Worktree 통합은 미구현이다.
Workflow Runtime은 **LangGraph.js Minimal Integration Step 1·2·2.5·3을 구현**했다.
Phase A Graph는 정책 조회 → CEO Staffing → Staffing Approval 평가를 조건부 Edge로 연결한다.
정책 거부·Staffing 실패/Escalation이면 중단하며, 직접 승인이 필요한 경우에만 Human Confirmation 콜백과 Governance 최종 승인으로 진행한다.
콜백이 없으면 approval-required를 유지한다. CLI는 runStaffingApproval() Adapter에서 staffing-approval 실행 대상을 명시해 승인 단계 결과만 반환한다. 별도 Staffing Setup Graph는 없다.
specialist-decisions 실행 대상을 명시하면 approved 이후 기존 순차 Specialist Workflow와 v3 Comparison을 실행한다.
ceo-synthesis 실행 대상은 Comparison 성공 또는 단일 생략 후 CEO Synthesis 제안 / Escalation / 실패까지 진행한다. 이 결과는 Phase A 전체 완료나 해결 방향 승인이 아니다.
Organization State는 원본 goal / repositoryPath, Phase A State는 공통 입력, 정책 조회와 개별 staffingResult / approvalResult / specialistDecisionsResult / decisionComparisonResult / synthesisResult를 소유한다.
기본 실행 대상은 staffing-approval로 기존 CLI 범위를 유지한다. human-direction-governance 대상은 실제 Human Confirmation을 거친 방향 승인 / 수정 요청 / 거부와 같은 프로세스 Interrupt / Resume를 제공한다. 영속 장애 복구는 없으며 자세한 계약은 [Workflow Architecture](docs/workflow-architecture.md#step-72--human-direction-governance)를 따른다.
상위 Organization Graph는 향후 Phase 간 Handoff 계약에 맞춰 구성하며 현재 Wrapper Graph는 없다.
State는 실행 데이터이고 승인·권한 기록은 기존 Governance Ledger가 소유한다.

LangGraph.js는 workflow 실행 메커니즘을 맡고 Authority / Context / Evidence / 승인 정책은 Harness가
소유한다. 별도 채택 평가·선행 Runtime Spike 없이 v4 구현 과정에서 통합·검증한다.
판단 기준은 [Project Direction](docs/project-direction.md#build-vs-adopt), 책임 경계는
[Architecture](docs/architecture.md#5-target-responsibility-model), 순서는
[Roadmap](docs/roadmap.md#v4--ceo-governance--ai-organization-orchestration)에 둔다.

아래는 지금 사용할 수 있는 기능과 사용법이다.

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
pnpm dev
```

인자 없이 실행하면 독립 Decision 입력을 시작한다. Repository, Decision Goal, Context Files를
입력한다. Context Files는 한 줄에 한 경로씩 최소 1개를 입력한 뒤 빈 줄로 마친다.

기존 독립 `plan`과 `execute` 명령 및 위치 인자 방식은 종료 코드 1로 거부된다.
Task Detailing과 수정 실행은 승인된 Phase B Assignment에서 수행한다.

## v4 현재 진입점

| 진입점 | 현재 연결 범위 |
| --- | --- |
| `pnpm dev governance setup / delegate / revoke / approve` | 정책·위임 설정, 기존 Proposal 승인과 Scope 관리 |
| `pnpm dev staffing <repository> <goal.json>` | 승인 정책 조회 → CEO Staffing → Human Staffing Approval → Scope 발급 |
| `createPhaseAGraph({ maxRounds: 4 }).invoke({ goal, repositoryPath })` API | 정책 조회 → Staffing → Approval → 선택적 Preflight·Specialist 반복·Comparison(Node / Edge). 기본값은 승인까지만 실행; API의 executionTarget으로 분석 명시 |

Governance / Staffing의 실제 명령과 JSON 입력은 [CLI 문서](docs/cli-and-human-interface.md#7-staffing-approval--human-delegation--step-3),
API의 실패 단계·예산·Claim 한계는 [Architecture](docs/architecture.md#96-step-54--phase-a-multi-specialist-decision--comparison--implemented)를 따른다.

## Decision quick example

Clean Repository와 명시적 repository-relative UTF-8 text 파일이 필요하다.

```sh
pnpm decision . \
  "Evaluate the current decision architecture" \
  src/application/specialist/analysis/flow/run-decision.ts \
  src/application/specialist/analysis/flow/independent/collect-independent-decisions.ts
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