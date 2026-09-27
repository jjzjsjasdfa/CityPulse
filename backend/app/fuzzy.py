"""Normalized full-string similarity; deliberately avoid substring/token-set scores.

A short artist name contained in a longer name must not become an exact match.
Candidate retrieval remains bounded by PostgreSQL before scoring.
"""
from rapidfuzz.fuzz import ratio


def name_similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return ratio(left, right, processor=None) / 100.0
