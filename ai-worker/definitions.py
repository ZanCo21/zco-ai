"""Definition detection for "what is X?" queries.

Lexical frequency favours passages that *mention* a term often (summaries,
troubleshooting notes) over the passage that *defines* it once. For queries
with definition intent ("apa itu MCAR?") this module finds, per chunk, the
terms the chunk actually defines, using two classic patterns:

* acronym + expansion      ``MCAR (Missing Completely at Random)`` /
                           ``Missing Completely at Random (MCAR)``
                           (initials of the expansion must spell the acronym)
* copular definition       ``Negasi adalah operasi logika ...``

The result is used as a rank multiplier in ``retrieval.py`` only; it never
decides relevance on its own.
"""

from __future__ import annotations

import re

from text_analysis import stem, tokenize

# "apa itu X", "apa yang dimaksud X", "definisi X", "pengertian X", "X artinya", ...
_INTENT_RE = re.compile(
    r"\b(apa\s+(itu|yang\s+dimaksud|maksud|arti|pengertian|definisi)|apakah\s+\w+\s+itu|"
    r"definisi|pengertian|arti(nya)?|maksud\s+dari|singkatan|kepanjangan|"
    r"what\s+is|what\s+are|define|meaning\s+of)\b",
    re.IGNORECASE,
)

_ACRONYM_THEN_EXPANSION = re.compile(r"\b([A-Z][A-Za-z0-9]{1,9})\s*\(\s*([A-Za-z][^()|\n]{4,90}?)\s*\)")
_EXPANSION_THEN_ACRONYM = re.compile(r"([A-Za-z][A-Za-z\- ]{4,90}?)\s*\(\s*([A-Z][A-Za-z0-9]{1,9})\s*\)")
_COPULAR = re.compile(
    r"^[\s\-*#>\d.)]*([^\n:|()]{2,50}?)\s+(?:adalah|merupakan|ialah|didefinisikan\s+sebagai|"
    r"is\s+defined\s+as|refers\s+to)\b",
    re.IGNORECASE | re.MULTILINE,
)


def has_definition_intent(query: str) -> bool:
    return bool(_INTENT_RE.search(query or ""))


def _initials_spell(acronym: str, expansion: str) -> bool:
    """True if the acronym's letters are, in order, initials of expansion words."""
    letters = [c.lower() for c in acronym if c.isalpha()]
    words = [w for w in re.split(r"[\s\-/]+", expansion) if w]
    if len(letters) < 2 or not words:
        return False
    i = 0
    for w in words:
        if i < len(letters) and w[0].lower() == letters[i]:
            i += 1
    return i == len(letters)


def definition_terms(content: str) -> set[str]:
    """Lower-cased terms (and their stems) that *content* defines."""
    terms: set[str] = set()

    def add(text: str) -> None:
        for t in tokenize(text):
            terms.add(t)
            terms.add(stem(t))

    for m in _ACRONYM_THEN_EXPANSION.finditer(content):
        if _initials_spell(m.group(1), m.group(2)):
            terms.add(m.group(1).lower())
            add(m.group(2))
    for m in _EXPANSION_THEN_ACRONYM.finditer(content):
        if _initials_spell(m.group(2), m.group(1)):
            terms.add(m.group(2).lower())
            add(m.group(1))
    for m in _COPULAR.finditer(content):
        add(m.group(1))
    return terms
