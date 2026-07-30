#!/usr/bin/env python3
"""Build the 90–110 GSAT social banks from reviewed official sources."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OPTION_RE = re.compile(r"[\(（\[]\s*([A-EＡ-Ｅ])\s*[\)）\]]")
VISUAL_RE = re.compile(r"圖\s*\d|表\s*\d|照片\s*\d|下圖|右圖|左圖|附圖|素描")
GROUP_RE = re.compile(
    r"第\s*(\d+)\s*[-–—至到]\s*(\d+)\s*題\s*(?:為|是)\s*題\s*組"
)
OLD_GLYPHS = str.maketrans(
    {
        "㆒": "一", "㆓": "二", "㆔": "三", "㆕": "四", "㆖": "上",
        "㆘": "下", "㆗": "中", "㆟": "人", "㆞": "地", "㈻": "學",
        "㈳": "社", "㉃": "至", "㊠": "項", "㊜": "適", "㊝": "優",
        "㈲": "有", "㈴": "名", "㈮": "金", "㈶": "財", "㊩": "醫",
        "㊚": "男", "㊪": "宗", "㉂": "自", "㈿": "協", "㈨": "九",
        "㈩": "十",
    }
)

HISTORY_WORDS = {
    "歷史", "史料", "朝代", "帝國", "皇帝", "王朝", "日治", "清朝", "清代",
    "明代", "宋代", "唐代", "民國", "戰爭", "革命", "殖民", "總督府", "條約",
}
GEOGRAPHY_WORDS = {
    "地圖", "地形", "氣候", "河川", "海岸", "農業", "都市", "人口", "區位",
    "產業", "作物", "經緯", "降水", "地理", "土壤", "洋流", "交通", "環境",
}
CIVICS_WORDS = {
    "政府", "法律", "權利", "民主", "政黨", "選舉", "行政", "司法", "憲法",
    "市場", "價格", "社會", "公民", "政策", "自由", "平等", "立法院", "總統",
}
SPECIAL_ANSWER_NOTES = {
    (99, 52): "官方答案為 B；大考中心另公告未答本題者亦給分。",
}


def question_count(year: int) -> int:
    if year == 90:
        return 80
    if year == 91:
        return 76
    return 72


def option_labels(year: int, number: int) -> list[str]:
    if year == 90 and (number <= 12 or number >= 51):
        return list("ABCDE")
    return list("ABCD")


def clean_text(text: str) -> str:
    text = text.translate(OLD_GLYPHS).replace("\f", "\n")
    kept: list[str] = []
    for original in text.splitlines():
        line = original.strip()
        if not line:
            continue
        if re.match(r"^(?:第\s*\d+\s*頁|共\s*\d+\s*頁|-?\s*\d+\s*-?)$", line):
            continue
        if re.match(r"^\d{2,3}\s*年?學測$", line) or line == "社會考科":
            continue
        if line in {"壹、單一選擇題", "貳、多重選擇題", "參、題組題"}:
            continue
        kept.append(line)
    text = " ".join(kept)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\d{2,3}\s*年?學測", "", text)
    text = re.sub(r"第\s*\d+\s*頁", "", text)
    text = re.sub(r"共\s*\d+\s*頁", "", text)
    text = text.replace("社會考科", "")
    cjk = r"\u3400-\u9fff\u3000-\u303f\uff00-\uffef"
    text = re.sub(fr"(?<=[{cjk}])\s+(?=[{cjk}])", "", text)
    text = re.sub(r"\s+([，。；：！？、）》」』】])", r"\1", text)
    text = re.sub(r"([（《「『【])\s+", r"\1", text)
    return text.strip()


def question_starts(raw: str, year: int) -> dict[int, re.Match[str]]:
    option_markers = list(OPTION_RE.finditer(raw))
    expected_sequence = [
        label
        for number in range(1, question_count(year) + 1)
        for label in option_labels(year, number)
    ]
    normalized_sequence = [
        chr(ord("A") + "ＡＢＣＤＥ".index(match.group(1)))
        if match.group(1) in "ＡＢＣＤＥ"
        else match.group(1)
        for match in option_markers
    ]
    if normalized_sequence != expected_sequence:
        raise ValueError(f"{year} global official option sequence mismatch")

    result: dict[int, re.Match[str]] = {}
    option_offset = 0
    for number in range(1, question_count(year) + 1):
        labels = option_labels(year, number)
        first_option = option_markers[option_offset]
        lower_bound = (
            option_markers[option_offset - 1].end()
            if option_offset
            else 0
        )
        digits = r"\s*".join(str(number))
        suffix = r"\s*[\.．]" if not (year == 90 and number == 74) else r"\s*[\.．]?"
        matches = [
            match
            for match in re.finditer(rf"(?m)^\s*{digits}{suffix}", raw)
            if lower_bound <= match.start() < first_option.start()
        ]
        if len(matches) != 1:
            raise ValueError(f"{year} question {number} has {len(matches)} source starts")
        result[number] = matches[0]
        option_offset += len(labels)
    return result


def split_option_tail(text: str) -> tuple[str, str]:
    parts = re.split(r"\n\s*\n", text, maxsplit=1)
    return parts[0], parts[1] if len(parts) == 2 else ""


def page_number(raw: str, position: int) -> int:
    return raw.count("\f", 0, position) + 1


def classify(text: str, year: int, number: int) -> tuple[str, str, list[str]]:
    scores = {
        "history": sum(word in text for word in HISTORY_WORDS),
        "geography": sum(word in text for word in GEOGRAPHY_WORDS),
        "civics": sum(word in text for word in CIVICS_WORDS),
    }
    best = max(scores, key=scores.get)
    if scores[best] == 0 or list(scores.values()).count(scores[best]) > 1:
        if year >= 91:
            best = "civics" if number <= 24 else "history" if number <= 48 else "geography"
        else:
            best = "integrated"
    details = {
        "history": ("H3", ["史料判讀"]),
        "geography": ("G6", ["地理判讀"]),
        "civics": ("C5", ["公民議題"]),
        "integrated": ("S3", ["跨科整合"]),
    }
    objective, tags = details[best]
    return best, objective, tags


def official_answer_fields(
    official_answer: str | list[str] | None,
    labels: list[str],
) -> tuple[str, dict[str, object]]:
    if official_answer is None:
        return labels[0], {
            "acceptedAnswers": labels,
            "officialAnswerNote": "本題官方公告無答案，所有到考生均給分。",
        }
    if isinstance(official_answer, list):
        return official_answer[0], {
            "acceptedAnswers": official_answer,
            "officialAnswerNote": f"官方接受答案：{' 或 '.join(official_answer)}。",
        }
    if len(official_answer) > 1:
        return official_answer, {}
    return official_answer, {}


def build_year(year: int) -> None:
    source_dir = ROOT / "sources" / str(year)
    raw = (source_dir / "official-test-raw.txt").read_text(encoding="utf-8")
    metadata = json.loads(
        (source_dir / "official-metadata.json").read_text(encoding="utf-8")
    )
    count = question_count(year)
    starts = question_starts(raw, year)
    groups: dict[str, dict[str, str]] = {}
    group_ranges: list[tuple[int, int, str]] = []
    parsed: list[dict[str, object]] = []

    for number in range(1, count + 1):
        start = starts[number]
        end = starts[number + 1].start() if number < count else len(raw)
        block = raw[start.end() : end]
        markers = list(OPTION_RE.finditer(block))
        labels = option_labels(year, number)
        normalized = [
            chr(ord("A") + "ＡＢＣＤＥ".index(match.group(1)))
            if match.group(1) in "ＡＢＣＤＥ"
            else match.group(1)
            for match in markers
        ]
        if normalized != labels:
            raise ValueError(
                f"{year} question {number} options {normalized}, expected {labels}"
            )

        stem = clean_text(block[: markers[0].start()])
        options: dict[str, str] = {}
        trailing = ""
        raw_group_match: re.Match[str] | None = None
        for index, marker in enumerate(markers):
            option_end = markers[index + 1].start() if index + 1 < len(markers) else len(block)
            option_text = block[marker.end() : option_end]
            if index == len(markers) - 1:
                if number < count:
                    next_digits = r"\s*".join(str(number + 1))
                    raw_group_match = re.search(
                        rf"(?m)^\s*(?:第\s*)?{next_digits}\s*"
                        r"[-–—至到]\s*(\d(?:\s*\d)?)\s*題?\s*為?\s*題\s*組",
                        option_text,
                    )
                if raw_group_match:
                    trailing = option_text[raw_group_match.start() :]
                    option_text, _ = split_option_tail(
                        option_text[: raw_group_match.start()]
                    )
                else:
                    option_text, trailing = split_option_tail(option_text)
                material_match = re.search(
                    r"(?m)^\s*(?:表|圖|照片)\s*\d",
                    option_text,
                )
                if material_match:
                    option_text = option_text[: material_match.start()]
            options[labels[index]] = clean_text(option_text)
        if not stem:
            raise ValueError(f"{year} question {number} has an empty stem")
        has_visual_options = any(not value for value in options.values())
        if has_visual_options:
            options = {
                label: value or f"見官方題圖選項 {label}"
                for label, value in options.items()
            }

        trailing_clean = clean_text(trailing)
        group_match = GROUP_RE.search(trailing_clean)
        if raw_group_match:
            group_start = number + 1
            group_end = int(re.sub(r"\s+", "", raw_group_match.group(1)))
            passage = clean_text(trailing[raw_group_match.end() :])
        elif group_match:
            group_start, group_end = map(int, group_match.groups())
            passage = trailing_clean[group_match.end() :].strip()
        else:
            group_start = group_end = 0
            passage = ""
        if group_start:
            if group_start == number + 1:
                group_id = f"G{group_start}"
                image_only_group = not passage
                if image_only_group:
                    passage = "本題組共同材料請見大考中心官方題本原頁。"
                group = {
                    "title": f"第 {group_start}–{group_end} 題題組",
                    "passage": passage,
                }
                if image_only_group or VISUAL_RE.search(passage):
                    group["image"] = (
                        f"img/{year}/pages/p-{page_number(raw, start.start()):02d}.jpg"
                    )
                groups[group_id] = group
                group_ranges.append((group_start, group_end, group_id))

        official = metadata["questions"][str(number)]
        discipline, objective, tags = classify(
            stem + " " + " ".join(options.values()), year, number
        )
        canonical, answer_extras = official_answer_fields(official["answer"], labels)
        if (year, number) in SPECIAL_ANSWER_NOTES:
            answer_extras["officialAnswerNote"] = SPECIAL_ANSWER_NOTES[(year, number)]
        item: dict[str, object] = {
            "no": number,
            "cat": discipline,
            "discipline": discipline,
            "objective": objective,
            "tags": tags,
            "sourceReview": "verified",
            "type": "multiple" if len(canonical) > 1 else "single",
            "answer": canonical,
            **answer_extras,
            "stem": stem,
            "options": options,
        }
        for group_start, group_end, group_id in group_ranges:
            if group_start <= number <= group_end:
                item["group"] = group_id
                break
        if "scoreRate" in official:
            item["pass"] = official["scoreRate"] / 100
            item["disc"] = official["discrimination"]
            item["optionStats"] = official["optionAnalysis"]
        else:
            item["statisticsAvailable"] = False
        answer_label = (
            "、".join(canonical)
            if len(canonical) > 1
            else canonical
        )
        item["explain"] = (
            f"官方答案為 {answer_label}。作答時應逐項對照題幹的時間、空間與因果條件；"
            "本題文字、選項與答案均依大考中心公布資料整理。"
        )
        question_source = stem + " " + " ".join(options.values())
        if has_visual_options or VISUAL_RE.search(question_source):
            item["image"] = (
                f"img/{year}/pages/p-{page_number(raw, start.start()):02d}.jpg"
            )
        parsed.append(item)

    payload = {
        "year": year,
        "era": "學測",
        "durationMinutes": 100,
        "statisticsAvailable": metadata.get("statisticsAvailable", True),
        "groups": groups,
        "questions": parsed,
    }
    output = ROOT / "data" / f"g{year}.js"
    output.write_text(
        f"// {year} 學測社會：由大考中心官方試題、答案與統計資料驗證。\n"
        "window.BANK = window.BANK || [];\n"
        f"window.BANK.push({json.dumps(payload, ensure_ascii=False, indent=2)});\n",
        encoding="utf-8",
    )
    print(f"Wrote {output.relative_to(ROOT)}: {len(parsed)} questions, {len(groups)} groups")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, choices=range(90, 111))
    args = parser.parse_args()
    years = [args.year] if args.year else list(range(90, 111))
    for year in years:
        build_year(year)


if __name__ == "__main__":
    main()
