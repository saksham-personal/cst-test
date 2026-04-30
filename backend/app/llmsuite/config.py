from __future__ import annotations

from pydantic import BaseModel, Field


class LLMSuiteConfig(BaseModel):
    """Configuration for the future LLMSuite proxy adapter.

    The current implementation is a safe stub and does not launch a browser or
    call a provider. These fields still exist now so the real Playwright-backed
    adapter can drop in later without changing the surrounding application code.
    """

    base_url: str = "https://stub.llmsuite.local"
    chrome_executable_path: str = "TODO_CHROME_PATH"
    headless: bool = True
    user_data_dir: str = "output/playwright/llmsuite-profile"
    browser_timeout_ms: int = 60_000
    api_timeout_ms: int = 180_000
    reload_on_auth_error: bool = True
    max_auth_retries: int = 1
    max_blank_response_retries: int = 2
    max_timeout_retries: int = 1
    min_seconds_between_messages: float = 10.0
    max_requests_per_minute: int = 6
    shared_session: bool = True
    default_stub_deployment_name: str = Field(default="Company Screening Assistant v1 Stub")

