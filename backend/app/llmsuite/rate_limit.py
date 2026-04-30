from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass


@dataclass
class RateLimitResult:
    waited_seconds: float
    queue_depth_before: int


class AsyncLLMSuiteRateLimiter:
    """Process-local async rate limiter for the future LLMSuite adapter.

    The current frontend can already read the health endpoint and show the next
    allowed request time, even while the provider itself is still stubbed.
    """

    def __init__(self, *, min_interval_seconds: float = 10.0, max_requests_per_minute: int = 6):
        self.min_interval_seconds = min_interval_seconds
        self.max_requests_per_minute = max_requests_per_minute
        self._lock = asyncio.Lock()
        self._last_start_at: float | None = None
        self._recent_starts: deque[float] = deque()
        self._waiting_count = 0

    @property
    def queue_depth(self) -> int:
        return self._waiting_count

    def seconds_until_next_request(self) -> float:
        now = time.monotonic()
        if self._last_start_at is None:
            return 0.0
        return max(0.0, self.min_interval_seconds - (now - self._last_start_at))

    async def acquire(self) -> RateLimitResult:
        self._waiting_count += 1
        queue_depth_before = max(0, self._waiting_count - 1)
        waited_total = 0.0
        try:
            async with self._lock:
                while True:
                    now = time.monotonic()
                    wait_for_interval = 0.0
                    if self._last_start_at is not None:
                        wait_for_interval = max(0.0, self.min_interval_seconds - (now - self._last_start_at))

                    while self._recent_starts and now - self._recent_starts[0] > 60.0:
                        self._recent_starts.popleft()

                    wait_for_minute_window = 0.0
                    if len(self._recent_starts) >= self.max_requests_per_minute:
                        wait_for_minute_window = max(0.0, 60.0 - (now - self._recent_starts[0]))

                    wait_for = max(wait_for_interval, wait_for_minute_window)
                    if wait_for <= 0:
                        self._last_start_at = time.monotonic()
                        self._recent_starts.append(self._last_start_at)
                        return RateLimitResult(waited_seconds=waited_total, queue_depth_before=queue_depth_before)

                    await asyncio.sleep(wait_for)
                    waited_total += wait_for
        finally:
            self._waiting_count -= 1

