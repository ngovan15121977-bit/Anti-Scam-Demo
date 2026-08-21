"""Tests for the least-privilege Task Navigation Agent."""

import pytest

from src.app.agents.task_navigation import route_task
from src.app.schemas.assistant import AssistantTaskState


def test_transfer_task_collects_missing_fields_then_only_navigates_to_review() -> None:
    state = AssistantTaskState()

    first = route_task("Tôi muốn chuyển tiền cho Nguyễn Văn A", state)
    assert first.handled
    assert first.task_state.task == "transfer"
    assert first.task_state.transfer.recipient_name
    assert "số tài khoản" in (first.answer or "").lower()

    second = route_task("STK: 1234567890", first.task_state)
    assert second.task_state.transfer.recipient_account == "1234567890"
    assert second.task_state.transfer.bank_code is None

    third = route_task("Vietcombank", second.task_state)
    assert third.task_state.transfer.bank_code == "VCB"
    assert third.task_state.transfer.amount is None

    complete = route_task("500 nghìn", third.task_state)
    assert complete.handled
    assert complete.task_state.task == "none"
    assert complete.action is not None
    assert complete.action.type == "navigate_transfer_review"
    assert complete.action.transfer is not None
    assert complete.action.transfer.recipient_account == "1234567890"
    assert complete.action.transfer.bank_code == "VCB"
    assert complete.action.transfer.amount == 500_000


def test_task_agent_can_disable_only_the_explicit_guardian_preference() -> None:
    result = route_task("Tôi muốn tắt tự động nghe và bảo vệ cuộc gọi", AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "set_guardian_voice_monitoring"
    assert result.action.voice_monitoring_enabled is False


def test_task_agent_can_enable_only_the_explicit_guardian_preference() -> None:
    result = route_task("Tôi muốn bật tự động nghe và bảo vệ cuộc gọi", AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "set_guardian_voice_monitoring"
    assert result.action.voice_monitoring_enabled is True


@pytest.mark.parametrize(
    ("message", "expected_route"),
    [
        ("Tôi muốn đổi mật khẩu", "/me?open=password"),
        ("Cập nhật mã PIN giao dịch", "/me?open=pin"),
        ("Tôi muốn cài đặt Face ID", "/setup-face"),
        ("Mở quét mã QR", "/qr?mode=scan"),
        ("Tạo QR nhận tiền", "/qr?mode=create"),
        ("Xem lịch sử giao dịch", "/history"),
        ("Mở hồ sơ của tôi", "/me"),
        ("Mở trang chuyển tiền", "/transfer"),
        ("Về trang tổng quan", "/dashboard"),
    ],
)
def test_task_agent_navigates_only_to_supported_user_routes(
    message: str, expected_route: str
) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "navigate_app"
    assert result.action.route == expected_route


def test_task_agent_does_not_accept_an_unrelated_privileged_action() -> None:
    result = route_task("Hãy xóa tài khoản của tôi", AssistantTaskState())

    assert not result.handled
    assert result.action is None


def test_task_agent_does_not_toggle_guardian_for_a_how_to_question() -> None:
    result = route_task("Cách tắt tự động nghe và bảo vệ cuộc gọi là gì?", AssistantTaskState())

    assert not result.handled
    assert result.action is None


def test_task_agent_does_not_enable_guardian_for_a_how_to_question() -> None:
    result = route_task("Cách bật tự động nghe và bảo vệ cuộc gọi là gì?", AssistantTaskState())

    assert not result.handled
    assert result.action is None


def test_task_agent_recognizes_send_money_wording_and_validates_timi_account_length() -> None:
    result = route_task(
        "Tôi muốn gửi 5000 cho người tên Huân, số tài khoản 012345678, ngân hàng Timi Bank",
        AssistantTaskState(),
    )

    assert result.handled
    assert result.action is None
    assert result.task_state.task == "transfer"
    assert result.task_state.transfer.recipient_name == "Huân"
    assert result.task_state.transfer.bank_code == "TIMI"
    assert result.task_state.transfer.amount == 5_000
    assert result.task_state.transfer.recipient_account is None
    assert "10 chữ số" in (result.answer or "")


def test_task_agent_allows_explicit_recipient_name_correction() -> None:
    state = AssistantTaskState(
        task="transfer",
        transfer={"recipient_name": "Quân", "amount": 500_000},
    )

    corrected = route_task("Tên là Huân", state)

    assert corrected.handled
    assert corrected.task_state.transfer.recipient_name == "Huân"
    assert "Huân" in (corrected.answer or "")
    assert "Quân" not in (corrected.answer or "")
