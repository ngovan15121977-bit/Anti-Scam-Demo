# Patches tài liệu — dán vào JOURNAL.md / ROADMAP.md

## JOURNAL.md — thay section Week 6 "Đã hoàn thành" trở đi (giữ phần mục tiêu)

### Đã hoàn thành
- [x] Phase 2 nhẹ: schema Manager ↔ Specialist (`docs/phase2/manager_schema.md`, `schemas/manager_recommendation.json`)
- [x] Prompt `prompts/manager_v0.1.yaml` (tư duy quản lý VN, max severity, fail-closed)
- [x] Mock dataset 8 case + `eval/scripts/run_manager_mock.py`
- [x] Package `src/app/services/risk_manager/` + adapters (Guardian / Transaction / Behavior)
- [x] Mock LLM **8/8 PASS** — model `openai/gpt-oss-20b` (2026-08-25)

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| gpt-oss JSON bị cắt (max tokens) | `max_completion_tokens=1500` + retry | Schema ổn trên 8 case |
| Model yaml ghi đè env | Ưu tiên `MANAGER_MODEL` / `GUARDIAN_AGENT_MODEL` | Đồng bộ model Guardian |

### Bài học
- Manager chỉ khuyến nghị; `apply_safety_floor` hard-code max severity sau LLM.
- Mock API trước khi wire production.

### Checklist bàn giao đề tài
- [ ] README cập nhật evaluation 100% + roadmap 6 tuần
- [ ] `eval/results/report.md` có số liệu cuối
- [x] Phase 2 nhẹ: Manager schema + prompt + mock 8/8
- [ ] `JOURNAL.md` + `ROADMAP.md` đủ 6 tuần
- [ ] Demo chạy được 2 luồng chính

---

## ROADMAP.md — cập nhật Tuần 6 Phase 2 nhẹ

```markdown
**Phase 2 nhẹ:**
- [x] Phác thảo kiến trúc Bank Risk Manager (MD + schema JSON)
- [x] System prompt Manager (`manager_v0.1.yaml`)
- [x] Mock 1 vòng: 8/8 PASS LLM (`openai/gpt-oss-20b`)
- [ ] Wire adapter Guardian + Transaction + backend validate (đang làm)
```

Đổi trạng thái tuần 6 nếu muốn: giữ ⏳ hoặc ghi `Phase 2 nhẹ ✅ mock`.
