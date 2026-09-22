from markitdown import MarkItDown

def convert_file(file_path: str) -> str:
    md = MarkItDown()
    result = md.convert(file_path)

    return result.markdown