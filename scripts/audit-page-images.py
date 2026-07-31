#!/usr/bin/env python3
"""Audit full-page image references against the official PDF layout."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def load_banks(revision: str | None = None) -> list[dict]:
    banks = []
    for source_path in sorted(DATA_DIR.glob("g*.js")):
        match = re.fullmatch(r"g\d{2,3}\.js", source_path.name)
        if not match:
            continue
        if revision:
            source = subprocess.run(
                ["git", "show", f"{revision}:data/{source_path.name}"],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout
        else:
            source = source_path.read_text(encoding="utf-8")
        payload = source.split("window.BANK.push(", 1)[1].rsplit(");", 1)[0]
        banks.append(json.loads(payload))
    return banks


def compact(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", "", value)


def page_layouts(year: int, pages: set[int]) -> dict[int, dict]:
    pdf_path = ROOT / "sources" / str(year) / "official-test.pdf"
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)
    with tempfile.TemporaryDirectory(prefix=f"gsat-{year}-pdfxml-") as temp_dir:
        xml_path = Path(temp_dir) / "layout.xml"
        subprocess.run(
            [
                "pdftohtml",
                "-f",
                str(min(pages)),
                "-l",
                str(max(pages)),
                "-xml",
                "-hidden",
                "-nodrm",
                "-q",
                str(pdf_path),
                str(xml_path),
            ],
            check=True,
        )
        xml_source = xml_path.read_text(encoding="utf-8", errors="replace")
        xml_source = re.sub(r"<fontspec\b[^>]*/>\s*", "", xml_source)
        root = ET.fromstring(xml_source)
        layouts = {}
        for page in root.findall("page"):
            page_no = int(page.attrib["number"])
            if page_no not in pages:
                continue
            text_by_top: dict[int, list[tuple[int, str]]] = defaultdict(list)
            text_boxes = []
            for item in page.findall("text"):
                top = int(item.attrib["top"])
                left = int(item.attrib["left"])
                text_by_top[top].append((left, "".join(item.itertext())))
                text_boxes.append(
                    {
                        "top": top,
                        "left": left,
                        "width": int(item.attrib["width"]),
                        "height": int(item.attrib["height"]),
                    }
                )
            lines = []
            for top, fragments in text_by_top.items():
                text = "".join(value for _, value in sorted(fragments))
                lines.append((top, compact(text)))
            layouts[page_no] = {
                "width": int(page.attrib["width"]),
                "height": int(page.attrib["height"]),
                "lines": sorted(lines),
                "textBoxes": text_boxes,
                "images": [
                    {
                        "top": int(image.attrib["top"]),
                        "left": int(image.attrib["left"]),
                        "width": int(image.attrib["width"]),
                        "height": int(image.attrib["height"]),
                    }
                    for image in page.findall("image")
                ],
            }
        return layouts


def question_tops(lines: list[tuple[int, str]]) -> dict[int, int]:
    result = {}
    for top, line in lines:
        match = re.match(r"^(\d{1,2})\.", line)
        if match:
            result.setdefault(int(match.group(1)), top)
    return result


def group_top(lines: list[tuple[int, str]], start: int, end: int) -> int | None:
    pattern = re.compile(rf"^{start}[-–—]{end}")
    for top, line in lines:
        if pattern.search(line):
            return top
    return None


def target_range(target: dict, layout: dict) -> tuple[int, int] | None:
    tops = question_tops(layout["lines"])
    page_height = layout["height"]
    if target["kind"] == "question":
        start = tops.get(target["number"])
        if start is None:
            return None
        later = [top for number, top in tops.items() if number > target["number"] and top > start]
        return start, min(later, default=page_height - 40)

    start = group_top(layout["lines"], target["start"], target["end"])
    if start is None:
        first_question_top = tops.get(target["start"])
        if first_question_top is None:
            return None
        earlier = [top for number, top in tops.items() if number < target["start"]]
        start = max(earlier, default=40)
    first_question_top = tops.get(target["start"])
    return start, first_question_top or layout["height"] - 40


def group_full_range(target: dict, layout: dict) -> tuple[int, int] | None:
    if target["kind"] != "group":
        return None
    tops = question_tops(layout["lines"])
    start = group_top(layout["lines"], target["start"], target["end"])
    if start is None:
        start = tops.get(target["start"])
    if start is None:
        return None
    next_group_tops = []
    for top, line in layout["lines"]:
        match = re.match(r"^(\d{1,2})[-–—](\d{1,2})", line)
        if match and int(match.group(1)) > target["end"] and top > start:
            next_group_tops.append(top)
    later_questions = [
        top
        for number, top in tops.items()
        if number > target["end"] and top > start
    ]
    end = min(
        next_group_tops + later_questions,
        default=layout["height"] - 40,
    )
    return start, end


def build_reports(revision: str | None = None) -> list[dict]:
    targets_by_year: dict[int, list[dict]] = defaultdict(list)
    for bank in load_banks(revision):
        year = bank["year"]
        for group_id, group in bank["groups"].items():
            image = group.get("image", "")
            match = re.search(r"/pages/p-(\d+)\.jpg$", image)
            if not match:
                continue
            title_match = re.search(r"第\s*(\d+)[–-](\d+)\s*題", group["title"])
            if not title_match:
                raise ValueError(f"{year}-{group_id} has an unrecognized group title")
            targets_by_year[year].append(
                {
                    "id": f"{year}-{group_id}",
                    "kind": "group",
                    "start": int(title_match.group(1)),
                    "end": int(title_match.group(2)),
                    "page": int(match.group(1)),
                    "image": image,
                }
            )
        for question in bank["questions"]:
            image = question.get("image", "")
            match = re.search(r"/pages/p-(\d+)\.jpg$", image)
            if not match:
                continue
            targets_by_year[year].append(
                {
                    "id": f"{year}-{question['no']}",
                    "kind": "question",
                    "number": question["no"],
                    "page": int(match.group(1)),
                    "image": image,
                }
            )

    reports = []
    for year, targets in sorted(targets_by_year.items()):
        referenced_pages = {target["page"] for target in targets}
        pages = {
            page
            for referenced_page in referenced_pages
            for page in (referenced_page - 1, referenced_page, referenced_page + 1)
            if page >= 1
        }
        layouts = page_layouts(year, pages)
        for target in targets:
            original_page = target["page"]
            layout = layouts.get(original_page)
            if layout is None:
                reports.append({**target, "status": "missing-page-layout"})
                continue
            vertical_range = target_range(target, layout)
            if vertical_range is None:
                alternatives = []
                for page in (original_page - 1, original_page + 1):
                    candidate_layout = layouts.get(page)
                    if candidate_layout is None:
                        continue
                    candidate_range = target_range(target, candidate_layout)
                    if candidate_range is not None:
                        alternatives.append((page, candidate_layout, candidate_range))
                if alternatives:
                    corrected_page, layout, vertical_range = min(
                        alternatives, key=lambda item: abs(item[0] - original_page)
                    )
                    target = {
                        **target,
                        "originalPage": original_page,
                        "page": corrected_page,
                        "image": re.sub(
                            r"/pages/p-\d+\.jpg$",
                            f"/pages/p-{corrected_page:02d}.jpg",
                            target["image"],
                        ),
                    }
                else:
                    reports.append({**target, "status": "missing-question-boundary"})
                    continue
            start, end = vertical_range
            images = [
                image
                for image in layout["images"]
                if start <= image["top"] + image["height"] / 2 < end
                and image["width"] >= 4
                and image["height"] >= 4
            ]
            if not images:
                full_range = group_full_range(target, layout)
                component_range = full_range or vertical_range
                reports.append(
                    {
                        **target,
                        "status": "no-pdf-image-in-range",
                        "range": [start, end],
                        "fullRange": list(full_range) if full_range else None,
                        "pageSize": [layout["width"], layout["height"]],
                        "textBoxes": [
                            box
                            for box in layout["textBoxes"]
                            if component_range[0]
                            <= box["top"] + box["height"] / 2
                            < component_range[1]
                        ],
                    }
                )
                continue
            left = min(image["left"] for image in images)
            top = min(image["top"] for image in images)
            right = max(image["left"] + image["width"] for image in images)
            bottom = max(image["top"] + image["height"] for image in images)
            area_ratio = ((right - left) * (bottom - top)) / (
                layout["width"] * layout["height"]
            )
            reports.append(
                {
                    **target,
                    "status": "full-page-image" if area_ratio > 0.7 else "crop-ready",
                    "range": [start, end],
                    "bbox": [left, top, right - left, bottom - top],
                    "pageSize": [layout["width"], layout["height"]],
                    "pdfImageCount": len(images),
                    "areaRatio": round(area_ratio, 4),
                }
            )

    return reports


def main() -> None:
    reports = build_reports()
    counts: dict[str, int] = defaultdict(int)
    for report in reports:
        counts[report["status"]] += 1
    print(
        json.dumps(
            {
                "targets": len(reports),
                "counts": dict(sorted(counts.items())),
                "issues": [
                    report for report in reports if report["status"] != "crop-ready"
                ],
                "ready": [
                    report for report in reports if report["status"] == "crop-ready"
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
