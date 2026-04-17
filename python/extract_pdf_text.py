#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


def normalize_page_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def normalize_section_text(text: str) -> str:
    # Preserve markdown tables/bullets reasonably but remove excessive blank lines.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_markdown_sections(markdown: str):
    sections = []
    stack = []  # list[(level, title)]
    current_lines = []
    current_heading = None
    current_path = []

    def flush():
        nonlocal current_lines, current_heading, current_path
        content = normalize_section_text("\n".join(current_lines))
        if content:
            sections.append(
                {
                    "heading": current_heading,
                    "sectionPath": current_path,
                    "text": content,
                    "pageStart": 0,
                    "pageEnd": 0,
                }
            )
        current_lines = []

    for raw_line in markdown.split("\n"):
        line = raw_line.rstrip()
        match = re.match(r"^(#{1,6})\s+(.*)$", line)
        if match:
            flush()
            level = len(match.group(1))
            title = match.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
            current_heading = title
            current_path = [entry[1] for entry in stack]
            continue

        current_lines.append(line)

    flush()
    return sections


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--help":
        print(
            json.dumps(
                {
                    "usage": "extract_pdf_text.py [--mode pypdf|docling] <pdf-path>",
                    "modes": ["pypdf", "docling", "opendataloader"],
                }
            )
        )
        return 0

    mode = "pypdf"
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == "--mode":
        mode = (args[1] or "").strip().lower()
        args = args[2:]

    if len(args) != 1 or mode not in ("pypdf", "docling", "opendataloader"):
        print(json.dumps({"error": "usage: extract_pdf_text.py [--mode pypdf|docling|opendataloader] <pdf-path>"}))
        return 1

    pdf_path = Path(args[0])
    if not pdf_path.exists():
        print(json.dumps({"error": f"file not found: {pdf_path}"}))
        return 1

    try:
        if mode == "docling":
            try:
                from docling.document_converter import DocumentConverter
            except Exception as exc:
                print(json.dumps({"error": f"docling import failed: {exc}"}))
                return 1

            converter = DocumentConverter()
            result = converter.convert(str(pdf_path))
            doc = result.document
            markdown = doc.export_to_markdown()
            sections = split_markdown_sections(markdown)
            combined = "\n\n".join(section["text"] for section in sections if section.get("text"))
            print(json.dumps({"text": combined, "pages": [], "sections": sections, "mode": "docling"}))
            return 0

        if mode == "opendataloader":
            try:
                import contextlib
                import os
                import tempfile
                from glob import glob

                import opendataloader_pdf
            except Exception as exc:
                print(json.dumps({"error": f"opendataloader import failed: {exc}"}))
                return 1

            @contextlib.contextmanager
            def suppress_subprocess_output():
                # OpenDataLoader spawns a JVM and logs to the parent process stdout/stderr.
                # The extractor must emit clean JSON on stdout, so silence output during convert().
                devnull_fd = os.open(os.devnull, os.O_WRONLY)
                old_stdout = os.dup(1)
                old_stderr = os.dup(2)
                try:
                    os.dup2(devnull_fd, 1)
                    os.dup2(devnull_fd, 2)
                    yield
                finally:
                    os.dup2(old_stdout, 1)
                    os.dup2(old_stderr, 2)
                    os.close(old_stdout)
                    os.close(old_stderr)
                    os.close(devnull_fd)

            # OpenDataLoader writes files to disk (markdown/json). Use a temp dir per invocation.
            with tempfile.TemporaryDirectory(prefix="svkrishna_odl_") as out_dir:
                with suppress_subprocess_output():
                    opendataloader_pdf.convert(
                        input_path=[str(pdf_path)],
                        output_dir=out_dir,
                        format="markdown",
                    )

                expected_md = Path(out_dir) / f"{pdf_path.stem}.md"
                md_path = expected_md if expected_md.exists() else None
                if md_path is None:
                    candidates = sorted(glob(str(Path(out_dir) / "*.md")))
                    if candidates:
                        md_path = Path(candidates[0])

                if md_path is None or not md_path.exists():
                    print(json.dumps({"error": "opendataloader did not produce a markdown file"}))
                    return 1

                markdown = md_path.read_text("utf-8", errors="replace")
                sections = split_markdown_sections(markdown)
                combined = "\n\n".join(section["text"] for section in sections if section.get("text"))
                print(json.dumps({"text": combined, "pages": [], "sections": sections, "mode": "opendataloader"}))
                return 0

        reader = PdfReader(str(pdf_path))
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            page_text = normalize_page_text(page.extract_text() or "")
            pages.append({"page": index, "text": page_text})

        text = "\n\n".join(page["text"] for page in pages if page["text"])
        print(json.dumps({"text": text, "pages": pages, "sections": [], "mode": "pypdf"}))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
