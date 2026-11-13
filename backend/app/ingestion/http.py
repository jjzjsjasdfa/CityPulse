"""Shared HTTP lifecycle and robots-policy enforcement for source jobs."""

from collections.abc import Mapping
from typing import Any, Self

import httpx

from app.ingestion.common import RobotsPolicyCache

INVALID_USER_AGENT_MARKERS = ("contact-required", "example.com", ".invalid")


def source_user_agent(value: str, *, fallback: str | None = None) -> str:
    normalized = value.strip()
    invalid = not normalized or any(marker in normalized for marker in INVALID_USER_AGENT_MARKERS)
    if invalid and fallback is not None:
        return fallback
    if invalid:
        raise ValueError("Set INGESTION_USER_AGENT to a truthful product and contact value.")
    return normalized


class SourceHttpClient:
    def __init__(
        self,
        *,
        user_agent: str,
        timeout_seconds: float = 20,
        follow_redirects: bool = False,
        fallback_user_agent: str | None = None,
    ) -> None:
        self.user_agent = source_user_agent(user_agent, fallback=fallback_user_agent)
        self.client = httpx.Client(
            headers={"User-Agent": self.user_agent},
            timeout=timeout_seconds,
            follow_redirects=follow_redirects,
        )
        self.robots = RobotsPolicyCache()

    def get(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        check_robots: bool = True,
    ) -> httpx.Response:
        if check_robots:
            self.robots.assert_allowed(self.client, url, self.user_agent)
        response = self.client.get(url, params=params)
        response.raise_for_status()
        return response

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
