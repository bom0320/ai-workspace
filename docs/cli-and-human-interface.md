# CLI and Human Interface

이 문서는 사람이 현재 Development Governance Harness를 어떻게 관찰하고 조작하는지 설명한다.
실행 준비·TaskContract 예시·artifact 사용법은 [README](../README.md), 내부 책임 경계는
[Architecture](architecture.md), 미래 단계는 [Roadmap](roadmap.md)에 둔다.

## 1. CLI의 역할

> CLI is an operator/debug interface for the Harness, not the core product value.

현재 CLI는 Decision Goal / 명시적 Context 입력, Decision / Comparison 표시와
Staffing·Governance 상호작용을 담당한다. Harness를 사람이 관찰하고 통제하는
operator/debug adapter이자 Human decision surface다. 전체 AI 조직의 orchestration과
Planning / Execution / Governance의 core logic은 application / Harness와 Workflow Runtime의 책임이며
CLI는 해당 책임을 소유하는 상위 계층이 아니다.
Worker 실행은 Phase B API가 조정한다. Review, Delivery, Cleanup CLI 모듈은 후속 연결을 위해 보존한다.

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
# 인자 없음: 독립 Decision 입력
pnpm dev

# 독립 Decision → Structured Comparison, 명시적 Context files
pnpm decision . "Evaluate the current decision architecture" \
  src/application/specialist/analysis/flow/run-decision.ts \
  src/contracts/specialist/authority.ts

```

### Interactive entry

인자가 없으면 Repository, Decision Goal, Context Files를 입력받아 독립 판단과 비교를 실행한다.
필수 입력이 끝나기 전 EOF는 오류와 종료 코드 1을 반환한다.

이전 `plan`, `execute` 명령과 위치 인자 기반 Plan & Execute는 종료 코드 1로 거부된다.
실제 Worker 실행은 Phase B의 승인된 Assignment를 받는 `executeAssignment()`에서 제공한다.

## 3. 현재 Human Interaction Flow

### Phase B 실행과 변경 검토

Phase B는 승인된 Work Item을 실행한 뒤 Scope, Verification, Evidence와 Workspace를 결과로 반환한다.
Review, Delivery, Cleanup 모듈은 독립적으로 보존되며 Phase B에서 자동 호출되지 않는다.
Review의 Continue, Apply, Commit, Push 및 Cleanup 선택은 별도 Human 결정이다.
원본 반영은 유효한 변경 결과와 별도의 Apply 승인을 요구한다. Review는 diff 출력을 64KiB, Worker
출력을 16KiB로 제한하며, Workspace나 기준 Commit을 확인할 수 없으면 Delivery를 차단한다.
Cleanup은 Worktree만 삭제하며 실행 Artifact는 보존한다.
Review 및 Delivery 모듈의 안전 조건은 [README](../README.md#review와-post-execution-delivery)를 따른다.

### Decision flow

```text
Repository:
> .

Decision Goal:
> Evaluate the current decision architecture

Context Files
Enter one repository-relative file path per line.
Submit an empty line when finished.

> src/application/specialist/analysis/flow/run-decision.ts
> src/contracts/specialist/authority.ts
>
```

Context files는 한 줄에 한 경로, 최소 1개가 필요하다. 파일 0개에서 빈 줄을 입력하면
`At least one context file is required.`를 출력하고 계속 입력받는다. 하나 이상 입력 후 빈 줄로 제출한다.
파일 목록 순서는 유지하며 path 검증은 prompt가 아닌 application에서 수행한다.

대상은 commit이 있는 clean Git Repository여야 한다. 수정·staged·untracked 변경은 capture를 막는다.
기존 Git clean 기준이므로 ignored 파일 전체 검사나 완전한 sandbox를 뜻하지 않는다.
명시적 파일은 repository-relative text path여야 하며 빈 path / absolute path / `..` traversal은 거부한다.
존재하지 않는 파일, directory, binary / invalid UTF-8 입력도 실패한다. 파일은 Snapshot commit에서 읽으며
전체 Repository를 자동 조사하거나 역할별로 파일을 자동 선택하지 않는다.

```text
Decision...
Snapshot: <commitSha>
Specialists: 2

[Frontend Specialist]
Recommendation / Evidence / Risks / Uncertainty

[UX Specialist]
Recommendation / Evidence / Risks / Uncertainty

Comparison

Findings:

[agreement] <concern>
- frontend: <statement>
- ux: <statement>
Rationale: <rationale>

Gaps:

[uncertainty] <concern>
Specialists: frontend, ux
Reason: <reason>

Decision Duration: X.Xs
```

두 Specialist는 독립적으로 순차 실행한다. CLI command는 `runDecision()` 결과의 동일 Goal 객체 /
Snapshot commit SHA / 원본 AgentDecision[]을 `compareDecisions()`에 전달한다.
Comparison은 기존 Decision의 Concern별 관계를 구조화하며 Specialist를 다시 실행하지 않는다.
CLI는 두 application이 모두 성공한 뒤 Snapshot / Decisions / Comparison을 표시하므로 실행 중에는
`Decision...`만 보일 수 있다. Evidence path와 optional line range를 표시하며 비어 있는 목록은
`- (none)`을 표시한다.

Comparison presenter는 Findings의 concern / relation / Position별 specialistId와 statement /
rationale, Gaps의 concern / kind / specialistIds / reason을 표시한다.
Findings와 Gaps가 모두 비면 `Comparison: no material relationships found.`를 출력한다.
비교 결과를 winner / final recommendation으로 합성하거나 자동 해결하지 않는다.

성공은 exit 0이다. Snapshot drift, Codex timeout/process 실패, JSON/schema 오류, Evidence invariant /
Comparison reference 위반은 `Error: ...`와 exit 1이며 partial Decision / Comparison을 표시하지 않는다.
Specialist는 각 15분, Comparator는 15분이 기본 timeout이며 현재 CLI의 별도 override 입력은 없다.
Decision Duration은 두 Specialist와 Comparison 실행·표시를 포함하고 interactive input 대기는 제외한다.
결과와 Human governance outcome은 저장하지 않으며 Task Approval / Review / Apply / Commit / Push /
Cleanup을 진행하지 않는다.

v2의 단일 실제 Codex 실행 기록과 v3의 fake Codex automated wiring / isolation 검증은
[README](../README.md#v2-실제-e2e-기록)에서 구분한다. Reference 검증은 모델의 relation /
rationale / statement 정확성 평가가 아니다.

## 4. 현재 CLI 파일 책임

테스트는 구현 파일과 함께 배치한다. 아래에서는 테스트와 feature local index.ts를 생략한다.

```text
src/cli/
├─ cli.ts
├─ commands/
│  ├─ decision/
│  │  └─ decision.ts
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
│  ├─ decision/
│  │  └─ ask-decision.ts
│  ├─ cleanup/
│  │  └─ cleanup.ts
│  ├─ delivery/
│  │  ├─ apply-changes.ts
│  │  └─ delivery.ts
│  └─ review/
│     └─ review.ts
└─ presenters/
   ├─ decision/
   │  ├─ decisions.ts
   │  └─ comparison.ts
   └─ timing.ts
```

- `cli.ts`: interactive Decision 입력과 decision / governance / staffing 명령을 연결한다.
- `commands/decision/decision.ts`: `runDecision()` → `compareDecisions()`를 CLI command layer에서
  조합하고 Comparison을 포함한 DecisionCommandResult를 반환한다. Snapshot / Goal / 파일 loading /
  Specialist 구성과 각 application의 validation은 중복하지 않는다.
- `commands/review/`: 변경 presentation과 Review completion gate.
- `commands/delivery/`: Apply 성공 후 Commit, Commit 성공 후 Push의 승인·결과 연결.
- `commands/cleanup/`: Delete / Keep 결정에 따라 infrastructure의 worktree 제거 호출.
- `prompts/<feature>/`: 해당 CLI feature가 소유하는 입력·상호작용. Delivery는 Apply / Commit / Push를 포함한다.
- `presenters/`: 개별 Decision / Comparison과 timing을 보여주며 입력·승인 판단을 하지 않는다.

현재 Review와 Execution 결과 presentation 일부는 해당 command에 있다. 모든 출력을
새 presenter로 추출하거나 구현되지 않은 파일을 미리 나열하지 않는다.
Git command는 CLI에 직접 넣지 않고 `infrastructure/git` API를 사용한다.

## 5. 관찰할 결과와 Timing

CLI는 Decision 결과 및 소요 시간을 표시한다. Phase B 실행의 단계별 telemetry와
Evidence는 `ExecutionResult`에 기록한다.

## 6. 인터페이스 경계

```text
CLI → Application
Application → CLI를 모름
```

`detailAssignmentTask()` / `executeAssignment()` / `runDecision()` / `compareDecisions()`의 실제 use-case logic은 application에 유지한다.
UI가 바뀌어도 계약과 실행 정책은 UI에 종속되지 않아야 한다. 향후 Web UI / API adapter는
같은 application logic을 사용할 수 있지만 현재 구현된 인터페이스는 아니다.
Human 권한을 새 interface가 우회하지 않아야 한다.

Revise, re-plan, 복잡한 approval policy, fancy TUI는 현재 제공하지 않는다.
v4의 Phase A(해결 방향 판단·승인) / Phase B(상세 설계·실행)는
[Target Architecture](architecture.md#5-target-responsibility-model)의 목표 흐름이다. Human Staffing Approval,
해결 방향 승인·위임, Work Item Authorization, Change Review와 Delivery는 서로 다른 접점이다.
Staffing Approval은 분석 역할·범위에, ExecutionDelegation은 실행 권한 상한에 적용된다.
다중 직원의 진행·재작업·재배치·Escalation을 관찰할 인터페이스도 후속 설계 대상이다.
현재 CLI의 governance 명령은 아래 정책·위임·Staffing 승인을 제공하며, CEO Staffing은 별도 staffing 명령으로 실행한다. 해결 방향의 Human Governance 명령은 없다. 기존 Decision 명령은 독립 판단과 비교까지만 수행한다. 전체 조직 인터페이스 형태와 구현 순서는
[Roadmap](roadmap.md)에 두며 새로운 명령·화면을 현재 기능으로 확정하지 않는다.


## 7. Staffing Approval & Human Delegation — Step 3

기존 selector는 그대로다. 다음 explicit command는 실행할 Specialist를 호출하지 않고 승인 정책과 Scope만 관리한다.
JSON 입력 파일은 clean Snapshot 검사에 영향을 주지 않도록 대상 Repository 밖에 보관한다.

```sh
pnpm dev governance setup /path/to/system-policy.json
pnpm dev governance delegate /path/to/repository /path/to/delegation-policy.json
pnpm dev governance approve /path/to/staffing-proposal.json
pnpm dev governance revoke /path/to/repository
```

System Policy JSON은 repositoryRoot, phase("phase-a"), availableSpecialists(기존 등록 정의),
contextAccessPolicy.allowedScopes(File / Directory 범위), limits(기존 StaffingInspectionLimits), 직접 maxAgentInvocations를 사용한다. setup은 최초 설정과 변경 모두 실제 terminal 확인을 요구한다.
CEO에게 설정 파일이나 서명 키를 제공해서는 안 된다.
이전 nested policy / enforcementRules 형식은 새 setup 입력으로 받지 않는다. 기존 저장 정책은 이력으로만
보존하며 그 형식이 최신이면 승인·위임 설정·Scope 조회를 거부한다. 새 형식으로 setup하여 실제 Human
확인을 거쳐야 한다. 확인 화면은 이전 Rule이 승계되지 않음을 고지한다. 정책은 새 version으로 추가되고
기존 위임도 다시 승인해야 한다. 서명 파일이나 과거 정책을 직접 편집해 마이그레이션하지 않는다.


Delegation JSON 예시(경로·ID·미래 만료 시각은 실제 정책에 맞게 지정):

```json
{
  "allowedSpecialistIds": ["frontend"],
  "delegatedContextScopes": [{ "kind": "directory", "path": "src/login" }],
  "maxAgentInvocations": 2,
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

Directory 위임은 System Policy의 동일하거나 상위 Directory 범위 안이어야 한다. 이 범위는 자동 승인
조건이며 CEO의 Discovery 권한을 부여하지 않는다. 실제 Proposal과 Scope에는 정확한 파일만 들어간다.
System Policy 설정에는 contextAccessPolicy가 필수이며 allowedContextPaths는 빈 배열이어도 거부한다.
과거 Exact 목록·혼합 형식·nested policy 저장 정책은 사용이 차단된다. governance setup에서 Human이
새 정책을 재승인해 버전을 갱신해야 하며 과거 이력은 재작성하지 않는다. 신규 Delegation 입력은 위 네
필드만 허용하며 phase / repositoryAccess / shellExecution / allowedContextPaths / contextAccessPolicy를
추가하면 거부한다. 실행 Phase와 Authority는 상위 System Policy가 통제한다.
과거 서명된 Delegation은 별도 저장 Schema로 읽고, Exact 목록 또는 기존 Scope를 원래 자동 승인 범위로만
검증한다. 읽기 시 변환·재저장은 없다. 과거 입력 파일을 새 설정에 그대로 사용하지 말고 새 네 필드로
명시해 Human 확인을 받아야 한다. 권한 확대나 교체는 기존 확인·버전 갱신 절차를 거친다.

최초 위임·교체·철회도 실제 /dev/tty에서 표시된 `Approve <random challenge>`와 Enter로 확인한다.
stdin의 단순 Approve·JSON의 approved 필드로 대신할 수 없다. terminal이 없거나 거절·EOF이면 실패한다.
위임 내 제안은 추가 입력 없이 승인되며, 위임 범위 밖은 Goal·원본 Constraints 전체·배치 업무·Context·
호출 예산과 자동 승인 불가 사유를 보여준다. 배치 변경은 거절 후 새 검증 Proposal로 제출해야 한다.
System Policy 위반은 Human 확인으로 우회하지 않는다. 만료·철회·Superseded·정책 버전 불일치나
무결성/Schema 실패인 위임은 Direct Approval로 전환하지 않고 거부한다. 위임이 없거나 유효한 위임의
범위를 벗어난 Proposal인 경우에만 직접 확인을 요청한다.

승인 결과는 ApprovalRecord와 Scope를 출력하고 `~/.ai-workspace-governance/`에 서명된 기록을 보존한다.
자세한 신뢰 경계·한계는 [Architecture의 Step 3](architecture.md#v4-step-3--staffing-approval--human-delegation--구현)을 따른다.
Staffing 승인·Human 사전 위임은 해결 방향 Governance, Task Approval, Change Review / Delivery의 승인이 아니다.
이 Governance CLI는 Scope가 발급되어도 Specialist 호출·Budget Reservation·Authorization을 수행하지 않는다. 해당 API와 별도 Phase A Decision Workflow는 구현되어 있다.

### v4 Staffing → Approval (명시 명령)

```sh
pnpm dev staffing /path/to/repository /path/to/goal.json
```

Goal JSON은 기존 GoalSpec(`objective`, `targetRepository`, 선택적 `constraints`)이다. 원본 Constraints를
그대로 전달한다. 먼저 `governance setup`으로 Human 승인된 현재 System Policy가 있어야 한다.
Workflow가 Ledger에서 정책을 가져와 CEO Staffing을 실행하고 Proposal을 메모리에서 바로 Approval로 전달한다.
유효한 위임 안이면 추가 입력 없이 승인하고, 직접 승인이 필요하면 기존 Staffing review와 /dev/tty 확인을
사용한다. 거절·EOF·terminal 불가 시 Scope를 발급하지 않는다. 확인 후 CEO를 재실행하지 않는다.

결과는 JSON으로 출력하며 `approved`만 exit code 0이다. `failed`(정책 조회·Staffing·확인 실패), `escalated`
(질문·사유 포함), `rejected`, `denied`는 1이다. 기존 selector와 `governance approve <proposal.json>`은 유지한다.
새 명령은 Proposal 파일을 저장·재로딩하지 않으며 Scope 발급까지만 수행한다. Specialist 호출·Authorization·
Budget Reservation·장기 대기/재개는 이 명령에 연결하지 않는다. 현재 Phase A의 Staffing / Approval 실행 순서는 LangGraph가 조정한다.

### Application / Workflow API와 CLI 경계

Phase A Graph는 `executionTarget: "specialist-decisions"`에서 저장 승인 Scope의 전체 요청을 검증한 뒤
Authorization·Reservation·Claim·v2 Decision의 순차 반복과 v3 Comparison을 Node / Edge로 조정한다.
기존 함수형 runSpecialistDecisions API는 제거했다. 이 실행 대상을 제공하는 CLI 명령이나 selector 항목은
아직 없다. 기존 `decision` 명령은 고정 Frontend / UX의 v2 → v3 경로를 유지하며
v4의 승인 Scope나 Reservation을 자동으로 발급하지 않는다.

LangGraph Step 2.5의 `phase-a/index.ts` / `createPhaseAGraph()`는 정책 조회 → CEO Staffing → Approval 평가를 조정한다.
approval-required인 경우에만 Human Confirmation Node로 진행한다. 콜백이 없으면 원본 Proposal·Binding과 승인 대기를 보존하며,
콜백이 있으면 분리된 review 사본을 전달하고 원본 Proposal과 실제 receipt로 Governance에 최종 승인을 요청한다.
CLI staffing은 기존 runStaffingApproval() API를 통해 현재 createPhaseAGraph()를 실행하고 review·/dev/tty I/O를 제공한다.
별도 Staffing Setup Graph는 제거했으며 Entry Point는 개별 policyLookup / staffingResult / approvalResult를 기존 반환 계약으로 변환한다.
Step 3에서 Entry Point가 executionTarget: staffing-approval을 명시하도록 고정했다. Graph의 기본값도 승인까지만 실행하며, specialist-decisions를 명시한 API 호출만 승인 후 분석을 수행한다. 실행 대상은 Governance 우회 옵션이 아니다.
별도 Graph 명령은 추가하지 않았다. Decision은 API의 실행 대상으로 연결했으며 CEO Synthesis·Direction Governance·Interrupt·Resume·Checkpoint는 없다.
Staffing Approval은 `/dev/tty` receipt를 사용한다.
API 실패 계약과 신뢰 경계는 [Architecture](architecture.md#96-step-54--phase-a-multi-specialist-decision--comparison--implemented)를 따른다.