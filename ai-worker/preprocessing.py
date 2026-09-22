"""Text preprocessing for knowledge base documents.

Cleans raw Markdown output from MarkItDown while preserving
useful structure (headings, paragraphs) for downstream chunking.
"""

import re


def clean_text(text: str) -> str:
    """Clean raw Markdown text for chunking.

    - Normalizes whitespace (tabs → spaces, trailing spaces)
    - Collapses runs of 3+ blank lines to 2
    - Strips leading/trailing whitespace
    - Preserves Markdown headings and paragraph boundaries

    Args:
        text: Raw Markdown string.

    Returns:
        Cleaned text. Empty string if input is empty/whitespace-only.
    """
    if not text or not text.strip():
        return ""

    # tabs → single space
    text = text.replace("\t", " ")

    # collapse multiple spaces (not newlines) into one
    text = re.sub(r"[^\S\n]+", " ", text)

    # strip trailing whitespace per line
    text = re.sub(r" +$", "", text, flags=re.MULTILINE)

    # collapse 3+ consecutive blank lines → 2 (keeps paragraph gaps)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
