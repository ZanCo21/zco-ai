"""Shared pytest fixtures.

The real ``EDA.pdf`` (tests/fixtures) is the document that exposed the
original extraction/retrieval failures, so it is used as ground truth.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ai-worker"))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def eda_pdf() -> Path:
    return FIXTURES / "EDA.pdf"


@pytest.fixture(scope="session")
def eda_markdown(eda_pdf) -> str:
    from document_extraction import extract_document

    return extract_document(str(eda_pdf))


@pytest.fixture(scope="session")
def eda_chunks(eda_markdown) -> list[dict]:
    from chunking import process_document

    return process_document(eda_markdown)


@pytest.fixture(scope="session")
def eda_retriever(eda_chunks):
    from config import RetrievalConfig
    from retrieval import RetrieverService
    from tfidf_service import TfidfIndex

    index = TfidfIndex()
    index.fit(eda_chunks)
    return RetrieverService(index, RetrievalConfig(similarity_threshold=0.20, top_k=3))


@pytest.fixture(scope="session")
def eda_questions() -> dict:
    return json.loads((FIXTURES / "eda_questions.json").read_text(encoding="utf-8"))
