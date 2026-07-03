import argparse
import json
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium


def group_words_into_lines(words, tolerance=3):
    lines = []
    for word in sorted(words, key=lambda item: (round(item["top"]), item["x0"])):
        if not lines:
            lines.append({"top": word["top"], "words": [word]})
            continue
        if abs(word["top"] - lines[-1]["top"]) <= tolerance:
            lines[-1]["words"].append(word)
        else:
            lines.append({"top": word["top"], "words": [word]})
    return lines


def render_pages(pdf_path: Path, output_dir: Path, scale: float):
    pdf = pdfium.PdfDocument(str(pdf_path))
    output_dir.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(pdf, start=1):
        image = page.render(scale=scale).to_pil()
        image.save(output_dir / f"page-{index:02d}.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("output_dir")
    parser.add_argument("--scale", type=float, default=2.0)
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    output_dir = Path(args.output_dir)
    render_dir = output_dir / "rendered_pages"
    render_pages(pdf_path, render_dir, args.scale)

    grouped_output = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(
                x_tolerance=2,
                y_tolerance=2,
                keep_blank_chars=False,
                use_text_flow=False,
            )
            lines = group_words_into_lines(words)
            grouped_lines = []
            for line in lines:
                sorted_words = sorted(line["words"], key=lambda item: item["x0"])
                grouped_lines.append(
                    {
                        "top": round(line["top"], 2),
                        "text": " ".join(word["text"] for word in sorted_words),
                        "words": [
                            {
                                "text": word["text"],
                                "x0": round(word["x0"], 2),
                                "x1": round(word["x1"], 2),
                                "top": round(word["top"], 2),
                                "bottom": round(word["bottom"], 2),
                            }
                            for word in sorted_words
                        ],
                    }
                )
            grouped_output.append(
                {
                    "page": page_index,
                    "width": round(page.width, 2),
                    "height": round(page.height, 2),
                    "lines": grouped_lines,
                }
            )

    output_dir.mkdir(parents=True, exist_ok=True)
    with (output_dir / "page_lines.json").open("w", encoding="utf-8") as handle:
        json.dump(grouped_output, handle, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
