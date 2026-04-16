#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from pypdf import PdfReader


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--help":
        print(json.dumps({"usage": "extract_pdf_text.py <pdf-path>"}))
        return 0

    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: extract_pdf_text.py <pdf-path>"}))
        return 1

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(json.dumps({"error": f"file not found: {pdf_path}"}))
        return 1

    try:
        reader = PdfReader(str(pdf_path))
        pages = []
        for page in reader.pages:
            pages.append((page.extract_text() or "").strip())

        text = "\n\n".join(page for page in pages if page)
        print(json.dumps({"text": text}))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
