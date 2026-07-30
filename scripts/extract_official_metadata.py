#!/usr/bin/env python3
"""Extract GSAT social official answers and statistics into reviewed JSON."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "sources" / "115"
OUTPUT = SOURCE_DIR / "official-metadata.json"
CONSTRUCTED = {40, 42, 44, 46, 49, 52, 54, 56, 60, 63, 65}
QUESTION_COUNT = 65

YEAR_CONFIG = {
    90: {
        "questionCount": 80,
        "constructed": set(),
        "statisticsAvailable": False,
    },
    91: {"questionCount": 76, "constructed": set()},
    **{
        year: {"questionCount": 72, "constructed": set()}
        for year in range(92, 111)
    },
    111: {
        "questionCount": 67,
        "constructed": {48, 50, 52, 54, 56, 58, 60, 63, 64, 67},
    },
    112: {
        "questionCount": 66,
        "constructed": {47, 49, 51, 54, 56, 59, 61, 62, 65, 66},
    },
    113: {
        "questionCount": 64,
        "constructed": {38, 40, 43, 46, 49, 50, 53, 57, 60, 64},
    },
    114: {
        "questionCount": 64,
        "constructed": {46, 49, 51, 53, 55, 56, 58, 61, 63, 64},
    },
    115: {
        "questionCount": 65,
        "constructed": {40, 42, 44, 46, 49, 52, 54, 56, 60, 63, 65},
    },
}


def parse_percent(value: object) -> int | None:
    if value in ("", None):
        return None
    text = str(value).replace("*", "").strip()
    return int(float(text))


def sheet_rows(path: Path, sheet_name: str) -> list[list[object]]:
    from python_calamine import CalamineWorkbook

    workbook = CalamineWorkbook.from_path(path)
    try:
        return workbook.get_sheet_by_name(sheet_name).to_python()
    finally:
        workbook.close()


MANUAL_ANSWERS = {
    90: (
        "DBECDBBAABDBCBDD ACBB".replace(" ", "")
        + "ABDACDAABCBAADBABADC"
        + "DCADCBCDCD"
        + "BDE|ACDE|BE|AB|ABCD|ABD|ABD|CD|AD|DE|"
        + "BDAEADEDCCE CABC AEECA".replace(" ", "")
    ),
    91: (
        "ADCABDBCCDBACBBCDADC"
        "DCBDBDCADBCBCA AABD BA".replace(" ", "")
        + "BAADBC AACBDCB B A BDCBA".replace(" ", "")
        + "DCAACDDDCDC B A B A B".replace(" ", "")
    ),
}


def manual_answer_map(year: int) -> dict[int, str]:
    raw = MANUAL_ANSWERS[year]
    values = raw.split("|") if "|" in raw else list(raw)
    if year == 90:
        prefix = list(raw[:50])
        remainder = raw[50:].split("|")
        values = prefix + remainder[:-1] + list(remainder[-1])
    expected = YEAR_CONFIG[year]["questionCount"]
    if len(values) != expected:
        raise ValueError(f"{year} manual answers have {len(values)} values, expected {expected}")
    return {number: answer for number, answer in enumerate(values, start=1)}


def normalize_answer(answer_text: str) -> str | list[str] | None:
    compact = re.sub(r"\s+", "", answer_text)
    if compact in {"／", "無答案", "註"}:
        return None
    letters = re.findall(r"[A-E]", compact)
    if not letters:
        raise ValueError(f"Unrecognized official answer: {answer_text!r}")
    unique = list(dict.fromkeys(letters))
    if len(unique) == 1:
        return unique[0]
    if "或" in compact or "／" in compact or "/" in compact or "（" in compact:
        return unique
    return "".join(unique)


def extract_answers(year: int) -> dict[int, str | list[str] | None]:
    if year in MANUAL_ANSWERS:
        return manual_answer_map(year)

    answer_path = SOURCE_DIR / "official-answers-social.txt"
    if not answer_path.exists():
        answer_path = SOURCE_DIR / "official-answers.txt"
    text = answer_path.read_text(encoding="utf-8")
    answers: dict[int, str | list[str] | None] = {}
    pattern = (
        r"(?<!\d)(\d{1,2})\s*[＊*]?\s+"
        r"((?:[A-E](?:\s*(?:或|、|／|/|\（或)\s*[A-E]\）?)*)|無答案|註)"
        r"(?=\s|$)"
    )
    for number_text, answer_text in re.findall(pattern, text):
        number = int(number_text)
        if 1 <= number <= QUESTION_COUNT:
            answers[number] = normalize_answer(answer_text)

    expected_numbers = set(range(1, QUESTION_COUNT + 1))
    if set(answers) != expected_numbers:
        missing = sorted(expected_numbers - set(answers))
        raise ValueError(
            f"Official answer parsing did not cover 1-{QUESTION_COUNT}; missing {missing}"
        )

    parsed_constructed = {
        number for number, answer in answers.items()
        if answer is None and number in CONSTRUCTED
    }
    if parsed_constructed != CONSTRUCTED:
        raise ValueError(f"Constructed-response mismatch: {sorted(parsed_constructed)}")
    return answers


def extract_pass_disc() -> dict[int, dict[str, int]]:
    if not YEAR_CONFIG[int(SOURCE_DIR.name)].get("statisticsAvailable", True):
        return {}
    pdf_text_path = SOURCE_DIR / "official-pass-disc.txt"
    if pdf_text_path.exists():
        text = pdf_text_path.read_text(encoding="utf-8")
        result: dict[int, dict[str, int]] = {}
        for line in text.replace("\f", "\n").splitlines():
            match = re.match(r"^\s*(\d{1,2})\s+(.+)$", line)
            if not match:
                continue
            number = int(match.group(1))
            if not 1 <= number <= QUESTION_COUNT or number in CONSTRUCTED:
                continue
            values = [int(value) for value in re.findall(r"-?\d+", match.group(2))]
            if len(values) != 13:
                continue
            result[number] = {
                "scoreRate": values[0],
                "discrimination": values[8],
            }

        expected = set(range(1, QUESTION_COUNT + 1)) - CONSTRUCTED
        if set(result) != expected:
            missing = sorted(expected - set(result))
            unexpected = sorted(set(result) - expected)
            raise ValueError(
                f"Official PDF P/D coverage mismatch; missing={missing}, "
                f"unexpected={unexpected}"
            )
        return result

    rows = sheet_rows(SOURCE_DIR / "official-pass-disc.xls", "社會")
    result: dict[int, dict[str, int]] = {}
    for row in rows:
        if not row:
            continue
        try:
            number = int(float(str(row[0])))
        except (TypeError, ValueError):
            continue
        if not 1 <= number <= QUESTION_COUNT:
            continue
        try:
            pass_rate = parse_percent(row[1] if len(row) > 1 else None)
            discrimination = parse_percent(row[10] if len(row) > 10 else None)
        except ValueError:
            continue
        if pass_rate is None or discrimination is None:
            raise ValueError(f"Question {number} is missing P or D in official workbook")
        result[number] = {"scoreRate": pass_rate, "discrimination": discrimination}

    expected = set(range(1, QUESTION_COUNT + 1)) - CONSTRUCTED
    if set(result) != expected:
        missing = sorted(expected - set(result))
        unexpected = sorted(set(result) - expected)
        raise ValueError(
            f"Official P/D coverage mismatch; missing={missing}, "
            f"unexpected={unexpected}"
        )
    return result


def extract_option_analysis() -> dict[int, dict[str, dict[str, int]]]:
    if not YEAR_CONFIG[int(SOURCE_DIR.name)].get("statisticsAvailable", True):
        return {}
    pdf_text_path = SOURCE_DIR / "official-option-analysis.txt"
    if pdf_text_path.exists():
        text = pdf_text_path.read_text(encoding="utf-8")
        parsed_rows: list[tuple[int | None, str, dict[str, int]]] = []
        for line in text.replace("\f", "\n").splitlines():
            match = re.match(r"^\s*(?:(\d{1,2})\s+)?(T|H|L)\s+(.+)$", line)
            if not match:
                continue
            number_text, group, row_text = match.groups()
            values = [int(value) for value in re.findall(r"-?\d+", row_text)]
            if len(values) < 5:
                raise ValueError(
                    f"Official option group {group} PDF row "
                    f"has only {len(values)} values"
                )
            values = values[:5]
            parsed_rows.append(
                (
                    int(number_text) if number_text else None,
                    group,
                    dict(zip(("未答", "A", "B", "C", "D"), values, strict=True)),
                )
            )

        result: dict[int, dict[str, dict[str, int]]] = {}
        if len(parsed_rows) % 3:
            raise ValueError(f"Official PDF option rows are not divisible by 3")
        for index in range(0, len(parsed_rows), 3):
            chunk = parsed_rows[index : index + 3]
            number = index // 3 + 1
            declared = {item[0] for item in chunk if item[0] is not None}
            if declared and declared != {number}:
                raise ValueError(
                    f"Official option row order mismatch at {number}: {sorted(declared)}"
                )
            groups = {item[1]: item[2] for item in chunk}
            if set(groups) != {"T", "H", "L"}:
                raise ValueError(
                    f"Official option groups out of order at {number}: {sorted(groups)}"
                )
            result[number] = groups

        expected = set(range(1, QUESTION_COUNT + 1)) - CONSTRUCTED
        if set(result) != expected:
            missing = sorted(expected - set(result))
            unexpected = sorted(set(result) - expected)
            raise ValueError(
                f"Official PDF option analysis coverage mismatch; "
                f"missing={missing}, unexpected={unexpected}"
            )
        incomplete = {
            number: sorted({"T", "H", "L"} - set(groups))
            for number, groups in result.items()
            if set(groups) != {"T", "H", "L"}
        }
        if incomplete:
            raise ValueError(f"Official PDF option groups incomplete: {incomplete}")
        return result

    rows = sheet_rows(SOURCE_DIR / "official-option-analysis.xls", "社會")
    header_index = next(
        index
        for index, row in enumerate(rows)
        if "未答" in [str(value).strip() for value in row]
    )
    headers = [str(value).strip() for value in rows[header_index]]
    option_columns = {
        label: headers.index(label) for label in ("未答", "A", "B", "C", "D")
    }
    result: dict[int, dict[str, dict[str, int]]] = {}
    current_number: int | None = None

    for row in rows[header_index + 1 :]:
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

    expected = set(range(1, QUESTION_COUNT + 1)) - CONSTRUCTED
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
    if not CONSTRUCTED:
        return {}
    text = (SOURCE_DIR / "official-nonchoice-rubric.txt").read_text(encoding="utf-8")
    matches = list(re.finditer(r"(?m)^\f?第\s*(\d+)\s*題\s*$", text))
    if len(matches) != len(CONSTRUCTED):
        raise ValueError(
            f"Rubric heading count mismatch: {len(matches)} != {len(CONSTRUCTED)}"
        )
    result: dict[int, str] = {}
    for index, match in enumerate(matches):
        printed_number = int(match.group(1))
        number = printed_number
        if (
            QUESTION_COUNT == 64
            and printed_number == 63
            and printed_number in result
            and 64 in CONSTRUCTED
        ):
            number = 64
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        result[number] = clean_rubric_block(text[match.end() : end])
    if set(result) != CONSTRUCTED:
        raise ValueError(
            f"Rubric coverage mismatch: {sorted(result)} != {sorted(CONSTRUCTED)}"
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, choices=sorted(YEAR_CONFIG), default=115)
    args = parser.parse_args()

    global SOURCE_DIR, OUTPUT, CONSTRUCTED, QUESTION_COUNT
    config = YEAR_CONFIG[args.year]
    SOURCE_DIR = ROOT / "sources" / str(args.year)
    OUTPUT = SOURCE_DIR / "official-metadata.json"
    CONSTRUCTED = config["constructed"]
    QUESTION_COUNT = config["questionCount"]

    answers = extract_answers(args.year)
    pass_disc = extract_pass_disc()
    option_analysis = extract_option_analysis()
    rubrics = extract_rubrics()

    questions = {}
    for number in range(1, QUESTION_COUNT + 1):
        item = {"answer": answers[number]}
        if number in pass_disc:
            item.update(pass_disc[number])
        if number in option_analysis:
            item["optionAnalysis"] = option_analysis[number]
        if number in rubrics:
            item["officialRubric"] = rubrics[number]
        questions[str(number)] = item

    payload = {
        "exam": f"{args.year}學年度學科能力測驗",
        "subject": "社會",
        "questionCount": QUESTION_COUNT,
        "selectedCount": QUESTION_COUNT - len(CONSTRUCTED),
        "constructedCount": len(CONSTRUCTED),
        "constructedQuestionNumbers": sorted(CONSTRUCTED),
        "statisticsAvailable": config.get("statisticsAvailable", True),
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
