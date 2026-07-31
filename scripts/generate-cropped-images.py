#!/usr/bin/env python3
"""Generate question-only crops for every legacy full-page image reference."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "scripts" / "audit-page-images.py"


def load_audit_module():
    spec = importlib.util.spec_from_file_location("audit_page_images", AUDIT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load audit-page-images.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def identify_size(image_path: Path) -> tuple[int, int]:
    result = subprocess.run(
        ["magick", "identify", "-format", "%w %h", str(image_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    width, height = result.stdout.split()
    return int(width), int(height)


def ensure_page_image(report: dict) -> Path:
    page_path = ROOT / report["image"]
    if page_path.exists():
        return page_path
    year = int(report["id"].split("-", 1)[0])
    page = int(report["page"])
    page_path.parent.mkdir(parents=True, exist_ok=True)
    output_root = page_path.with_suffix("")
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(page),
            "-l",
            str(page),
            "-r",
            "110",
            "-jpeg",
            "-singlefile",
            str(ROOT / "sources" / str(year) / "official-test.pdf"),
            str(output_root),
        ],
        check=True,
    )
    return page_path


def connected_component_bbox(
    image_path: Path,
    crop: tuple[int, int, int, int],
) -> tuple[int, int, int, int] | None:
    x, y, width, height = crop
    result = subprocess.run(
        [
            "magick",
            str(image_path),
            "-crop",
            f"{width}x{height}+{x}+{y}",
            "+repage",
            "-colorspace",
            "Gray",
            "-threshold",
            "82%",
            "-negate",
            "-define",
            "connected-components:verbose=true",
            "-connected-components",
            "8",
            "null:",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    components = []
    pattern = re.compile(
        r"^\s+\d+:\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+"
        r"[\d.]+,[\d.]+\s+(\d+)\s+gray\(255\)"
    )
    for line in (result.stdout + result.stderr).splitlines():
        match = pattern.match(line)
        if not match:
            continue
        component_width, component_height, left, top, area = map(
            int, match.groups()
        )
        if component_width < 12 or component_height < 8:
            continue
        components.append(
            {
                "left": left,
                "top": top,
                "width": component_width,
                "height": component_height,
                "area": area,
            }
        )
    if not components:
        return None
    largest_area = max(component["area"] for component in components)
    threshold = max(150, int(largest_area * 0.08))
    selected = [
        component
        for component in components
        if component["area"] >= threshold
        and component["width"] * component["height"] >= 600
    ]
    if not selected:
        selected = [max(components, key=lambda component: component["area"])]
    left = min(component["left"] for component in selected)
    top = min(component["top"] for component in selected)
    right = max(component["left"] + component["width"] for component in selected)
    bottom = max(component["top"] + component["height"] for component in selected)
    return x + left, y + top, right - left, bottom - top


def masked_visual_bboxes(
    image_path: Path,
    crop: tuple[int, int, int, int],
    text_boxes: list[dict],
    page_scale: tuple[float, float],
) -> list[tuple[int, int, int, int]]:
    x, y, width, height = crop
    scale_x, scale_y = page_scale
    draw_args = []
    for box in text_boxes:
        left = max(0, round(box["left"] * scale_x) - x - 2)
        top = max(0, round(box["top"] * scale_y) - y - 2)
        right = min(
            width - 1,
            round((box["left"] + box["width"]) * scale_x) - x + 2,
        )
        bottom = min(
            height - 1,
            round((box["top"] + box["height"]) * scale_y) - y + 2,
        )
        if right <= 0 or bottom <= 0 or left >= width or top >= height:
            continue
        draw_args.extend(["-draw", f"rectangle {left},{top} {right},{bottom}"])
    result = subprocess.run(
        [
            "magick",
            str(image_path),
            "-crop",
            f"{width}x{height}+{x}+{y}",
            "+repage",
            "-colorspace",
            "Gray",
            "-threshold",
            "90%",
            "-fill",
            "white",
            "-stroke",
            "white",
            *draw_args,
            "-negate",
            "-morphology",
            "Close",
            "Rectangle:5x5",
            "-define",
            "connected-components:verbose=true",
            "-connected-components",
            "8",
            "null:",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    pattern = re.compile(
        r"^\s+\d+:\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+"
        r"[\d.]+,[\d.]+\s+(\d+)\s+gray\(255\)"
    )
    components = []
    for line in (result.stdout + result.stderr).splitlines():
        match = pattern.match(line)
        if not match:
            continue
        component_width, component_height, left, top, area = map(
            int, match.groups()
        )
        if component_width < 70 or component_height < 35:
            continue
        if component_width * component_height < 5000 or area < 350:
            continue
        components.append(
            (x + left, y + top, component_width, component_height)
        )
    return components


def merge_nearby_bboxes(
    boxes: list[tuple[int, int, int, int]],
    gap: int = 28,
) -> list[tuple[int, int, int, int]]:
    merged = list(boxes)
    changed = True
    while changed:
        changed = False
        result = []
        while merged:
            left, top, width, height = merged.pop(0)
            right = left + width
            bottom = top + height
            for index, other in enumerate(merged):
                o_left, o_top, o_width, o_height = other
                o_right = o_left + o_width
                o_bottom = o_top + o_height
                horizontally_close = (
                    min(right, o_right) - max(left, o_left) >= -gap
                )
                vertically_close = (
                    min(bottom, o_bottom) - max(top, o_top) >= -gap
                )
                if horizontally_close and vertically_close:
                    left = min(left, o_left)
                    top = min(top, o_top)
                    right = max(right, o_right)
                    bottom = max(bottom, o_bottom)
                    merged.pop(index)
                    merged.insert(0, (left, top, right - left, bottom - top))
                    changed = True
                    break
            else:
                result.append((left, top, right - left, bottom - top))
        merged = result
    return sorted(merged, key=lambda box: (box[1], box[0]))


def crop_visual_regions(
    image_path: Path,
    destination: Path,
    boxes: list[tuple[int, int, int, int]],
    page_width: int,
    page_height: int,
) -> bool:
    if not boxes:
        return False
    boxes = merge_nearby_bboxes(boxes)
    with tempfile.TemporaryDirectory(prefix="gsat-crops-") as temp_dir:
        crops = []
        for index, box in enumerate(boxes):
            left, top, width, height = padded_bbox(
                box,
                page_width,
                page_height,
                padding=14,
            )
            crop_path = Path(temp_dir) / f"{index:02d}.png"
            subprocess.run(
                [
                    "magick",
                    str(image_path),
                    "-crop",
                    f"{width}x{height}+{left}+{top}",
                    "+repage",
                    str(crop_path),
                ],
                check=True,
            )
            crops.append(crop_path)
        subprocess.run(
            [
                "magick",
                *map(str, crops),
                "-background",
                "white",
                "-gravity",
                "center",
                "-append",
                "-strip",
                "-quality",
                "88",
                str(destination),
            ],
            check=True,
        )
    return True


def padded_bbox(
    bbox: tuple[int, int, int, int],
    page_width: int,
    page_height: int,
    padding: int = 10,
) -> tuple[int, int, int, int]:
    x, y, width, height = bbox
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(page_width, x + width + padding)
    bottom = min(page_height, y + height + padding)
    return left, top, right - left, bottom - top


def output_path(report: dict) -> Path:
    year = report["id"].split("-", 1)[0]
    if report["kind"] == "group":
        filename = f"group-{report['start']}-{report['end']}.jpg"
    else:
        filename = f"q-{report['number']:02d}.jpg"
    return ROOT / "img" / year / "cropped" / filename


def crop_group_region(report: dict, destination: Path) -> bool:
    if report["kind"] != "group" or not report.get("range"):
        return False
    page_path = ensure_page_image(report)
    page_width, page_height = identify_size(page_path)
    xml_width, xml_height = report.get("pageSize", [892, 1263])
    scale_y = page_height / xml_height
    start, end = report["range"]
    top = max(0, round((start + 28) * scale_y))
    bottom = min(page_height, round((end - 4) * scale_y))
    if bottom - top < 30:
        return False
    subprocess.run(
        [
            "magick",
            str(page_path),
            "-crop",
            f"{page_width}x{bottom - top}+0+{top}",
            "+repage",
            "-fuzz",
            "8%",
            "-trim",
            "+repage",
            "-bordercolor",
            "white",
            "-border",
            "10",
            "-strip",
            "-quality",
            "88",
            str(destination),
        ],
        check=True,
    )
    width, height = identify_size(destination)
    return width >= 120 and height >= 45


def crop_report(report: dict) -> tuple[Path, str]:
    year = report["id"].split("-", 1)[0]
    page_path = ensure_page_image(report)
    page_width, page_height = identify_size(page_path)
    xml_width = report.get("pageSize", [892, 1263])[0]
    xml_height = report.get("pageSize", [892, 1263])[1]
    scale_x = page_width / xml_width
    scale_y = page_height / xml_height
    method = "pdf-layout"

    bbox = None
    if report["status"] == "crop-ready":
        left, top, width, height = report["bbox"]
        candidate = (
            round(left * scale_x),
            round(top * scale_y),
            round(width * scale_x),
            round(height * scale_y),
        )
        if candidate[2] >= 120 and candidate[3] >= 45:
            bbox = candidate

    if bbox is None:
        method = "visual-components"
        component_range = (
            report.get("fullRange")
            if report["kind"] == "group"
            else report.get("range")
        )
        if component_range:
            top, bottom = component_range
            region_top = max(0, round(top * scale_y))
            region_bottom = min(page_height, round(bottom * scale_y))
        else:
            region_top = round(page_height * 0.08)
            region_bottom = round(page_height * 0.92)
        region = (0, region_top, page_width, max(1, region_bottom - region_top))
        masked_boxes = masked_visual_bboxes(
            page_path,
            region,
            report.get("textBoxes", []),
            (scale_x, scale_y),
        )
        if masked_boxes and crop_visual_regions(
            page_path,
            output_path(report),
            masked_boxes,
            page_width,
            page_height,
        ):
            return output_path(report), "masked-visual-regions"
        bbox = connected_component_bbox(page_path, region)
    if bbox is None:
        raise RuntimeError(f"{report['id']} has no crop candidate")

    bbox = padded_bbox(bbox, page_width, page_height)
    destination = output_path(report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "magick",
            str(page_path),
            "-crop",
            f"{bbox[2]}x{bbox[3]}+{bbox[0]}+{bbox[1]}",
            "+repage",
            "-strip",
            "-quality",
            "88",
            str(destination),
        ],
        check=True,
    )
    width, height = identify_size(destination)
    if report["kind"] == "group" and (width < 120 or height < 45):
        if crop_group_region(report, destination):
            method = "group-material-region"
    return destination, method


def rewrite_data(asset_map: dict[str, str]) -> None:
    for source_path in sorted((ROOT / "data").glob("g*.js")):
        if not re.fullmatch(r"g\d{2,3}\.js", source_path.name):
            continue
        source = source_path.read_text(encoding="utf-8")
        payload = source.split("window.BANK.push(", 1)[1].rsplit(");", 1)[0]
        bank = json.loads(payload)
        changed = False
        year = bank["year"]
        for group_id, group in bank["groups"].items():
            item_id = f"{year}-{group_id}"
            if item_id in asset_map:
                group["image"] = asset_map[item_id]
                changed = True
        for question in bank["questions"]:
            item_id = f"{year}-{question['no']}"
            if item_id in asset_map:
                question["image"] = asset_map[item_id]
                changed = True
        if changed:
            rendered = (
                f"// {year} 學測社會：由官方試題、答案、評分原則與統計資料驗證。\n"
                "window.BANK = window.BANK || [];\n"
                f"window.BANK.push({json.dumps(bank, ensure_ascii=False, indent=2)});\n"
            )
            source_path.write_text(rendered, encoding="utf-8")


def main() -> None:
    audit = load_audit_module()
    reports = audit.build_reports("HEAD")
    asset_map = {}
    methods: dict[str, int] = {}
    unresolved = []
    for report in reports:
        try:
            destination, method = crop_report(report)
        except RuntimeError:
            unresolved.append(report)
            continue
        asset_map[report["id"]] = destination.relative_to(ROOT).as_posix()
        methods[method] = methods.get(method, 0) + 1

    banks = audit.load_banks("HEAD")
    question_groups = {}
    for bank in banks:
        for question in bank["questions"]:
            if question.get("group"):
                question_groups[f"{bank['year']}-{question['no']}"] = (
                    f"{bank['year']}-{question['group']}"
                )
    still_unresolved = []
    for report in unresolved:
        fallback_id = None
        if report["kind"] == "group":
            fallback_id = f"{report['id'].split('-', 1)[0]}-{report['start']}"
        else:
            fallback_id = question_groups.get(report["id"])
        if fallback_id and fallback_id in asset_map:
            asset_map[report["id"]] = asset_map[fallback_id]
            methods["shared-group-visual"] = methods.get("shared-group-visual", 0) + 1
        else:
            still_unresolved.append(report["id"])
    if still_unresolved:
        raise RuntimeError(
            "No trustworthy crop candidate for: " + ", ".join(still_unresolved)
        )
    rewrite_data(asset_map)
    print(
        json.dumps(
            {
                "generated": len(asset_map),
                "methods": methods,
                "remainingFullPageReferences": sum(
                    "/pages/" in path for path in asset_map.values()
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
