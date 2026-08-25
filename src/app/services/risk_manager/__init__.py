"""Phase 2 — Bank Risk Manager (hierarchical multi-agent foundation).

LLM chỉ đưa khuyến nghị. Backend validate + HITL mới được thực thi.
"""

from .schema import (
    ManagerOutput,
    SpecialistPack,
    ManagerRequest,
    validate_manager_output,
    ACTION_SEVERITY,
    max_severity_action,
)

__all__ = [
    "ManagerOutput",
    "SpecialistPack",
    "ManagerRequest",
    "validate_manager_output",
    "ACTION_SEVERITY",
    "max_severity_action",
]
