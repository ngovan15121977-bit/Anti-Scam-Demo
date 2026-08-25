Phase 3 — Start (Tuần 1 nền)

Mục tiêu tuần này





Session Memory + User Risk Profile (controlled summary)



Multi-step: Extract → Critique (memory/RAG/feedback) → Final



Escalation logic thông minh



HITL feedback log (jsonl) — chưa auto-tune policy



RAG light (keyword seed VN); sau nối vector_store / ScamPattern DB



Prompt Manager v0.2 (khung 5 câu hỏi cứng)

File mới

src/app/services/risk_manager/phase3/
  memory.py
  escalation.py
  feedback.py
  rag_light.py
  reasoning.py
  __init__.py
prompts/manager_v0.2.yaml
eval/scripts/run_phase3_smoke.py
docs/phase3/PHASE3_START.md

Test

python eval/scripts/run_phase3_smoke.py
# kỳ vọng: step2 STOP, memory có otp_request, PASS

# Manager v0.1 regression
python eval/scripts/run_manager_mock.py --deterministic

API

from src.app.services.risk_manager.phase3 import run_multistep_manager, record_hitl_feedback
out, trace = run_multistep_manager(req, session_key=str(session_id), use_llm=True)