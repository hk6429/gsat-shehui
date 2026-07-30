#!/usr/bin/env python3
"""Extract 115 GSAT social official answers and statistics into reviewed JSON."""

from __future__ import annotations

import json
import re
from pathlib import Path

from python_calamine import CalamineWorkbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "sources" / "115"
OUTPUT = SOURCE_DIR / "official-metadata.json"
CONSTRUCTED = {40, 42, 44, 46, 49, 52, 54, 56, 60, 63, 65}


def parse_percent(value: object) -> int | None:
    if value in ("", None):
        return None
    text = str(value).replace("*", "").strip()
    return int(float(text))


def sheet_rows(path: Path, sheet_name: str) -> list[list[object]]:
    workbook = CalamineWorkbook.from_path(path)
    try:
        return workbook.get_sheet_by_name(sheet_name).to_python()
    finally:
        workbook.close()


def extract_answers() -> dict[int, str | None]:
    text = (SOURCE_DIR / "official-answers.txt").read_text(encoding="utf-8")
    answers: dict[int, str | None] = {}
    for number_text, answer_text in re.findall(r"(?<!\d)(\d{1,2})\s+([A-D／])", text):
        number = int(number_text)
        if 1 <= number <= 65:
            answers[number] = None if answer_text == "／" else answer_text

    if set(answers) != set(range(1, 66)):
        missing = sorted(set(range(1, 66)) - set(answers))
        raise ValueError(f"Official answer parsing did not cover 1-65; missing {missing}")

    parsed_constructed = {number for number, answer in answers.items() if answer is None}
    if parsed_constructed != CONSTRUCTED:
        raise ValueError(
            f"Constructed-response mismatch: {sorted(parsed_constructed)} "
            f"!= {sorted(CONSTRUCTED)}"
        )
    return answers


def extract_pass_disc() -> dict[int, dict[str, int]]:
    rows = sheet_rows(SOURCE_DIR / "official-pass-disc.xls", "社會")
    result: dict[int, dict[str, int]] = {}
    for row in rows:
        if not row:
            continue
        try:
            number = int(float(str(row[0])))
        except (TypeError, ValueError):
            continue
        if not 1 <= number <= 65:
            continue
        pass_rate = parse_percent(row[1] if len(row) > 1 else None)
        discrimination = parse_percent(row[10] if len(row) > 10 else None)
        if pass_rate is None or discrimination is None:
            raise ValueError(f"Question {number} is missing P or D in official workbook")
        result[number] = {"scoreRate": pass_rate, "discrimination": discrimination}

    expected = set(range(1, 66)) - CONSTRUCTED
    if set(result) != expected:
        missing = sorted(expected - set(result))
        unexpected = sorted(set(result) - expected)
        raise ValueError(
            f"Official P/D coverage mismatch; missing={missing}, "
            f"unexpected={unexpected}"
        )
    return result


def extract_option_analysis() -> dict[int, dict[str, dict[str, int]]]:
    rows = sheet_rows(SOURCE_DIR / "official-option-analysis.xls", "社會")
    headers = [str(value) for value in rows[3]]
    option_columns = {
        label: headers.index(label) for label in ("未答", "A", "B", "C", "D")
    }
    result: dict[int, dict[str, dict[str, int]]] = {}
    current_number: int | None = None

    for row in rows[4:]:
        if not row:
            continue
        if row[0] not in ("", None):
            try:
                current_number = int(float(str(row[0])))
            except (TypeError, ValueError):
                current_number = None
        group = str(row[1]).strip() if len(row) > 1 else ""
        if current_number is None or group not in {"T", "H", "L"}:
            continue
        values: dict[str, int] = {}
        for label, column in option_columns.items():
            parsed = parse_percent(row[column] if len(row) > column else None)
            if parsed is None:
                raise ValueError(
                    f"Question {current_number}, group {group} lacks {label}"
                )
            values[label] = parsed
        result.setdefault(current_number, {})[group] = values

    expected = set(range(1, 66)) - CONSTRUCTED
    if set(result) != expected:
        missing = sorted(expected - set(result))
        unexpected = sorted(set(result) - expected)
        raise ValueError(
            f"Option analysis coverage mismatch; missing={missing}, unexpected={unexpected}"
        )
    incomplete = {
        number: sorted({"T", "H", "L"} - set(groups))
        for number, groups in result.items()
        if set(groups) != {"T", "H", "L"}
    }
    if incomplete:
        raise ValueError(f"Option analysis groups incomplete: {incomplete}")
    return result


def clean_rubric_block(block: str) -> str:
    block = block.replace("\f", "\n")
    block = re.sub(r"(?m)^\s*\d+\s*$", "", block)
    block = re.sub(r"[ \t]+\n", "\n", block)
    block = re.sub(r"\n{3,}", "\n\n", block)
    return block.strip()


def extract_rubrics() -> dict[int, str]:
    text = (SOURCE_DIR / "official-nonchoice-rubric.txt").read_text(encoding="utf-8")
    matches = list(re.finditer(r"(?m)^第\s*(\d+)\s*題\s*$", text))
    result: dict[int, str] = {}
    for index, match in enumerate(matches):
        number = int(match.group(1))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        result[number] = clean_rubric_block(text[match.end() : end])
    if set(result) != CONSTRUCTED:
        raise ValueError(
            f"Rubric coverage mismatch: {sorted(result)} != {sorted(CONSTRUCTED)}"
        )
    return result


def main() -> None:
    answers = extract_answers()
    pass_disc = extract_pass_disc()
    option_analysis = extract_option_analysis()
    rubrics = extract_rubrics()

    questions = {}
    for number in range(1, 66):
        item = {"answer": answers[number]}
        if number in pass_disc:
            item.update(pass_disc[number])
        if number in option_analysis:
            item["optionAnalysis"] = option_analysis[number]
        if number in rubrics:
            item["officialRubric"] = rubrics[number]
        questions[str(number)] = item

    payload = {
        "exam": "115學年度學科能力測驗",
        "subject": "社會",
        "questionCount": 65,
        "selectedCount": 54,
        "constructedCount": 11,
        "constructedQuestionNumbers": sorted(CONSTRUCTED),
        "questions": questions,
    }
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: "
        f"{len(questions)} questions, {len(option_analysis)} option analyses, "
        f"{len(rubrics)} rubrics"
    )


if __name__ == "__main__":
    main()
