#!/usr/bin/env python3
"""Build the verified 114 question file from official CEEC source files."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "sources" / "114"
RAW_TEXT = SOURCE_DIR / "official-test-raw.txt"
METADATA = SOURCE_DIR / "official-metadata.json"
CLASSIFICATION = SOURCE_DIR / "classification.json"
EXPLANATIONS = ROOT / "data" / "explanations-114.json"
OUTPUT = ROOT / "data" / "g114.js"

QUESTION_COUNT = 64
CONSTRUCTED_SCORES = {
    46: 3,
    49: 3,
    51: 4,
    53: 3,
    55: 3,
    56: 4,
    58: 5,
    61: 3,
    63: 4,
    64: 4,
}

QUESTION_IMAGES = {
    15: "img/114/q15.png",
    24: "img/114/q24.png",
    25: "img/114/q25.png",
}

GROUP_IMAGES = {
    "G31": "img/114/g31.png",
    "G39": "img/114/g39.png",
    "G52": "img/114/g52.png",
    "G57": "img/114/g57.png",
    "G59": "img/114/g59.png",
    "G62": "img/114/g62.png",
}

MATERIAL_HTML = {
    3: (
        "<table><caption>表 1：不在籍投票實施前後比較</caption>"
        "<thead><tr><th>比較項目</th><th>實施前</th><th>實施後</th></tr></thead>"
        "<tbody><tr><th>候選人總數</th><td>324 人</td><td>400 人</td></tr>"
        "<tr><th>實際投票人數</th><td>1,200 萬</td><td>1,400 萬</td></tr>"
        "<tr><th>選民總投票率</th><td>60%</td><td>70%</td></tr></tbody></table>"
    )
}

OPTION_TAIL_MARKERS = {
    4: "表 1",
    15: "圖 1",
    25: "照片 1",
    32: "甲 乙 丙 丁 圖 3",
    34: "背 面 還 有 試 題",
    42: "圖 4",
}

STEM_TAIL_MARKERS = {
    49: "觀點 題文中的關鍵證據",
    55: "受限制的所有權內涵",
    56: "該政策最主要的影響",
    58: "連鎖關係（2 分） 說明",
    61: "對價格與數量的影響（10 字內）",
    63: "甲 乙 丙",
    64: "趨勢或變化（2 分）",
}

CONSTRUCTED_STEM_OVERRIDES = {
    46: (
        "甲的主張最適合以媒體作用的哪項相關概念解釋？為何抗議行動有助青年世代"
        "自我實現？請先勾選適合的概念與解釋，並依據勾選之解釋說明理由。"
        "（3 分，左欄勾選不正確，整題不計分；右欄未依據勾選項目寫出理由或"
        "僅抄錄題文，右欄不計分）"
    )
}

GROUP_TAIL_MARKERS = {
    "G52": "羅德的立場",
}

HEADER_PATTERNS = [
    r"^\s*第\s*\d+\s*頁\s*114年學測\s*$",
    r"^\s*114年學測\s*第\s*\d+\s*頁\s*$",
    r"^\s*社\s*會\s*考\s*科\s*共\s*19\s*頁\s*$",
    r"^\s*共\s*19\s*頁\s*社會考科\s*$",
    r"^\s*-\s*\d+\s*-\s*$",
    r"^\s*請記得在答題卷簽名欄位以正楷簽全名\s*$",
    r"^\s*背\s*面\s*還\s*有\s*試\s*題\s*$",
    r"^\s*第\s*[壹貳]\s*部\s*分.*$",
    r"^\s*說明：第1題至第42題為單選題，每題2分。\s*$",
    r"^\s*說明：本部分共有8題組.*$",
    r"^\s*題號的作答區內作答。.*$",
    r"^\s*使用修正帶（液）。非選擇題請由左而右橫式書寫.*$",
]
HEADER_RE = re.compile("|".join(f"(?:{pattern})" for pattern in HEADER_PATTERNS))


def clean_text(text: str) -> str:
    lines = []
    for line in text.replace("\f", "\n").splitlines():
        if HEADER_RE.match(line):
            continue
        lines.append(line.strip())
    text = "\n".join(lines)
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    return text.strip()


def sequential_question_matches(raw: str) -> list[re.Match[str]]:
    matches = []
    expected = 1
    for match in re.finditer(r"(?m)^(\d{1,2})\.\s*", raw):
        if int(match.group(1)) == expected:
            matches.append(match)
            expected += 1
    if expected != QUESTION_COUNT + 1:
        raise ValueError(
            f"Question boundaries did not reach 1-{QUESTION_COUNT}; stopped at {expected}"
        )
    return matches


def parse_options(block: str) -> tuple[str, dict[str, str]]:
    markers = list(re.finditer(r"\(([A-D])\)", block))
    if [marker.group(1) for marker in markers] != ["A", "B", "C", "D"]:
        raise ValueError(
            f"Expected exactly A-D option markers, got "
            f"{[marker.group(1) for marker in markers]}"
        )
    stem = clean_text(block[: markers[0].start()])
    options: dict[str, str] = {}
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(block)
        options[marker.group(1)] = clean_text(block[marker.end() : end])
    return stem, options


def main() -> None:
    raw = RAW_TEXT.read_text(encoding="utf-8")
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))["questions"]
    classifications = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    explanations = json.loads(EXPLANATIONS.read_text(encoding="utf-8"))

    question_matches = sequential_question_matches(raw)
    group_matches = list(re.finditer(r"(?m)^(\d+)-(\d+)\s*為題組\s*$", raw))
    group_ranges: list[tuple[int, int, str, int]] = []
    groups: dict[str, dict[str, str]] = {}

    for match in group_matches:
        start_number, end_number = int(match.group(1)), int(match.group(2))
        first_question = question_matches[start_number - 1]
        group_id = f"G{start_number}"
        passage = clean_text(raw[match.end() : first_question.start()])
        if group_id in GROUP_TAIL_MARKERS:
            passage = passage.split(GROUP_TAIL_MARKERS[group_id], 1)[0].strip()
        if group_id == "G62":
            passage += " 下圖三幅氣候圖由左至右依序為甲、乙、丙。"
        groups[group_id] = {
            "title": f"第 {start_number}–{end_number} 題題組",
            "passage": passage,
        }
        if group_id in GROUP_IMAGES:
            groups[group_id]["image"] = GROUP_IMAGES[group_id]
        group_ranges.append((start_number, end_number, group_id, match.start()))

    questions = []
    for index, match in enumerate(question_matches):
        number = int(match.group(1))
        next_start = (
            question_matches[index + 1].start()
            if index + 1 < len(question_matches)
            else len(raw)
        )
        end = next_start
        for _, _, _, marker_start in group_ranges:
            if match.end() < marker_start < end:
                end = marker_start
        block = raw[match.end() : end]
        source_text = clean_text(block)
        official = metadata[str(number)]
        discipline, objective, tags = classifications[str(number)]

        item = {
            "no": number,
            "cat": discipline,
            "discipline": discipline,
            "objective": objective,
            "tags": tags,
            "sourceReview": "verified",
        }
        for start_number, end_number, group_id, _ in group_ranges:
            if start_number <= number <= end_number:
                item["group"] = group_id
                break

        if number in CONSTRUCTED_SCORES:
            if number in STEM_TAIL_MARKERS:
                source_text = source_text.split(
                    STEM_TAIL_MARKERS[number], 1
                )[0].strip()
            if number in CONSTRUCTED_STEM_OVERRIDES:
                source_text = CONSTRUCTED_STEM_OVERRIDES[number]
            item.update(
                {
                    "type": "constructed",
                    "stem": source_text,
                    "maxScore": CONSTRUCTED_SCORES[number],
                    "officialRubric": official["officialRubric"],
                }
            )
        else:
            stem, options = parse_options(block)
            if number in OPTION_TAIL_MARKERS:
                options["D"] = options["D"].split(
                    OPTION_TAIL_MARKERS[number], 1
                )[0].strip()
            item.update(
                {
                    "type": "single",
                    "answer": official["answer"],
                    "pass": official["scoreRate"] / 100,
                    "disc": official["discrimination"],
                    "stem": stem,
                    "options": options,
                    "optionStats": official["optionAnalysis"],
                    "explain": explanations[str(number)],
                }
            )

        if number in MATERIAL_HTML:
            item["materialHtml"] = MATERIAL_HTML[number]
        if number in QUESTION_IMAGES:
            item["image"] = QUESTION_IMAGES[number]
        questions.append(item)

    bank = {
        "year": 114,
        "era": "學測",
        "durationMinutes": 110,
        "groups": groups,
        "questions": questions,
    }
    javascript = (
        "// 114 學測社會：由官方 PDF、答案、評分原則與統計資料驗證。\n"
        "window.BANK = window.BANK || [];\n"
        "window.BANK.push("
        + json.dumps(bank, ensure_ascii=False, indent=2)
        + ");\n"
    )
    OUTPUT.write_text(javascript, encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: {len(questions)} questions, "
        f"{len(groups)} groups"
    )


if __name__ == "__main__":
    main()
