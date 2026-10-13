"""Text preprocessing for knowledge base documents.

Cleans raw Markdown output while preserving useful structure (headings,
paragraphs, code indentation, nested lists) for downstream chunking.
"""

import re


def clean_text(text: str) -> str:
    """Clean raw Markdown text for chunking.

    - Normalizes line endings and tabs
    - Strips trailing whitespace; collapses inner runs of spaces but keeps
      leading indentation so code blocks and nested lists survive
    - Collapses runs of 3+ blank lines to 2
    - Strips leading/trailing whitespace

    Args:
        text: Raw Markdown string.

    Returns:
        Cleaned text. Empty string if input is empty/whitespace-only.
    """
    if not text or not text.strip():
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")

    cleaned: list[str] = []
    for line in text.split("\n"):
        line = line.replace("\t", "    ").rstrip()
        indent = line[: len(line) - len(line.lstrip(" "))]
        cleaned.append(indent + re.sub(r" {2,}", " ", line[len(indent):]))
    text = "\n".join(cleaned)

    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
