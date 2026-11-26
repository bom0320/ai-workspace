# CLI and Human Interface

이 문서는 사람이 현재 Development Governance Harness를 어떻게 관찰하고 조작하는지 설명한다.
실행 준비·TaskContract 예시·artifact 사용법은 [README](../README.md), 내부 책임 경계는
[Architecture](architecture.md), 미래 단계는 [Roadmap](roadmap.md)에 둔다.

## 1. CLI의 역할

> CLI is an operator/debug interface for the Harness, not the core product value.

현재 CLI는 Governance 정책 설정, 위임, 철회 및 실제 Human 승인 관리의 접점이다.
`pnpm dev governance <command>`로 실행한다. 인자 없는 실행은 사용법을 안내한다.
과거 `decision`, `staffing`, `plan`, `execute` 명령과 위치 인자 기반 실행은 종료 코드 1로 거부한다.

Phase A / Phase B는 Workflow API로 실행한다. Phase A 호출자가 Human Staffing·Refinement 및
Direction 승인 콜백을 제공하며, 실제 receipt는 State 밖에서 처리한다. 방향 검토의 Interrupt / Resume
사용법은 [Workflow Architecture](workflow-architecture.md#step-72--human-direction-governance)를 따른다.

## 3. 현재 Human Interaction Flow

### Phase B 실행과 변경 검토

Phase B는 승인된 Work Item을 실행한 뒤 Scope, Verification, Evidence와 Workspace를 결과로 반환한다.
Review, Delivery, Cleanup 모듈은 독립적으로 보존되며 Phase B에서 자동 호출되지 않는다.
Review의 Continue, Apply, Commit, Push 및 Cleanup 선택은 별도 Human 결정이다.
원본 반영은 유효한 변경 결과와 별도의 Apply 승인을 요구한다. Review는 diff 출력을 64KiB, Worker
출력을 16KiB로 제한하며, Workspace나 기준 Commit을 확인할 수 없으면 Delivery를 차단한다.
Cleanup은 Worktree만 삭제하며 실행 Artifact는 보존한다.
Review 및 Delivery 모듈의 안전 조건은 [README](../README.md#review와-post-execution-delivery)를 따른다.

### 유지되는 CLI 모듈

- `commands/governance/`는 정책 및 승인 관리를 연결한다.
- `commands/review/`, `commands/delivery/`, `commands/cleanup/`과 관련 prompt는 후속 Human Change Review·Delivery에 재사용한다. 현재 Graph와 CLI 명령 디스패치에 연결되지 않는다.
- `presenters/governance/`는 사람이 확인할 승인 요청을 표시한다.

## 6. 인터페이스 경계

```text
CLI → Application
Application → CLI를 모름
```

`detailAssignmentTask()` / `executeAssignment()` / `compareDecisions()`의 실제 use-case logic은 application에 유지한다.
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

다음 명령은 실행할 Specialist를 호출하지 않고 승인 정책과 Scope만 관리한다.
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
