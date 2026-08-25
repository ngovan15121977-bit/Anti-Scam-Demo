# Phase 2 — Wire adapter + backend validate

## 1. Commit (trên máy bạn)

```bash
git checkout tuananh-dev-rieng
# giải nén / copy file Phase 2 vào root repo
git add docs/phase2 schemas/manager_recommendation.json prompts/manager_v0.1.yaml \
  prompts/README.md eval/dataset/manager_cases_v0.json eval/scripts/run_manager_mock.py \
  src/app/services/risk_manager
# cập nhật JOURNAL.md + ROADMAP.md theo docs/phase2/DOC_UPDATES.md
git add JOURNAL.md ROADMAP.md prompts/README.md
git commit -m "feat(phase2): Bank Risk Manager schema, prompt v0.1, mock 8/8, adapters + orchestrator"
git push -u origin tuananh-dev-rieng
```

## 2. Adapter Guardian (sau hybrid/agent)

```python
from src.app.services.risk_manager.orchestrator import (
    build_request_from_objects,
    run_manager,
    validate_manager_decision,
    enforce_action_allowed,
)

# Sau analyze_hybrid / analyze_with_guardian_agent:
result, meta = analyze_hybrid(state, latest_text)  # GuardianRiskResult + HybridMeta
# hoặc: result, conf = analyze_with_guardian_agent(..., return_confidence=True)

req = build_request_from_objects(
    session_type="call_only",  # hoặc call_and_tx nếu có tx
    user_id_hash=str(user_id),
    guardian_result=result,
    guardian_confidence=getattr(meta, "agent_confidence", None),
)
gate = run_manager(req, use_llm=True, deterministic_fallback=True)
if not gate.output:
    # không bao giờ silent allow
    action = "PAUSE"
else:
    checked = validate_manager_decision(
        gate.output,
        specialists=req.specialists,
        session_type=req.context.session_type,
    )
    action = enforce_action_allowed(checked.output.recommended_action)
# Backend enforce STOP/PAUSE như hiện tại — KHÔNG để LLM tự transfer
```

## 3. Adapter Transaction

```python
# Sau risk_engine.calculate_risk / transaction_graph:
# risk: RiskResult hoặc dict assess response

req = build_request_from_objects(
    session_type="tx_only",  # hoặc call_and_tx
    user_id_hash=str(user_id),
    transaction_result=risk,  # có final_score 0..1 hoặc risk_score 0..100
    risk_signals=signals,     # optional list từ risk_rules
)
gate = run_manager(req, use_llm=True)
...
```

## 4. Call + Tx cùng lúc

```python
req = build_request_from_objects(
    session_type="call_and_tx",
    user_id_hash=str(user_id),
    guardian_result=guardian_result,
    guardian_confidence=conf,
    transaction_result=tx_result,
    risk_signals=tx_signals,
)
gate = run_manager(req)
```

## 5. Feature flag (khuyến nghị)

```env
RISK_MANAGER_ENABLED=false   # bật true khi đã test
RISK_MANAGER_USE_LLM=true
```

Khi `RISK_MANAGER_ENABLED=false`: giữ hành vi Phase 1 (Guardian/Tx riêng).  
Khi `true`: gọi orchestrator, backend chỉ áp `enforce_action_allowed`.

## 6. Nguyên tắc

1. LLM không tool thực thi  
2. Mọi action qua `validate_manager_decision` + `apply_safety_floor`  
3. Fail-closed → PAUSE + escalate  
4. Max severity giữa specialist và Manager  
