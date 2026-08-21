from types import SimpleNamespace

import src.app.services.timi_assistant as timi_assistant
from src.app.services.timi_assistant import (
    OUT_OF_SCOPE_ANSWER,
    SENSITIVE_CREDENTIAL_ANSWER,
    contains_sensitive_credential,
    is_in_scope,
)


def test_timi_assistant_allows_product_questions() -> None:
    assert is_in_scope("Tôi quét QR bị chặn thì phải làm sao?")
    assert is_in_scope("Face ID cần bao nhiêu phần trăm để xác thực?")
    assert is_in_scope("Tôi không hiểu cách chuyển tiền")
    assert is_in_scope("Tôi muốn gửi tiền cho người thân")


def test_timi_assistant_rejects_unrelated_questions() -> None:
    assert not is_in_scope("Viết giúp tôi một bài thơ về biển")
    assert OUT_OF_SCOPE_ANSWER.startswith("Mình chỉ hỗ trợ")


def test_timi_assistant_blocks_sensitive_credentials() -> None:
    assert contains_sensitive_credential("Mã PIN: 123456")
    assert contains_sensitive_credential("OTP 987654")
    assert "không bao giờ" in SENSITIVE_CREDENTIAL_ANSWER


def test_timi_assistant_uses_groq_chat_completions(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Bạn có thể mở mục QR để quét mã."))]
            )

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, *, api_key: str, base_url: str):
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            self.chat = FakeChat()

    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            groq_api_key="test-key",
            groq_model_name="test-model",
            groq_base_url="https://example.test/openai/v1",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)

    answer, out_of_scope = timi_assistant.answer_timi_question("Tôi không hiểu cách chuyển tiền", [])

    assert answer == "Bạn có thể mở mục QR để quét mã."
    assert not out_of_scope
    assert captured["model"] == "test-model"
    assert captured["max_completion_tokens"] == 640
    assert captured["base_url"] == "https://example.test/openai/v1"
    assert captured["messages"][0] == {"role": "system", "content": timi_assistant._SYSTEM_INSTRUCTIONS}
