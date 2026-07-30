#!/usr/bin/env python3
"""Build the verified 115 question file from official CEEC source files."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "sources" / "115"
RAW_TEXT = SOURCE_DIR / "official-test-raw.txt"
METADATA = SOURCE_DIR / "official-metadata.json"
EXPLANATIONS = ROOT / "data" / "explanations-115.json"
OUTPUT = ROOT / "data" / "g115.js"

CONSTRUCTED_SCORES = {
    40: 3,
    42: 3,
    44: 4,
    46: 4,
    49: 3,
    52: 4,
    54: 3,
    56: 3,
    60: 3,
    63: 3,
    65: 3,
}

QUESTION_IMAGES = {
    12: "img/115/q12.png",
    16: "img/115/q16.png",
    18: "img/115/q18.png",
    19: "img/115/q19.png",
    20: "img/115/q20.png",
    22: "img/115/q22.png",
    23: "img/115/q23.png",
}

GROUP_IMAGES = {
    "G36": "img/115/g36.png",
    "G45": "img/115/g45.png",
    "G47": "img/115/g47.png",
    "G53": "img/115/g53.png",
    "G57": "img/115/g57.png",
    "G64": "img/115/g64.png",
}

MATERIAL_HTML = {
    5: (
        "<table><caption>表 1：甲、乙、丙三國各項支出占 GDP 比例</caption>"
        "<thead><tr><th>國家</th><th>民間消費</th><th>投資</th>"
        "<th>政府消費</th><th>出口</th><th>進口</th></tr></thead>"
        "<tbody><tr><th>甲國</th><td>67%</td><td>16%</td><td>20%</td>"
        "<td>12%</td><td>15%</td></tr><tr><th>乙國</th><td>20%</td>"
        "<td>34%</td><td>40%</td><td>20%</td><td>14%</td></tr>"
        "<tr><th>丙國</th><td>50%</td><td>23%</td><td>11%</td>"
        "<td>69%</td><td>53%</td></tr></tbody></table>"
    ),
    8: (
        "<table><caption>表 2：《臺灣府志》地圖地名註記類別與數量</caption>"
        "<thead><tr><th>地名註記類別（個）</th><th>1696</th>"
        "<th>1742</th><th>1747</th></tr></thead><tbody>"
        "<tr><th>山岳</th><td>24</td><td>29</td><td>127</td></tr>"
        "<tr><th>官署</th><td>5</td><td>8</td><td>7</td></tr>"
        "<tr><th>社</th><td>61</td><td>24</td><td>未註記</td></tr>"
        "<tr><th>一般地名（泛指與漢人有關的地名）</th>"
        "<td>59</td><td>95</td><td>17</td></tr>"
        "<tr><th>其他</th><td>56</td><td>23</td><td>88</td></tr>"
        "</tbody></table>"
    ),
}

OPTION_TAIL_MARKERS = {
    8: " 表 1",
    12: " 甲 乙 圖 1",
    16: " 圖 2",
    19: " 圖 3",
    26: " 圖 6",
    38: " 第 貳",
    45: " 左：",
    59: " 圖 11",
}

STEM_TAIL_MARKERS = {
    49: " 圖 8",
    52: " 烏俄戰爭期間",
    63: " 底圖選用上發生失誤",
    65: " 0 1 2 3 4 5 6 7 8 9 10",
}

GROUP_TAIL_MARKERS = {
    "G36": " 圖 7",
    "G53": " 圖 10",
}

CLASSIFICATION = {
    1: ("civics", "C2", ["社會福利", "健康權"]),
    2: ("civics", "C3", ["社會不平等", "勞動議題"]),
    3: ("civics", "C7", ["民主政治", "媒體與社會"]),
    4: ("civics", "C2", ["法律與權利", "刑事程序"]),
    5: ("civics", "C3", ["經濟學", "國民所得"]),
    6: ("civics", "C3", ["經濟學", "國際貿易"]),
    7: ("history", "H2", ["中國史", "海洋史"]),
    8: ("history", "H3", ["臺灣史", "史料判讀"]),
    9: ("history", "H2", ["臺灣史", "殖民經驗"]),
    10: ("history", "H2", ["世界史", "戰爭史"]),
    11: ("history", "H2", ["中國史", "經濟史"]),
    12: ("history", "H3", ["世界史", "史料判讀"]),
    13: ("history", "H2", ["東亞史", "國際關係"]),
    14: ("history", "H2", ["世界史", "全球貿易"]),
    15: ("history", "H5", ["拉丁美洲", "殖民經驗"]),
    16: ("geography", "G6", ["地圖判讀", "地名"]),
    17: ("geography", "G3", ["自然地理", "生態系"]),
    18: ("geography", "G6", ["地理資訊", "生活圈"]),
    19: ("geography", "G6", ["地圖判讀", "方位"]),
    20: ("geography", "G6", ["地圖判讀", "地形"]),
    21: ("geography", "G4", ["區域地理", "全球貿易"]),
    22: ("geography", "G7", ["環境議題", "農業"]),
    23: ("geography", "G5", ["氣候", "圖表判讀"]),
    24: ("geography", "G4", ["自然地理", "全球貿易"]),
    25: ("civics", "C3", ["經濟學", "產業發展"]),
    26: ("civics", "C3", ["經濟學", "外部成本"]),
    27: ("civics", "C6", ["公共政策", "比例原則"]),
    28: ("geography", "G3", ["產業區位", "能源"]),
    29: ("geography", "G4", ["產業區位", "產業連鎖"]),
    30: ("history", "H2", ["臺灣史", "土地制度"]),
    31: ("geography", "G3", ["農業", "自然地理"]),
    32: ("civics", "C2", ["法律與權利", "原住民族"]),
    33: ("civics", "C6", ["轉型正義", "原住民族"]),
    34: ("history", "H2", ["臺灣史", "都市發展"]),
    35: ("civics", "C6", ["法律與權利", "居住權"]),
    36: ("geography", "G6", ["土地利用", "地圖判讀"]),
    37: ("civics", "C2", ["法律與權利", "國籍"]),
    38: ("history", "H7", ["史料判讀", "臺灣史"]),
    39: ("civics", "C7", ["民主政治", "立法程序"]),
    40: ("civics", "C2", ["民主政治", "憲政體制"]),
    41: ("civics", "C3", ["經濟學", "公共財政"]),
    42: ("civics", "C7", ["社會福利", "社會不平等"]),
    43: ("history", "H2", ["中國史", "國際關係"]),
    44: ("history", "H8", ["歷史解釋", "中國史"]),
    45: ("history", "H4", ["世界史", "宗教文化"]),
    46: ("history", "H2", ["世界史", "文化交流"]),
    47: ("geography", "G7", ["地緣政治", "全球化"]),
    48: ("geography", "G4", ["都市", "全球貿易"]),
    49: ("geography", "G5", ["區域互賴", "圖表判讀"]),
    50: ("civics", "C4", ["性別", "多元文化"]),
    51: ("integrated", "S1", ["臺灣史", "多元文化"]),
    52: ("history", "H4", ["臺灣史", "威權統治"]),
    53: ("history", "H2", ["臺灣史", "交通史"]),
    54: ("geography", "G6", ["等高線", "地圖判讀"]),
    55: ("geography", "G4", ["區域地理", "殖民城市"]),
    56: ("civics", "C7", ["多元文化", "平等權"]),
    57: ("history", "H4", ["中國史", "戰爭史"]),
    58: ("history", "H3", ["人口遷移", "史料判讀"]),
    59: ("integrated", "S4", ["經濟學", "資料評估"]),
    60: ("geography", "G6", ["地圖投影", "地圖判讀"]),
    61: ("history", "H4", ["中國史", "疾病史"]),
    62: ("civics", "C6", ["法律與權利", "刑罰"]),
    63: ("geography", "G9", ["環境負載力", "圖表表達"]),
    64: ("geography", "G3", ["區域地理", "能源"]),
    65: ("integrated", "S1", ["經濟學", "國際關係"]),
}

HEADER_PATTERNS = [
    r"^\s*第\s*\d+\s*頁\s*115年學測\s*$",
    r"^\s*115年學測\s*第\s*\d+\s*頁\s*$",
    r"^\s*社\s*會\s*考\s*科\s*共\s*19\s*頁\s*$",
    r"^\s*共\s*19\s*頁\s*社會考科\s*$",
    r"^\s*-\s*\d+\s*-\s*$",
    r"^\s*請記得在答題卷簽名欄位以正楷簽全名\s*$",
    r"^\s*第\s*[壹貳]\s*部分.*$",
    r"^\s*說明：第1題至第38題為單選題，每題2分。\s*$",
    r"^\s*說明：本部分共有11題組.*$",
    r"^\s*選擇題與「非選擇題作圖部分」.*$",
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
    explanations = json.loads(EXPLANATIONS.read_text(encoding="utf-8"))

    question_matches = list(re.finditer(r"(?m)^(\d{1,2})\.\s", raw))
    numbers = [int(match.group(1)) for match in question_matches]
    if numbers != list(range(1, 66)):
        raise ValueError(f"Question boundaries are not exactly 1-65: {numbers}")

    group_matches = list(re.finditer(r"(?m)^(\d+)-(\d+)\s*為題組\s*$", raw))
    group_ranges: list[tuple[int, int, str, int]] = []
    groups: dict[str, dict[str, str]] = {}
    for match in group_matches:
        start_number, end_number = int(match.group(1)), int(match.group(2))
        first_question = question_matches[start_number - 1]
        group_id = f"G{start_number}"
        passage = clean_text(raw[match.end() : first_question.start()])
        groups[group_id] = {
            "title": f"第 {start_number}–{end_number} 題題組",
            "passage": passage,
        }
        if group_id in GROUP_TAIL_MARKERS:
            groups[group_id]["passage"] = passage.split(
                GROUP_TAIL_MARKERS[group_id], 1
            )[0].strip()
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

        discipline, objective, tags = CLASSIFICATION[number]
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
                source_text = source_text.split(STEM_TAIL_MARKERS[number], 1)[0].strip()
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
            if number == 8:
                stem = stem.split("表 2 年份", 1)[0].strip()
            if number == 22:
                options["D"] = "丁"
            elif number in OPTION_TAIL_MARKERS:
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

        visual_tokens = sorted(set(re.findall(r"(?:圖|表|照片)\s*\d+", source_text)))
        group_has_image = bool(item.get("group") and groups[item["group"]].get("image"))
        resolved_visual = (
            number in MATERIAL_HTML
            or number in QUESTION_IMAGES
            or group_has_image
            or number in {26, 38}
        )
        if visual_tokens and not resolved_visual:
            item["needsVisualReview"] = visual_tokens

        questions.append(item)

    bank = {
        "year": 115,
        "era": "學測",
        "durationMinutes": 110,
        "groups": groups,
        "questions": questions,
    }
    javascript = (
        "// 115 學測社會：由官方 PDF、答案、評分原則與統計資料驗證。\n"
        "window.BANK = window.BANK || [];\n"
        "window.BANK.push("
        + json.dumps(bank, ensure_ascii=False, indent=2)
        + ");\n"
    )
    OUTPUT.write_text(javascript, encoding="utf-8")
    visual_count = sum("needsVisualReview" in question for question in questions)
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: 65 questions, "
        f"{len(groups)} groups, {visual_count} visual-review flags"
    )


if __name__ == "__main__":
    main()
