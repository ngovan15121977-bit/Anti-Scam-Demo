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

- Rule Engine/ML, not LLM, owns `risk_score` and `risk_level`.
- LLM has no database or transfer tool and only receives bounded evidence.
- Prompt injection is treated as untrusted transaction text.
- MEDIUM/HIGH remains `AWAITING_DECISION` until human choice.
- PIN is hashed; raw PIN is never stored in audit logs.
- Device ID and IP are HMAC-pseudonymized before persistence; precise location is never stored.
- Sau khi đăng nhập thành công, vị trí gần đúng là bắt buộc ở màn setup trước khi tiếp tục vào các trang chức năng; bước thanh toán không yêu cầu popup vị trí.
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
