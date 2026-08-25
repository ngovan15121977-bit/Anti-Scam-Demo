# Phase 2 — Manager ↔ Specialist Communication Schema

**Version:** 0.1  
**Branch:** `tuananh-dev-rieng`  
**Nguyên tắc:** LLM không tool thực thi · Fail-closed · Max severity (giảm FN) · Backend + HITL quyền lực cuối

---

## 1. Mục tiêu

Chuẩn hóa JSON giữa:

- **Specialists** → tóm tắt có cấu trúc (không raw transcript / PII thô)
- **Bank Risk Manager** → khuyến nghị cuối + confidence + rationale mức quản lý
- **Backend** → chỉ thực thi sau `validate(manager_output)`

---

## 2. Envelope request (input vào Manager)

```json
{
  "request_id": "uuid-v4",
  "context": {
    "user_id_hash": "sha256-or-internal-id",
    "session_type": "call_only | tx_only | call_and_tx",
    "locale": "vi",
    "timestamp_iso": "2026-08-24T13:00:00+07:00"
  },
  "specialists": {
    "call_guardian": { "...": "see below" },
    "transaction_risk": { "...": "see below" },
    "behavior_profiler": { "...": "see below" }
  }
}
```

### 2.1 `specialists.call_guardian`

Map từ output Phase 1 (`scam_guardian_agent` / hybrid).

| Field | Type | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| available | bool | ✓ | false nếu STT/agent fail → fail-closed phía backend |
| risk_score | int 0–100 | khi available | |
| risk_level | string | khi available | safe \| warning \| high \| critical |
| recommended_action | string | khi available | CONTINUE \| MONITOR \| PAUSE \| STOP |
| signals | string[] | khi available | max 6, từ whitelist Guardian |
| decision_confidence | float 0–1 | khi available | |
| summary | string | khi available | 1–3 câu tiếng Việt, không PII |

### 2.2 `specialists.transaction_risk`

Map từ `risk_rules` / `transaction_graph` / assess API.

| Field | Type | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| available | bool | ✓ | |
| risk_score | float/int 0–100 | khi available | |
| risk_level | string | khi available | low \| medium \| high (map nội bộ → safe/warning/high nếu cần) |
| signals | string[] | khi available | vd. blacklist_exact_match, unusual_amount |
| requires_hitl | bool | khi available | |
| summary | string | khi available | 1–3 câu VN |

### 2.3 `specialists.behavior_profiler`

Phase 2 v0 = rule-based (velocity, new device, amount vs history). Có thể `available: false`.

| Field | Type | Bắt buộc |
|-------|------|----------|
| available | bool | ✓ |
| anomalies | string[] | khi available |
| summary | string | khi available |

---

## 3. `manager_output` (output bắt buộc)

```json
{
  "recommended_action": "CONTINUE|MONITOR|PAUSE|STOP",
  "confidence": 0.0,
  "rationale": "Giải thích mức quản lý (không chỉ liệt kê signal thô)",
  "evidence_used": ["call_guardian.otp_request", "transaction_risk.blacklist_exact_match"],
  "missing_info": [],
  "escalate_to_human": false
}
```

| Field | Constraint |
|-------|------------|
| recommended_action | enum nghiêm |
| confidence | 0.0–1.0 |
| rationale | ≥ 20 ký tự, tiếng Việt, tư duy quản lý |
| evidence_used | mảng string, prefix specialist |
| missing_info | nếu non-empty → self-ask hoặc escalate |
| escalate_to_human | true khi confidence thấp hoặc thiếu bằng chứng quan trọng |

---

## 4. Conflict & safety policy (bắt buộc code, không chỉ prompt)

1. **Max severity:** nếu bất kỳ specialist nào STOP / critical → Manager không được hạ xuống CONTINUE.
2. **Fail-closed:** schema invalid, LLM timeout, specialist `available: false` quan trọng → PAUSE hoặc STOP theo policy backend.
3. **Không trung bình hóa:** không lấy “trung bình” action khi mâu thuẫn.
4. **LLM không thực thi:** không transfer, không khóa TK, không sửa DB.
5. **Backend validate** trước mọi hành động user-facing.

Severity order (cao → thấp): `STOP > PAUSE > MONITOR > CONTINUE`.

---

## 5. Mapping action nhanh (tham chiếu adapter)

| Guardian action | Tx level / HITL | Gợi ý Manager tối thiểu |
|-----------------|-----------------|-------------------------|
| STOP | * | STOP |
| PAUSE | high / HITL | PAUSE hoặc STOP |
| MONITOR | medium | MONITOR hoặc PAUSE |
| CONTINUE | low, no HITL | CONTINUE (nếu behavior cũng sạch) |
| available=false | * | PAUSE + escalate |

---

## 6. File liên quan

| Path | Vai trò |
|------|---------|
| `schemas/manager_recommendation.json` | JSON Schema validate `manager_output` |
| `prompts/manager_v0.1.yaml` | System prompt Manager |
| `src/app/services/risk_manager/` | schema.py, manager_agent.py, orchestrator, adapters |
| `eval/dataset/manager_cases_v0.json` | Case mock / eval |
| `eval/scripts/run_manager_mock.py` | Chạy mock không wire production |

---

**Freeze schema v0.1** trước khi mở rộng field. Mọi đổi schema → version mới + số liệu trước/sau.
