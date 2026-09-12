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


def assert_robots_allowed(client: httpx.Client, target_url: str, user_agent: str) -> None:
    parts = urlsplit(target_url)
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    try:
        response = client.get(robots_url)
    except httpx.HTTPError as exc:
        raise RobotsPolicyError(f"Could not verify robots.txt at {robots_url}: {exc}") from exc

    # RFC-style crawler behavior treats a missing robots.txt as no published rules.
    if response.status_code == 404:
        return
    if response.status_code in {401, 403}:
        raise RobotsPolicyError(f"robots.txt access was denied with HTTP {response.status_code}")
    if response.status_code >= 400:
        raise RobotsPolicyError(
            f"Could not verify robots.txt: {robots_url} returned HTTP {response.status_code}"
        )

    policy = RobotFileParser()
    policy.set_url(robots_url)
    policy.parse(response.text.splitlines())
    if not policy.can_fetch(user_agent, target_url):
        raise RobotsPolicyError(f"robots.txt does not allow fetching {target_url}")
