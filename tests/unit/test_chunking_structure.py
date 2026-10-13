"""Structure-aware chunking: the old chunker joined every word with a single
space, which destroyed code, bullets and table rows."""

import re

from chunking import chunk_text, process_document


def test_line_breaks_survive_chunking():
    text = "# Daftar\n\n- satu\n- dua\n- tiga"
    chunks = chunk_text(text)
    assert "- satu\n- dua\n- tiga" in chunks[0]["content"]


def test_code_block_is_kept_whole_and_indented():
    code = "```python\ndef f(x):\n    return x + 1\n```"
    chunks = chunk_text("Penjelasan singkat.\n\n" + code)
    assert code in chunks[0]["content"]


def test_table_rows_are_never_split_mid_row():
    rows = [f"- Tipe: R{i} | Definisi: " + " ".join(f"kata{i}_{j}" for j in range(30)) for i in range(20)]
    chunks = chunk_text("\n".join(rows), max_words=80, overlap_words=0)
    assert len(chunks) > 1
    for r in rows:
        assert sum(r in c["content"] for c in chunks) == 1


def test_heading_path_prefixes_every_chunk():
    body = " ".join(f"isi{i}" for i in range(400))
    text = f"# Bab 1\n\n## Bagian A\n\n{body}"
    chunks = chunk_text(text, max_words=100, overlap_words=10)
    assert len(chunks) >= 4
    for c in chunks:
        assert c["content"].startswith("# Bab 1\n## Bagian A")
        assert c["section"] == "Bab 1 > Bagian A"


def test_word_count_excludes_heading_prefix():
    chunks = chunk_text("# Judul Panjang Sekali\n\nsatu dua tiga")
    assert chunks[0]["word_count"] == 3


def test_sibling_heading_replaces_previous():
    text = "# A\n\n## x\n\n" + "a " * 80 + "\n\n## y\n\n" + "b " * 80
    chunks = chunk_text(text, max_words=100, overlap_words=0)
    assert any(c["section"] == "A > y" for c in chunks)
    assert not any("## x" in c["content"] and "## y" in c["content"] for c in chunks)


def test_oversized_single_line_is_split_with_word_overlap():
    chunks = chunk_text("word " * 200, max_words=100, overlap_words=30)
    assert len(chunks) >= 2
    assert all(c["word_count"] <= 130 for c in chunks)


def test_identical_trailing_piece_is_not_dropped():
    # regression: last chunk was skipped when its text was a substring of the previous chunk
    chunks = chunk_text("alpha " * 200, max_words=100, overlap_words=0)
    assert sum(c["word_count"] for c in chunks) == 200


def test_every_word_is_covered():
    words = [f"w{i}" for i in range(1000)]
    chunks = chunk_text("\n\n".join(" ".join(words[i : i + 20]) for i in range(0, 1000, 20)), max_words=150, overlap_words=20)
    seen = set()
    for c in chunks:
        seen.update(c["content"].split())
    assert set(words) <= seen


def test_heading_only_document_still_yields_chunk():
    assert chunk_text("# Hanya judul")


def test_clean_text_keeps_indentation_and_collapses_inner_spaces():
    from preprocessing import clean_text

    out = clean_text("def f():\n    x  =  1\t\n\n\n\nend")
    assert "    x = 1" in out
    assert "\n\n\n" not in out


def test_real_document_chunks_are_reasonable(eda_chunks):
    sizes = [c["word_count"] for c in eda_chunks]
    assert max(sizes) <= 150 + 20
    assert [c["chunk_index"] for c in eda_chunks] == list(range(len(eda_chunks)))
    # at least one chunk carries a table row intact, one carries code
    assert any(re.search(r"^- Tipe Missing: MCAR", c["content"], re.M) for c in eda_chunks)
    assert any("train_test_split(" in c["content"] and "stratify=y" in c["content"] for c in eda_chunks)


def test_process_document_empty():
    assert process_document("  \n ") == []
