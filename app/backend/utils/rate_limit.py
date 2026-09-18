"""In-memory sliding-window rate limiter (no Redis). Sufficient for single-process POS."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        """Raise HTTP 429 if `key` exceeded `limit` hits inside `window_seconds`."""
        if limit <= 0:
            return
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            cutoff = now - window_seconds
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Demasiados intentos. Intenta de nuevo más tarde.",
                )
            q.append(now)


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(request: Request, *, bucket: str, limit: int, window_seconds: float = 60.0) -> None:
    """Rate-limit by client IP + named bucket (e.g. login, register, upload)."""
    ip = client_ip(request)
    limiter.check(f"{bucket}:{ip}", limit, window_seconds)
