# AI Workspace Project Direction

이 문서는 AI Workspace의 North Star이며, 새 기능과 설계 판단의 기준이다.
현재 사용법은 [README](../README.md), 구현 구조는 [Architecture](architecture.md),
단계별 계획은 [Roadmap](roadmap.md)에 둔다. 아래 목표 전체가 현재 구현됐다는 뜻은 아니다.

## What AI Workspace is

> AI Workspace is not a coding agent.
>
> It is a governance and execution harness for controlling how existing agents access context, modify repositories, produce evidence, recover from failure, collaborate, and escalate decisions to humans.

AI Workspace는 새로운 Coding Agent를 만드는 프로젝트가 아니다. Codex, Claude,
Cursor/Devin류처럼 기존 Agent가 실제 Repository에서 안전하고 효율적으로 판단하고
작업하도록 운영 환경과 통제 계층을 만드는 프로젝트다. 현재 연동 구현은 Codex CLI이며,
다른 Agent 지원, 협업, recovery는 목표 방향이지 현재 제공되는 기능이 아니다.

```text
Existing Agents
      ↓
AI Workspace
- Authority
- Context
- Policy
- Isolation
- Evidence
- Governance
- Recovery (planned)
      ↓
Repository
```

Agent는 교체 가능한 Worker이고, AI Workspace는 Agent가 일하는 운영 환경이다.
프로젝트의 핵심 자산은 Authority & Boundary, Context Routing, Repository Isolation,
Evidence Semantics, Durable Shared State, Conflict / Agreement Modeling, Decision Synthesis,
Human Escalation, Measurable Evaluation이다. 이 중 후속 협업·상태·평가 기반은
[로드맵](roadmap.md)에서 현재 구현과 구분한다.

## What AI Workspace is NOT

- 새로운 Coding Agent나 모델
- Devin/Cursor clone
- prettier CLI / TUI 자체
- generic workflow engine 또는 builder
- multi-agent chat demo나 단순 Agent chat UI
- agent personality framework

CLI는 Harness를 사람이 관찰하고 통제하는 operator/debug interface이며 제품의 핵심 가치가
아니다. 다른 Agent나 제품보다 우월하다는 주장은 구현과 평가를 대신하지 않는다.

## Core Principles

### 1. Authority & Boundary

Agent가 무엇을 읽고 수정하고 실행할 수 있는지 Harness가 제한한다.
현재 TaskContract, allowedPaths / forbiddenPaths, inspection policy, Planning limits,
approval boundary가 이 원칙을 구체화한다. Scope 검사는 변경 후 위반 탐지이며,
모든 파일 쓰기와 명령을 사전에 차단하는 완전한 sandbox를 의미하지 않는다.

### 2. Right Agent × Right Context

향후 Specialist에게 전체 Repository를 무조건 제공하지 않고 역할과 Task에 필요한 Context를
제공한다. 현재 repository inspection과 제한된 Worker warm-start context는 그 기반이지만,
완전한 role-aware context routing은 아직 구현되어 있지 않다.

### 3. Evidence over Claims

> Agent says "done" is not evidence.

AI의 자기 보고보다 실제 workspace에서 관찰한 diff, changed paths, verification command,
exit code, test/build/typecheck 결과를 신뢰한다. 현재 `passed`는 Scope와 구성된 Verification의
통과를 나타내며 자연어 acceptance criteria의 충족을 자동으로 보장하지 않는다.

### 4. Explainable Governance

향후 여러 Agent의 긴 대화 로그를 Human에게 그대로 전달하지 않고 Agreement, Conflict,
Trade-off, Evidence, Recommendation, Escalation으로 구조화한다. 현재 Review는 실제 변경과
Worker output을 보여주는 단계이며, 이런 종합 판단이나 Executive Report는 planned다.

### 5. Human Governance

중요한 권한은 Human에게 남긴다. 현재 Task approval, Review, Apply, Commit, Push,
Cleanup은 각각 다른 결정이다. 중요한 scope / policy 변경과 최종 merge / release도
Agent가 임의로 결정할 권한이 아니다. 향후 escalation과 governance policy는 이 경계를
보존해야 한다.

## Design Decision Filter

새 기능을 추가하기 전에 다음을 묻는다.

1. Agent 자체를 더 똑똑하게 만드는가, 아니면 Agent를 더 잘 통제하는가?
2. Authority / Context / Isolation / Evidence / Governance / Recovery 중 무엇을 강화하는가?
3. 단순 CLI UX 개선이라면 정말 핵심 가치에 필요한가?
4. 향후 Single vs Multi-Agent 평가에 의미 있는 데이터나 구조를 제공하는가?

현재 요구에 필요한 최소 구현부터 검증한다. 미래 재사용이나 조직적 대칭성만을 이유로
계층과 abstraction을 먼저 만들지 않는다. Reliable Worker before Agent Team을 유지한다.
