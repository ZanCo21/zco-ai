"""Query normalization for improved retrieval robustness.

Removes common question patterns and filler words from queries
before TF-IDF vectorization, allowing "apa yang dimaksud negasi"
and "negasi" to match the same content.

Patterns removed:
- Question prefixes: "apa", "apa itu", "apa yang", "apa yang dimaksud"
- Action verbs: "jelaskan", "sebutkan", "tuliskan"
- Filler phrases: "yang dimaksud", "yang disebut", "dengan"
"""

import re


# Question/filler patterns to strip
_PATTERNS = [
    r"^apa\s+itu\s+",           # "apa itu X" → "X"
    r"^apa\s+yang\s+dimaksud\s+", # "apa yang dimaksud X" → "X"
    r"^apa\s+yang\s+",           # "apa yang X" → "X"
    r"^apa(\s+|$)",              # "apa X" or "apa" alone → "X" or empty
    r"^jelaskan\s+",             # "jelaskan X" → "X"
    r"^sebutkan\s+",             # "sebutkan X" → "X"
    r"^tuliskan\s+",             # "tuliskan X" → "X"
    r"^berikan\s+",              # "berikan X" → "X"
    r"\s+yang\s+dimaksud$",      # "X yang dimaksud" → "X"
    r"\s+yang\s+disebut$",       # "X yang disebut" → "X"
    r"^siapa(\s+|$)",            # "siapa" alone
    r"^mana(\s+|$)",             # "mana" alone
    r"^berapa(\s+|$)",           # "berapa" alone
    r"^kapan(\s+|$)",            # "kapan" alone
    r"^bagaimana\s+",            # "bagaimana X" → "X"
    r"^mengapa\s+",              # "mengapa X" → "X"
]


def normalize_query(query: str) -> str:
    """Normalize query by removing question patterns.

    Applies common question prefixes and filler phrases removal,
    then lowercases and strips whitespace.

    Examples:
        "apa yang dimaksud negasi" → "negasi"
        "jelaskan pengertian negasi" → "pengertian negasi"
        "apa itu negasi" → "negasi"
        "negasi" → "negasi"

    Args:
        query: Raw query text.

    Returns:
        Normalized query. Empty string if input is empty/whitespace-only.
    """
    if not query or not query.strip():
        return ""

    normalized = query.strip().lower()

    # Apply pattern removal in order
    for pattern in _PATTERNS:
        normalized = re.sub(pattern, "", normalized, flags=re.IGNORECASE)

    # Clean up extra whitespace
    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized
