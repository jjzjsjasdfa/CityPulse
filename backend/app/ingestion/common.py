from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx

HTML_VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


class RobotsPolicyError(RuntimeError):
    """Raised when crawling permission cannot be verified or is denied."""


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class RobotsPolicyCache:
    """Fetch robots.txt once per origin and evaluate every requested path against it."""

    def __init__(self) -> None:
        self._policies: dict[tuple[str, str], RobotFileParser | None] = {}

    def assert_allowed(self, client: httpx.Client, target_url: str, user_agent: str) -> None:
        parts = urlsplit(target_url)
        origin = (parts.scheme.lower(), parts.netloc.lower())
        if origin not in self._policies:
            robots_url = urlunsplit((*origin, "/robots.txt", "", ""))
            try:
                response = client.get(robots_url)
            except httpx.HTTPError as exc:
                raise RobotsPolicyError(
                    f"Could not verify robots.txt at {robots_url}: {exc}"
                ) from exc

            # RFC-style crawler behavior treats a missing robots.txt as no published rules.
            if response.status_code == 404:
                self._policies[origin] = None
            elif response.status_code in {401, 403}:
                raise RobotsPolicyError(
                    f"robots.txt access was denied with HTTP {response.status_code}"
                )
            elif response.status_code >= 400:
                raise RobotsPolicyError(
                    f"Could not verify robots.txt: {robots_url} returned "
                    f"HTTP {response.status_code}"
                )
            else:
                policy = RobotFileParser()
                policy.set_url(robots_url)
                policy.parse(response.text.splitlines())
                self._policies[origin] = policy

        policy = self._policies[origin]
        if policy is not None and not policy.can_fetch(user_agent, target_url):
            raise RobotsPolicyError(f"robots.txt does not allow fetching {target_url}")


def assert_robots_allowed(client: httpx.Client, target_url: str, user_agent: str) -> None:
    """Compatibility helper for one-off checks; jobs use a cached policy guard."""
    RobotsPolicyCache().assert_allowed(client, target_url, user_agent)
