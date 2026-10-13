"""End-to-end: upload EDA.pdf -> /api/chat (retrieval + real Ollama) -> grounded answer.

Needs the running stack, so it is skipped automatically unless the app, the
Python worker and Ollama are reachable. Point it at a throw-away instance:

    DATABASE_URL=<tmp.db> PYTHON_WORKER_URL=http://127.0.0.1:8011 npx next dev -p 3011
    uv run python ai-worker/main.py 8011
    ZCO_E2E_URL=http://localhost:3011 uv run pytest tests/integration/test_e2e_chat.py -s

It uploads the fixture and deletes it afterwards.
"""

import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest

APP = os.getenv("ZCO_E2E_URL", "")  # opt-in: never touch a real instance by accident
OLLAMA = os.getenv("OLLAMA_URL", "http://localhost:11434")
NOT_FOUND = "tidak ditemukan"


def _get(url, timeout=5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def _post_json(url, payload, timeout=300):
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _upload(path: Path):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{APP}/api/upload", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def _up(url):
    if not APP:
        return False
    try:
        _get(url)
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not (_up(f"{APP}/api/knowledge") and _up(f"{OLLAMA}/api/tags")),
    reason="set ZCO_E2E_URL and start app + worker + Ollama (see module docstring)",
)


@pytest.fixture(scope="module")
def uploaded(eda_pdf):
    info = _upload(eda_pdf)
    assert info["chunksCreated"] > 40
    yield info
    req = urllib.request.Request(f"{APP}/api/knowledge/{info['id']}", method="DELETE")
    urllib.request.urlopen(req, timeout=30).read()


def test_upload_extracts_correct_text(uploaded):
    item = _get(f"{APP}/api/knowledge/{uploaded['id']}")
    assert "menganalisis" in item["content"]
    assert "mampu is" not in item["content"]
    assert "Sensor IoT" in item["content"]
    assert item["chunks"], "chunks were not stored"


def test_unsupported_extension_is_rejected():
    boundary = "xx"
    body = f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.exe\"\r\n\r\nMZ\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"{APP}/api/upload", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(req, timeout=30)
    assert e.value.code == 415


def test_answers_are_grounded_and_cite_sources(uploaded, eda_questions):
    failures = []
    for item in eda_questions["answerable"]:
        res = _post_json(f"{APP}/api/chat", {"message": item["q"]})
        answer = res["answer"].lower()
        ok = (
            NOT_FOUND not in answer
            and any(t.lower() in answer for t in item["answer_any"])
            and any(s["knowledgeId"] == uploaded["id"] and s["title"] == "EDA.pdf" for s in res["sources"])
        )
        print(f"{'OK  ' if ok else 'FAIL'} {item['q']}\n     -> {res['answer'][:160]!r}")
        if not ok:
            failures.append((item["q"], res["answer"]))
    assert not failures, failures


def test_unanswerable_questions_are_not_invented(uploaded, eda_questions):
    if len(_get(f"{APP}/api/knowledge")["items"]) != 1:
        pytest.skip("KB contains other documents; run against a clean database")
    for q in eda_questions["unanswerable"]:
        res = _post_json(f"{APP}/api/chat", {"message": q})
        assert NOT_FOUND in res["answer"].lower(), (q, res["answer"])
        assert res["sources"] == []


def test_retrieval_trace_is_exposed(uploaded):
    res = _post_json(f"{APP}/api/chat", {"message": "Apa itu MCAR?"})
    trace = res["retrieval"]
    assert trace["threshold"] == 0.2 and trace["topK"] == 3
    assert trace["relevanceReason"] in ("cosine", "coverage")
    assert trace["maxSimilarity"] is not None


def test_edit_triggers_rechunking(uploaded):
    """PUT used to update content but keep the stale chunks."""
    marker = "zxqvortex"
    req = urllib.request.Request(
        f"{APP}/api/knowledge/{uploaded['id']}",
        json.dumps({"title": "EDA.pdf", "content": f"# Catatan\n\nKode rahasia proyek adalah {marker} tujuh."}).encode(),
        {"Content-Type": "application/json"},
        method="PUT",
    )
    urllib.request.urlopen(req, timeout=60).read()
    res = _post_json(f"{APP}/api/retrieval", {"query": "apa kode rahasia proyek"})
    assert res["relevant"]
    assert marker in res["results"][0]["content"]
