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
from .orchestrator import (
    build_request,
    build_request_from_objects,
    run_manager,
    validate_manager_decision,
    enforce_action_allowed,
    ManagerGateResult,
)

__all__ = [
    "ManagerOutput",
    "SpecialistPack",
    "ManagerRequest",
    "validate_manager_output",
    "ACTION_SEVERITY",
    "max_severity_action",
    "build_request",
    "build_request_from_objects",
    "run_manager",
    "validate_manager_decision",
    "enforce_action_allowed",
    "ManagerGateResult",
]
