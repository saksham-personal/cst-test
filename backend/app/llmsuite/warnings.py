from __future__ import annotations

from typing import Any

from app.llmsuite.schemas import ClientWarning, WarningCode


def build_client_warning(code: WarningCode, message: str, **details: Any) -> ClientWarning:
    """Create a consistently shaped warning payload.

    This small helper exists now because the eventual real adapter will emit
    many warning branches from auth recovery, rate limiting, blank-message
    retries, and structured-output repair.
    """

    return ClientWarning(code=code, message=message, details=details)

