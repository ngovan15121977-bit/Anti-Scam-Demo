# FintechGuard Architecture

## Components and data flow

```mermaid
flowchart TB
    U[User] --> FE[React/Vite Frontend]
    FE -->|REST + JWT| API[FastAPI API]
    API --> TG[LangGraph transaction graph]
    TG --> G[Input guard]
    G --> E[Evidence collection]
    E --> R[Rule Engine + ML risk score]
    E --> V[(Neon PostgreSQL + pgvector)]
    R --> X[Evidence-based explanation]
    X -. optional real LLM .-> L[OpenAI]
    API --> IG[LangGraph HITL intervention graph]
    IG --> V
    API --> P[PIN verification]
    P --> V
    API --> A[Audit log]
```

## Realtime Scam Call Guardian

```mermaid
sequenceDiagram
    participant F as Frontend MainLayout
    participant A as FastAPI Guardian WebSocket
    participant S as Groq Whisper STT
    participant G as Guardian Risk Agent
    participant D as Neon PostgreSQL
    participant T as Transaction API
    F->>A: audio chunks / transcript
    A->>S: audio in memory (optional server STT)
    S-->>A: final transcript
    A->>G: bounded conversation context
    G-->>A: strict JSON: score, agent threshold, signals, action
    A->>A: schema validation + action authorization
    A->>D: risk event, signal and current agent action
    A-->>F: risk_update / alert
    T->>D: read current agent action
    T-->>T: execute STOP only when agent action = STOP
```

The Guardian agent owns the call-risk score, contextual threshold, signals and
recommended action. The backend never recalculates a Guardian threshold and
never grants the model database or transfer tools. It only validates bounded
output, persists the audit record, displays the alert, and enforces the
dangerous-action boundary (`STOP`). If the agent is unavailable, the backend
uses an explicit fail-closed pause/stop result rather than silently allowing a
transaction.

## Main transaction flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as FastAPI
    participant G as LangGraph
    participant D as Neon
    participant L as OpenAI
    U->>F: email + password
    F->>A: kiểm tra thông tin đăng nhập
    A-->>F: access token + ứng dụng đã đăng nhập
    F->>F: màn bắt buộc xác nhận vị trí gần đúng + device ID giả danh
    F->>A: POST /login/location
    A->>D: login security context + audit event
    U->>F: recipient + amount + note
    F->>A: recipient lookup
    A->>A: verify signed lookup token
    F->>A: POST /transactions/assess
    A->>G: assessment state
    G->>D: blacklist/history/pattern/behavior evidence
    G->>G: deterministic score
    opt LLM_EXPLANATION_ENABLED=true
      G->>L: evidence-only prompt
      L-->>G: bounded explanation
    end
    G-->>A: risk + signals + warning
    A-->>F: safe result or HITL warning
    F->>A: answers + PIN + human decision
    A->>D: assessment/intervention/audit
    A-->>F: completed or cancelled
```

## Code map

| Component | Location | Responsibility |
|---|---|---|
| Frontend transfer flow | `frontend/src/pages/TransferPage.tsx` | Input, warning, HITL, PIN |
| Transaction graph | `src/agents/transaction_graph.py` | Guard, evidence, score, explanation |
| HITL graph | `src/agents/intervention_graph.py` | Two-step verification |
| API | `src/app/api/transactions.py` | Assess, decision, reports, audit |
| Risk engine | `src/app/services/risk_rules.py` | Deterministic score, behavioral amount, velocity, keywords, telemetry rules |
| Telemetry boundary | `src/app/services/transaction_telemetry.py` | HMAC device/network; login stores only rounded mandatory location |
| Persistence | `src/app/models/` | Assessment, signals, context, logs, blacklist, trusted recipients |

## Safety boundaries

- The transaction graph continues to use its deterministic evidence rules for
  transfer assessment; the realtime Guardian call path uses the Guardian Risk
  Agent as the owner of its score, threshold, signals and action.
- Both agents have no database or transfer tool. Backend validation and the
  transaction API are the only components allowed to persist or block actions.
- Prompt injection is treated as untrusted transaction text.
- MEDIUM/HIGH remains `AWAITING_DECISION` until human choice.
- PIN is hashed; raw PIN is never stored in audit logs.
- Device ID and IP are HMAC-pseudonymized before persistence; precise location is never stored.
- Sau khi đăng nhập thành công, vị trí gần đúng là bắt buộc ở màn setup trên thiết bị chưa được ghi nhận; cùng tài khoản và browser/device ID đã xác nhận sẽ được bỏ qua ở phiên sau. Thiết bị mới vẫn phải cấp quyền; bước thanh toán không yêu cầu popup vị trí.
- Missing telemetry from a transaction cannot independently create a risk alert; login is fail-closed if location permission is denied.
- Device/network changes are supporting signals; only high-confidence velocity and impossible-travel rules can independently make risk HIGH.
- One alert does not automatically blacklist; promotion requires independent evidence.

## Deployment

```mermaid
flowchart LR
    Browser --> FE[Frontend container / Nginx]
    FE --> BE[Backend container / Uvicorn]
    BE --> N[(Neon PostgreSQL)]
    BE --> O[OpenAI API]
```