"""Lightweight document language detection (Indonesian vs English).

Counts very common function words of each language. Used only for display
(file details) and to pick the language of generated texts (suggested
questions, study summaries); it never influences retrieval.
"""

from __future__ import annotations

import re

_ID_MARKERS = frozenset(
    "yang dan di ke dari untuk dengan adalah ini itu pada dalam tidak akan "
    "atau juga dapat sebagai oleh karena bahwa merupakan tersebut secara".split()
)
_EN_MARKERS = frozenset(
    "the and of to in is are that for with as on this be by it from "
    "an or which can was were not have".split()
)

_WORD_RE = re.compile(r"[a-z]+")

# Below this many marker hits the sample is too small to call.
_MIN_HITS = 5


def detect_language(text: str, sample_chars: int = 20000) -> str | None:
    """Return ``"id"``, ``"en"`` or ``None`` (unknown / too little text)."""
    if not text:
        return None
    words = _WORD_RE.findall(text[:sample_chars].lower())
    id_hits = sum(1 for w in words if w in _ID_MARKERS)
    en_hits = sum(1 for w in words if w in _EN_MARKERS)
    if id_hits + en_hits < _MIN_HITS:
        return None
    return "id" if id_hits >= en_hits else "en"


def count_words(text: str) -> int:
    return len(text.split()) if text else 0
