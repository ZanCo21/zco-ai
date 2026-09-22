"""Document conversion to Markdown via MarkItDown.

Handles PDF, DOCX, PPTX, XLSX, HTML, and other formats
supported by the MarkItDown library.
"""

import os
from pathlib import Path

from markitdown import MarkItDown


class MarkItDownError(Exception):
    """Raised on conversion failure."""

    pass


def convert_file(file_path: str) -> str:
    """Convert a document file to Markdown.

    Args:
        file_path: Path to the file to convert.

    Returns:
        Markdown string.

    Raises:
        FileNotFoundError: File does not exist.
        MarkItDownError: Conversion failed.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if not path.is_file():
        raise ValueError(f"Not a file: {file_path}")

    try:
        md = MarkItDown()
        result = md.convert(file_path)
        markdown = result.markdown

        if not markdown or not markdown.strip():
            raise MarkItDownError(f"Conversion produced empty output: {file_path}")

        return markdown

    except FileNotFoundError:
        raise
    except Exception as e:
        raise MarkItDownError(f"Conversion failed for {file_path}: {e}") from e
