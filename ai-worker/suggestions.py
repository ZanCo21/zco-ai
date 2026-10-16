"""Suggested questions generated from the knowledge base content.

Candidates come from the documents themselves, in order of quality:

1. terms a chunk *defines* (``MCAR (Missing Completely at Random)``,
   ``Negasi adalah ...``)               -> "Apa itu MCAR?"
2. section headings                    -> "Jelaskan tentang Uji Normalitas"
3. salient, document-specific words    -> "Apa yang dijelaskan tentang regresi?"

Every candidate is then run through the *same* retrieval + relevance gate as
the chat (``RetrieverService.retrieve_with_relevance``) and kept only if it
passes and its top-ranked chunk belongs to the document it was generated
from. A clicked suggestion therefore never ends in "not found". Candidates are
shuffled with a caller-provided seed so suggestions vary between requests.
"""

from __future__ import annotations

import math
import random
import re
from collections import Counter

from config import RetrievalConfig
from definitions import (
    _ACRONYM_THEN_EXPANSION,
    _COPULAR,
    _EXPANSION_THEN_ACRONYM,
    _initials_spell,
)
from language import detect_language
from retrieval import RetrieverService
from text_analysis import STOP_WORDS, tokenize
from tfidf_service import TfidfIndex

_HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
_NUMBERING_RE = re.compile(r"^(?:(?:bab|chapter|bagian|part)\s+[ivxlc\d]+\b|\d+(?:\.\d+)*)[\s.:)\-]*", re.IGNORECASE)
_GENERIC_HEADINGS = {
    "daftar isi", "table of contents", "contents", "daftar pustaka", "referensi",
    "references", "bibliography", "lampiran", "appendix", "kata pengantar",
    "preface", "abstrak", "abstract", "catatan", "notes", "index", "indeks",
}

_TEMPLATES = {
    "id": {
        "define": "Apa itu {}?",
        "heading": "Jelaskan tentang {}",
        "term": "Apa yang dijelaskan tentang {}?",
    },
    "en": {
        "define": "What is {}?",
        "heading": "Explain {}",
        "term": "What does the material say about {}?",
    },
}

# Upper bound on retrieval checks per request (each is one cosine pass).
MAX_CHECKS = 60
# Checks per document per round, so a document whose candidates never pass
# (e.g. a duplicate upload, whose twin always ranks first) cannot use up the budget.
CHECKS_PER_ROUND = 4

# "Berikut adalah ...", "Contoh ini merupakan ..." match the copular pattern but define nothing.
_NON_TERMS = {
    "berikut", "contoh", "hal", "langkah", "cara", "salah", "hasil", "hasilnya",
    "kesimpulan", "kesimpulannya", "tujuan", "tujuannya", "here", "there",
    "following", "example", "result", "this", "it",
}


def _clean_heading(text: str) -> str | None:
    h = re.sub(r"[*_`]+", "", text).strip()
    h = _NUMBERING_RE.sub("", h).strip(" .:-")
    words = h.split()
    if not (1 <= len(words) <= 8) or sum(c.isalpha() for c in h) < 4:
        return None
    if h.lower() in _GENERIC_HEADINGS:
        return None
    if h.isupper() and len(words) > 1:
        h = " ".join(w if len(w) <= 4 else w.capitalize() for w in words)
    return h


def _clean_term(text: str) -> str | None:
    t = text.strip(" -*#>.,;:\t")
    words = t.split()
    if not (1 <= len(words) <= 4) or not t[:1].isalpha():
        return None
    if words[0].lower() in STOP_WORDS or words[0].lower() in _NON_TERMS or not tokenize(t):
        return None
    return t


def _definition_candidates(content: str) -> list[str]:
    out: list[str] = []
    for m in _ACRONYM_THEN_EXPANSION.finditer(content):
        if _initials_spell(m.group(1), m.group(2)):
            out.append(m.group(1))
    for m in _EXPANSION_THEN_ACRONYM.finditer(content):
        if _initials_spell(m.group(2), m.group(1)):
            out.append(m.group(2))
    for m in _COPULAR.finditer(content):
        term = _clean_term(m.group(1))
        if term:
            out.append(term)
    return out


def _salient_terms(doc_chunks: list[str], doc_freq: Counter, n_docs: int, limit: int = 5) -> list[str]:
    counts = Counter(
        t for c in doc_chunks for t in tokenize(c) if t.isalpha() and len(t) >= 5
    )
    scored = {
        t: n * math.log((n_docs + 1) / doc_freq[t]) for t, n in counts.items() if n >= 2
    }
    return sorted(scored, key=lambda t: -scored[t])[:limit]


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for it in items:
        key = it.lower()
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def build_candidates(chunks: list[dict], rng: random.Random) -> dict[str, list[str]]:
    """Return ``{doc_id: [question, ...]}``, best candidates first (shuffled per tier)."""
    by_doc: dict[str, list[str]] = {}
    for c in chunks:
        by_doc.setdefault(str(c.get("doc", "")), []).append(c["content"])

    doc_freq: Counter = Counter()
    for contents in by_doc.values():
        doc_freq.update({t for c in contents for t in tokenize(c)})

    result: dict[str, list[str]] = {}
    for doc, contents in by_doc.items():
        lang = detect_language("\n".join(contents)) or "id"
        tpl = _TEMPLATES[lang]

        defines = _unique([t for c in contents for t in _definition_candidates(c)])
        headings = _unique(
            [h for c in contents for raw in _HEADING_RE.findall(c) if (h := _clean_heading(raw))]
        )
        terms = _salient_terms(contents, doc_freq, len(by_doc))

        tiers = [
            [tpl["define"].format(t) for t in defines],
            [tpl["heading"].format(h) for h in headings],
            [tpl["term"].format(t) for t in terms],
        ]
        questions: list[str] = []
        for tier in tiers:
            rng.shuffle(tier)
            questions.extend(tier)
        result[doc] = _unique(questions)
    return result


def suggest_questions(
    chunks: list[dict],
    limit: int = 3,
    seed: int | None = None,
    config: RetrievalConfig | None = None,
) -> list[dict]:
    """Pick up to *limit* questions that the retrieval gate can answer.

    Args:
        chunks: ``{"content", "word_count", "doc", "title"}`` per chunk; ``doc``
            groups chunks by source document.
    Returns:
        ``[{"question", "doc", "title"}]``, spread across documents.
    """
    if not chunks or limit <= 0:
        return []
    rng = random.Random(seed)
    candidates = build_candidates(chunks, rng)
    titles = {str(c.get("doc", "")): c.get("title") for c in chunks}

    index = TfidfIndex()
    index.fit([{"chunk_index": i, **c} for i, c in enumerate(chunks)])
    service = RetrieverService(index, config=config)

    docs = list(candidates)
    rng.shuffle(docs)
    queues = {d: list(candidates[d]) for d in docs}

    picked: list[dict] = []
    checks = 0
    while len(picked) < limit and checks < MAX_CHECKS and any(queues.values()):
        for doc in docs:
            if len(picked) >= limit or checks >= MAX_CHECKS:
                break
            # take the first answerable candidate of this document (bounded per round)
            for _ in range(CHECKS_PER_ROUND):
                if not queues[doc] or checks >= MAX_CHECKS:
                    break
                question = queues[doc].pop(0)
                checks += 1
                res = service.retrieve_with_relevance(question)
                top = res["results"][0]["chunk_index"] if res["results"] else None
                if res["relevant"] and top is not None and str(chunks[top].get("doc", "")) == doc:
                    picked.append({"question": question, "doc": doc, "title": titles.get(doc)})
                    break
    return picked
