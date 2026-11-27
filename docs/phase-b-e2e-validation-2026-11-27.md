# Phase B E2E 및 Phase A 회귀 검증 — 2026-11-27

기준 커밋은 `0baa4a7`이다. 이번 변경은 검증 코드와 문서에 한정한다. 실사용 Organization 상위 Graph는 아직 없으므로 테스트가 공개 Phase A Graph에서 완료된 Handoff를 받아 공개 Phase B Graph에 전달한다. [이전 Phase A 실제 실행 기록](phase-a-e2e-validation-2026-11-17.md)

## 자동화 검증

환경은 macOS, Node.js 23.9.0, pnpm 11.7.0, Vitest 3.2.7이다. 각 테스트는 별도 임시 Git Repository와 테스트 전용 Governance 저장소를 사용한다. LangGraph, 승인·예약·Claim 검증, Ledger 서명·저장, 구조화된 계약 검증, Git Worktree·Patch 적용, 검증 명령, Artifact 기록은 실제 코드를 사용한다. Human TTY 입력과 Codex의 분석·계획·구현 출력은 테스트 대역을 사용한다. Work Decomposition, 선택 및 배정 입력도 테스트에서 공급한다.

| 시나리오 | 검증 범위 | 결과 |
| --- | --- | --- |
| A. 단일 Read | 승인된 파일 Context, Evidence 검증, `read-completed` → `read-integrated` Work Item 및 FinalResult, 원본 판단 복원 | 기존 회귀 테스트 |
| B. 단일 Write | Read 준비와 별도 Write 권한, 구조화된 계약과 Binding, Worktree 구현·Artifact 검증, 최종 Patch와 준비 계약 복원 | 기존 회귀 테스트 |
| C·D. 복수 Specialist·Work Item | Specialist 2명, Work Item 2개, Assignment 3개. 첫 업무에 Read와 Write를 함께 배정하고 두 번째 업무는 별도 파일을 수정. 호출 동시성 최대 2, Reservation·Claim 각 5건, 선택한 결과 2개와 통합 Patch 검증 | 통과, 7.414초 |
| E. 의존성 대기 | 첫 Work Item의 통합 결과 보존, 후속 Assignment 실행과 예약 차단, Reservation·Claim 각 3건, FinalResult `pending`에 누락 업무 명시 | 통과, 4.265초 |
| 일부 실행 실패 | 두 번째 Write에서 허용 범위 밖의 파일을 수정. 실패한 Write 기록 및 Reservation·Claim 각 5건 보존. 첫 Work Item 통합은 성공, FinalResult는 `failed` | 통과, 4.591초 |

C–E의 Goal은 “Review and correct wording in both documentation files”이며, 형식과 관련 없는 파일을 보존하도록 제약한다. Goal과 응답은 테스트 Fixture다. 각 시나리오에서 원본 HEAD와 Git 상태가 유지되고 Integration Worktree가 정리되는지 확인했다. 기존 Assignment 실행 Worktree는 코드의 기존 보존 정책을 따르며 테스트 종료 시 Fixture가 제거한다. 위 시간은 시나리오별 실측 실행 시간이다. Phase A·B 단계별 계측은 수집하지 않았으며, 자동화 테스트에서 실제 Codex 호출은 0회다.

추가 회귀가 검증한 출처 관계는 다음과 같다.

1. `FinalResult`의 Work Item 순서, Snapshot, 변경 경로, Patch·보고서 Fingerprint를 비교한다. 보고서의 Git 검증 명령은 한 번만 기록된다.
2. 각 Work Item 기록의 Digest와 원본 Assignment ID·Specialist ID를 대조한다.
3. 읽기 결과에서 Context Digest와 원본 AgentDecision·Evidence를, 쓰기 결과에서 실행 Artifact·준비 Invocation·TaskContract Binding·ImplementationPlan을 복원한다.
4. 기존 회귀에서 위임 만료 후 과거 결과 조회를 확인한다. 현재 정책·위임·Snapshot이 유효해야 새 실행이나 통합을 할 수 있다.

Work Item 성공 기록은 Governance Ledger에 귀속된다. 최종 결과 자체는 Phase B State와 최종 Artifact 보고서에 있으며 별도의 FinalResult Ledger 레코드는 없다. 후속 평가는 Digest를 이용해 Work Item 기록과 원본 결과를 복원할 수 있다. 파일 산출물은 임시 저장소 수명에 영향을 받는다.

기존 회귀가 Phase A의 Staffing 승인, 독립 읽기 전용 분석, Evidence, Comparison, Refinement, Synthesis, Revision·Reject, 방향 단독 승인과 Handoff를 다룬다. Governance·Runtime·통합 테스트는 변조된 Handoff, 만료·정책 변경·철회, 중복 Reservation과 Claim, 위조 Permit, Snapshot·계약 Binding 불일치, 범위 위반, 검증 실패, Artifact 변조 및 Patch 충돌을 각 경계에서 검증한다. 이번 테스트는 그 경계들을 복수 Specialist 및 Work Item의 실제 Graph 실행으로 연결했다.

집중 검증 재현 명령

```sh
pnpm test src/workflows/development-organization/phase-a/tests/phase-a.integration.test.ts \
  --maxWorkers=1 --testTimeout=30000 -t two-Work-Item
```

전체 회귀는 83개 파일, 1,474개 테스트가 통과했다. 기본 `pnpm test`는 최종 요약을 출력하지 않아 중단했다. 같은 스위트를 나머지 82개 파일과 Phase A 통합 파일의 이름 기반 11개 배치로 분할해 검증했다. 최종 Goal을 적용한 세 시나리오는 위 집중 명령으로 다시 통과했다. `pnpm typecheck`, `pnpm format:check`, `git diff --check`도 통과했다.

## 실제 Codex 확인과 완료 판정

Codex CLI 0.169.1의 ChatGPT 로그인 상태를 확인했다. 별도 임시 Git Repository에서 승인 프롬프트 없는 읽기 전용 연결 확인을 1회 실행해 `READY` 응답과 원본 Git 상태 무변경을 확인했다. 이 실행은 Workflow, 사용자 승인, 계획, 구현 또는 통합을 수행하지 않았다. 기본 관리 샌드박스에서는 앱 서버 초기화가 운영체제 권한 오류로 차단되었고, 연결 확인은 해당 실행에 대한 도구 권한 승인을 받은 뒤 수행했다.

실제 사용자가 정책 설정과 방향·위임을 확인하는 Human Confirmation을 이 실행 세션에서 받지 못했다. 기존 모의 TTY를 실제 승인으로 사용하지 않았으므로 실제 Codex 기반 Phase A → Phase B → FinalResult E2E는 **미검증**이다. 이 완료 기준이 남아 있어 Step 5.3.7을 완료로 표시하지 않으며, Step 6 구현에는 진입하지 않았다. 현재 Git 검증은 Patch 범위와 `git diff --check`에 한정된다. 실제 기능 품질과 Acceptance Criteria의 의미적 평가는 후속 검증 범위다.
