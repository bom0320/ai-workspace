# Phase A Full Workflow E2E Validation — 2026-11-17

## 범위와 결론

검증 기준은 `feat/v4-architecture`의 `8e6d34d`다. 제품 소스와 기존 테스트·Schema·Graph는 변경하지 않았다.
실제 Codex로 Staffing → Specialist Decisions → Comparison → Synthesis → Direction Review를 실행했다.
초기 E2E의 인간 입출력은 기존 통합 테스트의 controlling-terminal Mock을 사용했다. 아래 「실제 AI 실행 결과」의
Approve·Revision·Reject는 **실제 AI + 모의 Human Confirmation 통합 실행**이며, 그 결과와 수치는 그대로 보존한다.
`confirmHumanAction()`의 실제 receipt 생성·일회용 소비, 서명된 Ledger Transaction은 사용했지만,
초기 실행의 `/dev/tty` I/O는 자동 응답이므로 인간이 직접 입력했다는 증거가 아니다.
이후 별도의 「Real Human TTY Validation」에서 실제 사용자의 직접 승인과 저장 결과까지 검증했다.
현재 구현된 Phase A의 승인 경로는 실제 Codex와 실제 Human TTY 조건에서도 검증 완료다.

## 환경과 격리

- Node.js / pnpm / Vitest 및 프로젝트의 실제 LangGraph, Application, Governance 사용.
- Codex CLI `0.163.0`, `codex login status`: ChatGPT 인증. 실제 호출은 기존 Adapter·Prompt·격리 설정 그대로 사용.
- 두 개의 독립적인 임시 Git Repository에 7줄 `index.html` fixture를 생성하고 최초 Commit을 만들었다.
- fixture: task 입력, `+` 버튼, task 목록, Added 피드백, inline CSS/JS. 명명·키보드·피드백·대비 분석에 적합한 작은 입력.
- 원본 Goal: Frontend와 UX의 독립 분석으로 UI 개선 방향 제안. Constraints: 무수정·무명령 실행, 기존 task 추가 동작 보존,
  등록된 두 Specialist만 사용, 사용자 연구·브라우저 측정 부재를 불확실성으로 취급.
- System Policy: frontend / ux, repositoryAccess=read, shellExecution=false, Context는 `index.html`만, Invocation Budget=2.
- Governance의 `homedir()`만 임시 경로로 격리했다. 실제 사용자 Ledger와 Codex 인증 파일은 복제·수정하지 않았다.
- Codex transport의 spy는 실제 `runCommand()`를 그대로 호출하고 결과만 기록했다. 가짜 Agent 결과나 Proposal 교정은 없다.

## 실제 AI 실행 결과

### Approve 및 Revision

| 단계 | 관찰 결과 |
| --- | --- |
| Policy | 임시 Ledger의 Policy version 1 조회, ready |
| CEO Staffing | 실제 CEO가 frontend / ux 각각 한 Assignment 생성, proposed |
| Staffing Approval | 모의 TTY 확인 후 실제 Governance가 Scope 한 개 발급 |
| Specialist Decisions | 두 Assignment 순차 실행, Authorization → Reservation → Claim → Decision, completed |
| Evidence | 두 Decision 모두 index.html의 실제 3–6행을 참조, Snapshot / Evidence 검증 통과 |
| Comparison | completed; Finding 5개, Gap 2개, Reference 검증 통과 |
| Synthesis | 최초 및 두 Revision 모두 proposed, SourceReference / Coverage 검증 통과 |
| Human Review | 각 Proposal에서 실제 LangGraph Interrupt 관찰, 같은 Thread의 Command Resume 사용 |
| Revision | Synthesis만 두 번 추가 호출, Specialist·Comparison 호출 수 불변 |
| 최대 횟수 | revision=2 Review에 세 번째 수정 요청을 준비하면 Governance가 거부 |
| 최종 승인 | 모의 TTY 확인 후 ApprovedDecision 발급, getApprovedDecision()으로 복원·대조 |
| 중복 승인 | 확정된 같은 Review의 재확정 denied |
| Repository | HEAD 및 git status 불변 |

정상 실행은 Codex 7회(Staffing 1, Specialist 2, Comparison 1, Synthesis 3), 모든 process exitCode=0,
timedOut=false였다. Assignment는 CEO의 원본 결과를 그대로 사용했다.

Review Binding은 round 0 → 1 → 2에서 각각 달랐다.

```text
0: 4d1a522959bdf6f4fd784795b8f03d18d69c717db3b3edfe2a63a630294efa13
1: 157e1f5137687eb677ebf624291ca2df962c810aae2561f484d3359dd6f9b6a7
2: f255d9132b2fed610c97b0606eb0e65d830843f370eac941d7cba450983cb0fa
```

최종 ApprovedDecision `fc0ae4cf-b3cc-44a7-b7ff-c5bea2547ad6`의 reviewBinding은 round 2와 일치했다.
복원된 Goal도 원본과 일치했다. Ledger에는 systems 1, issuances 1, reservations 2(모두 claimedAt 존재),
directionReviews 3, approvedDecisions 1이 남았다. Revision 때문에 Scope·Invocation이 늘어나지 않았다.

### Reject

별도 임시 Repository에서 실제 AI 전체 분석 후 모의 TTY로 Reject를 확정했다. `rejected`로 종료됐고
Ledger의 approvedDecisions는 0개, issuances 1개, claimed Reservation 2개, directionReviews 1개였다.
정상 Codex 호출 5회(Staffing 1, Specialist 2, Comparison 1, Synthesis 1) 이후 추가 AI 호출 없이 종료됐다.
Repository HEAD와 작업 트리는 불변이었다. 이 실행은 109.93초, 승인·Revision 실행은 208.00초였다.
위 Mock Human 두 시나리오의 정상 Codex 호출은 총 12회이며, 별도로 최초 sandbox 초기화 차단 1회가 있었다.

## Real Human TTY Validation

2026-11-17에 사용자가 VS Code 로컬 터미널에서 검증 Runner를 실행했다.
실제 `/dev/tty`에서 다음 세 대상을 읽고 각각 직접 승인했다.

1. System Policy
2. Staffing Proposal
3. Direction Proposal

`confirmHumanAction()`과 TTY 입출력은 Mock하거나 대체하지 않았다.
Governance 저장 위치만 별도의 로컬 테스트 홈으로 격리했고, 실제 사용자 Governance 기록은 사용하지 않았다.
기존 실행에서 소비된 Confirmation·Invocation이나 직렬화된 Graph State를 재사용하지 않았다.

새 테스트 Repository에서 실제 기본 Codex Adapter로 Staffing → Specialist 2명 → Comparison → Synthesis를 실행했다.
`createPhaseAGraph()`의 `human-direction-governance` 대상으로 Direction Review Interrupt에 도달한 뒤,
동일 Graph 인스턴스와 동일 `thread_id`의 `Command({ resume })`로 재개했다.
Resume Action 자체는 승인이 아니며 최종 Node에서 실제 TTY Confirmation을 별도로 받았다.

### 저장 결과 검증

로컬 `run-status.json`의 `passed`를 확인하고, 새 승인이나 AI 호출 없이 `run.sh --verify`도 재실행했다.
`getApprovedDecision()`이 서명된 Ledger에서 승인 기록과 원본 Review·분석 Context를 복원했고 다음 검사를 통과했다.

| 검증 항목 | 결과 |
| --- | --- |
| status | passed |
| bindingMatches | true |
| goalPreserved | true |
| snapshotMatches | true |
| decisions | 2 |
| repositoryUnchanged | true |
| ApprovedDecision 발급 및 조회 | 성공 |

승인된 Review의 ID·Binding과 ApprovedDecision의 참조, 기록된 approve Action을 대조했다.
원본 Goal 및 Repository Commit SHA가 일치했고, 테스트 Repository의 HEAD와 작업 트리가 변경되지 않았음을 확인했다.
이는 실제 인간의 승인 경계와 현재 Phase A 전체 승인 경로의 검증이다.
**Revision 및 Reject의 실제 인간 TTY 검증까지 수행했다는 뜻은 아니다.** 해당 경로는 앞선 실제 Codex + Mock Human 결과로 남긴다.

### 로컬 실행 데이터 관리

Runner와 실행 증거는 `.local/phase-a-tty/`에 격리했다. `/.local/`을 `.gitignore`에 추가한 목적은
승인 입력·비공개 Ledger·임시 Runner·Repository 및 실행 데이터를 Git 추적에서 제외하기 위해서다.
이 문서에는 검증 결과만 기록하며 승인 토큰, 비공개 Ledger와 `.local/` 데이터는 커밋하지 않는다.
제품 소스, Application API, 승인·Invocation 안전장치는 변경하지 않았다.

## Synthesis 품질과 한계

초기 제안은 label·명확한 Add task 버튼·키보드 제출·대비·상태 피드백을 방향으로 제안했다.
Revision 뒤에는 입력 명확성과 피드백을 우선하고 구조 개편은 후순위로 구분했다.
기존 nonblank task 추가, whitespace 거부, textContent 삽입, 목록 추가, 입력 초기화, heading/list semantics 보존을 명시했다.
Trade-off는 명확한 문구의 이점과 화면의 추가 텍스트 비용, 단순 구조 유지와 향후 분리 비용을 다뤘다.
위험·미해결 사항에는 screen reader 알림, focus, 반응형·target 크기, 사용자 영향 우선순위의 미측정을 남겼다.

이 결과는 작은 단일 HTML fixture에 대한 사례다. 구조적 SourceReference 검증은 판단의 사실성·완전성을 보증하지 않는다.
예를 들어 대비 수치와 브라우저 동작은 별도 실측하지 않았다. Finding이 대부분 agreement인 입력이므로
실질적인 상충 판단의 해결 품질이나 대규모 Repository 일반화는 검증하지 못했다.
ApprovedDecision은 Phase B의 Task 실행·Repository 수정 권한이 아니다.

## 회귀 테스트와 실패 처리

- `git diff --check`: 통과.
- `pnpm typecheck`: 통과.
- `pnpm format:check`: 통과.
- `pnpm test`: 88파일 / 1,440개 테스트 통과였으나 Vitest worker의 `onTaskUpdate` RPC timeout 한 건으로 exit 1.
- `pnpm test --exclude '.tmp-phase-a-e2e/**' --maxWorkers=2`: 88파일 / 1,440개 정상 통과, exit 0, 94.97초.
  임시 실제 AI Runner를 회귀 테스트에서 제외하고 실행 worker 수만 제한했다. 기존 테스트·시간 제한·검증은 바꾸지 않았다.
- 기존 Phase A 통합 테스트와 Governance 테스트를 실제 실행하여 승인 대기·거부, 위조/재사용 Confirmation,
  Review Binding 변조, 최신 Policy/Repository 재검증, Claim 일회성, Evidence/Comparison 실패, Fail-fast를 검증했다.
  이 시나리오의 AI 및 TTY는 Mock이며 실제 Codex의 오류 생성 실험이 아니다.
- 첫 실제 AI 시도는 sandbox의 app-server 초기화 EPERM으로 Staffing 전에 process exit 1.
  제한 밖 실행 권한을 사용해 동일 Runner를 다시 실행했다. 모델 검증 실패를 조작하거나 자동 재시도하지 않았다.

## 실행 증거와 재현 범위

승인·Revision 증거 디렉터리:
`/private/var/folders/8l/rz27d66n1134srpplkyq8ghw0000gn/T/phase-a-live-evidence-ldQH90`

Reject 증거 디렉터리:
`/private/var/folders/8l/rz27d66n1134srpplkyq8ghw0000gn/T/phase-a-live-evidence-ZseRh4`

각 디렉터리의 execution.log와 임시 Runner 원본, verified-record-counts.json으로 실행과 저장 결과를 확인할 수 있다.
승인·Revision 디렉터리에는 input.json, codex-calls.json, events.json, initial-state.json, revision-1.json, revision-2.json,
approved-state.json, restored-approval.json, checks.json 및 테스트 Repository가 있다.
격리 Ledger의 key는 비공개 임시 홈에 있으며 Repository 보고서로 복사하지 않는다.
임시 Runner와 로그는 증거 디렉터리에 보존하고 제품 Repository에서는 제거한다.
임시 경로는 OS 정리로 사라질 수 있으므로 장기 보존 증거 저장소는 아니다.

## 미검증과 완료 판단

현재 구현된 Phase A의 Staffing → Decisions → Comparison → Synthesis → Human Direction Approval →
ApprovedDecision 발급·조회 경로는 실제 Codex와 실제 Human TTY 조건에서 검증 완료다.
Revision·Reject·실패 및 권한 차단의 검증은 위에 구분한 실제 Codex + Mock Human 또는 기존 Mock 통합 테스트 범위다.

프로세스 재시작 후 영속 Checkpoint / Resume 복구, Phase B Handoff, 실제 브라우저/접근성 실측은 검증 완료가 아니다.
Phase B Handoff는 구현 완료로 판단하지 않으며, AI 판단의 의미적 정확성·완전성도 이 검증으로 증명되지 않는다.
MemorySaver의 동일 프로세스 Interrupt / Resume 성공을 영속 복구나 Phase B 실행 권한으로 확대 해석하지 않는다.
