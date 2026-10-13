"""Text analysis for TF-IDF: tokenization, light Indonesian stemming, stop words.

Design notes
------------
* Retrieval stays classical TF-IDF + cosine; only the *analyzer* is smarter.
* Stemming is applied additively: a token such as ``menganalisis`` is indexed
  as both ``menganalisis`` and ``analisis``. Exact matches therefore keep their
  full weight, while a query for ``analisis`` still reaches ``menganalisis``
  (and vice versa). This avoids the precision loss of aggressive stemming.
* Identifiers (``train_test_split``, ``SeriousDlqin2yrs``, ``X_train``) are
  indexed whole and as their parts, so both "train_test_split" and "split"
  find them.
* Word bigrams are built from content tokens so multi-word terms
  ("masking effect", "data leakage") score higher than scattered words.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

STOP_WORDS: frozenset[str] = frozenset(
    {
        # English
        "a", "an", "and", "are", "as", "at", "be", "been", "by", "can", "do",
        "does", "for", "from", "has", "have", "how", "he", "in", "is", "it",
        "its", "of", "on", "or", "that", "the", "this", "these", "those", "to",
        "was", "were", "what", "when", "where", "which", "who", "why", "will",
        "with", "you", "your",
        # Indonesian function words
        "dan", "atau", "yang", "untuk", "pada", "di", "ke", "dari", "dengan",
        "adalah", "ialah", "ada", "telah", "dapat", "akan", "oleh", "ini",
        "itu", "jika", "bila", "apabila", "sebagai", "karena", "sudah", "masih",
        "hanya", "juga", "bisa", "tidak", "bukan", "dalam", "atas", "bagi",
        "antara", "serta", "agar", "supaya", "bahwa", "maka", "yaitu", "yakni",
        "seperti", "tersebut", "dimana", "sebuah", "suatu", "para", "setiap",
        "lebih", "sangat", "saat", "ketika", "sebelum", "sesudah", "setelah",
        "secara", "terhadap", "tentang", "mereka", "kami", "kita", "saya",
        "anda", "nya", "pun", "lah", "kah", "sebuah", "oleh", "tapi", "namun",
        "sehingga", "walaupun", "meskipun", "setelah", "masing",
        # Indonesian question / instruction words (carry no topic)
        "apa", "apakah", "siapa", "kapan", "mengapa", "kenapa", "bagaimana",
        "berapa", "mana", "jelaskan", "sebutkan", "tuliskan", "berikan",
        "uraikan", "cara", "sebaiknya", "diapakan", "dimaksud", "disebut",
        "sebut", "sih", "dong", "tolong", "mohon",
    }
)

_PREFIXES = ("meng", "meny", "mem", "men", "peng", "peny", "pem", "pen", "ber", "ter", "per")
_SUFFIXES = ("nya", "kan", "an", "i")
_MIN_STEM = 5  # never produce a stem shorter than this

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[_'-][A-Za-z0-9]+)*")
_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


@lru_cache(maxsize=100_000)
def stem(word: str) -> str:
    """Very light, fast Indonesian affix stripping + English plural folding.

    Deliberately conservative: only long alphabetic words are touched and a
    stem never gets shorter than ``_MIN_STEM`` letters. Stems are *added* as
    extra features next to the original token (see ``analyze``), so a wrong
    stem costs a little noise but never loses an exact match. (A dictionary
    stemmer, Sastrawi, was evaluated: no retrieval gain on real data, ~15 ms
    per new word, and it added noise, so it is not used.)
    """
    if len(word) < _MIN_STEM + 2 or not word.isalpha():
        return word
    w = word
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= _MIN_STEM:
            w = w[: -len(suf)]
            break
    for pre in _PREFIXES:
        if w.startswith(pre) and len(w) - len(pre) >= _MIN_STEM:
            rest = w[len(pre):]
            if pre in ("meny", "peny"):  # menyapu -> sapu
                rest = "s" + rest
            w = rest
            break
    if w == word and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        w = word[:-1]  # outliers -> outlier
    return word if w in STOP_WORDS else w


def _split_identifier(raw: str) -> list[str]:
    parts: list[str] = []
    for chunk in re.split(r"[_]+", raw):
        parts.extend(p for p in _CAMEL_RE.split(chunk) if p)
    return parts


def tokenize(text: str) -> list[str]:
    """Lower-cased content tokens (stop words removed, identifiers split).

    * ``train_test_split`` -> ``train_test_split``, ``train``, ``test``, ``split``
    * ``X_train``          -> ``x_train``, ``train``
    * ``Z-Score``          -> ``z``, ``score``, ``zscore``  (also for "z score" queries)
    """
    text = _strip_accents(text).replace("’", "'")
    tokens: list[str] = []
    for m in _TOKEN_RE.finditer(text):
        raw = m.group(0)
        low = raw.lower().replace("'", "")
        if "-" in raw:
            parts = [p for p in re.split(r"-+", low) if p]
            tokens.extend(p for p in parts if len(p) > 1 or p.isalpha())
            tokens.append("".join(parts))
        elif "_" in raw or re.search(r"[a-z][A-Z]", raw):
            tokens.append(low)
            tokens.extend(p.lower() for p in _split_identifier(raw) if len(p) > 1)
        else:
            tokens.append(low)
    return [t for t in tokens if t not in STOP_WORDS and (len(t) > 1 or t.isalnum())]


def analyze(text: str, *, bigrams: bool = True) -> list[str]:
    """Analyzer for ``TfidfVectorizer``: tokens + stems (+ bigrams)."""
    base = tokenize(text)
    feats: list[str] = list(base)
    for t in base:
        s = stem(t)
        if s != t:
            feats.append(s)
    if bigrams:
        stems = [stem(t) for t in base]
        feats.extend(f"{a} {b}" for a, b in zip(stems, stems[1:]))
    return feats
