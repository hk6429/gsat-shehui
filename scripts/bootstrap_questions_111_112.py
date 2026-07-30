#!/usr/bin/env python3
"""Build the 111 and 112 verified banks from official CEEC source files."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = {
    111: {
        "questionCount": 67,
        "constructedScores": {
            48: 3, 50: 3, 52: 3, 54: 3, 56: 3,
            58: 3, 60: 3, 63: 3, 64: 3, 67: 3,
        },
        "manualConstructed": {
            52: "依據題文資訊並從供需架構分析，森林野火對該國當年葡萄酒市場有何影響？請在答題卷表格中勾選一項變化，並說明若葡萄酒價格不變，此時供給量與需求量之間出現的現象可稱為何？（3 分，10 字內）",
            54: "依據題文，若該國行政法的原理原則與我國相同，則其主管機關訂定行政命令的過程，最適宜用哪項法律原則說明？請在答題卷表格中勾選一項（2 分），並從題文中摘述判斷依據（1 分，35 字內）。",
            58: "文中提及有些企業在疫情影響下，產能調配受到的影響最為明顯。此現象的形成背景，適合以哪項概念說明？請在答題卷表格中勾選一項，並說明對應此概念的判斷依據。（3 分，30 字內）",
            60: "圖中最大跨邊界、分屬美墨的「聖地牙哥—提華納」都會區，自 1965 年起即利用都市本身的優勢合作發展。請比較二都市在技術、資本及勞工的區位要素上，各自的優勢為何？（3 分）",
            64: "請在答題卷作答區繪出一組「連接線」與「箭頭」，代表從移出地遷移到移入地，以作為文中說明集團移住造成賽德克族、太魯閣族與布農族混居情況的輔助地圖。（3 分）",
        },
        "manualSelected": {
            1: {
                "stem": "某國媒體報導，該國原住民族罹患心理疾病比率、自殺率、平均壽命與全國之比較，如表 1。該報導在未詳查原住民族生活困境的情形下，即宣稱這是因為原住民族不注重身心健康，例如偏好高脂肪、高甜度垃圾食物所致。類似此種缺乏同理與理解的報導，最可能引導社會大眾對原住民個人或民族形成何種更加不利的社會印象？"
            },
            3: {
                "stem": "小安研究某國財產制度，蒐集該國某年遺產繼承統計資料（表 2）。她推論造成男女數據差異的成因，除與該國傳統社會觀念有關外，與其民法繼承法律的規定亦有關聯。下列該國繼承制度所採取的原理原則，何者與表中數據所呈現之性別差異最為相關？"
            },
            4: {
                "stem": "表 3 是某市府對購買新型低汙染機車，以及報廢舊機車換購新型低汙染機車（汰舊換新）的補助。若這兩年新購置機車的數量與品質皆相同，僅有政府補助金額改變，則今年相較於去年，對消費者行為和空氣汙染的影響為何？"
            },
        },
        "optionTailMarkers": {
            2: "圖1",
            21: "圖4",
            28: "圖5",
            51: "依 據 題 文 資 訊 並 從 供 需 架 構",
            53: "依 據 題 文，若 該 國 行 政 法",
            57: "文 中 提 及 有 些 企 業",
            59: "圖 中 最 大 跨 邊 界",
        },
        "constructedDiscipline": {
            48: "civics", 50: "civics", 52: "civics", 54: "civics",
            56: "history", 58: "geography", 60: "geography",
            63: "history", 64: "geography", 67: "history",
        },
    },
    112: {
        "questionCount": 66,
        "constructedScores": {
            47: 3, 49: 3, 51: 3, 54: 3, 56: 3,
            59: 3, 61: 4, 62: 4, 65: 3, 66: 3,
        },
        "manualConstructed": {
            56: "依照文中民國初年學者的研究成果，請在東南亞的範圍內，於答題卷的地圖中畫出明代東洋與西洋的分界線。（3 分）",
            65: "若以圖 10 描述全球小麥及其他糧食的生產與消費組合，圖中的 P 點為滿足全球糧食消費的組合，請根據題文資訊，在答題卷表格左欄，以直線連結橫軸與縱軸上各一圓點，繪出一條符合題文之生產可能線示意圖，並從題文摘述判斷 P 的依據。（3 分，25 字內；左欄錯誤或未作答，本題不計分）"
        },
        "manualSelected": {
            4: {
                "stem": "阿芬打算租屋，選擇的唯一考量是每坪房租高低，表 1 是她蒐集某區不同格局的租屋資訊。若阿芬的公司每月補貼房租 10,000 元，此租金補貼對她租屋決策有何影響？",
                "options": {
                    "A": "補貼前後，都選擇兩房兩廳",
                    "B": "補貼前後，都選擇三房兩廳",
                    "C": "補貼前選兩房兩廳，實行後選兩房一廳",
                    "D": "補貼前選三房兩廳，實行後選一房一廳"
                }
            },
            20: {
                "stem": "圖 2 為 2018 年全球五個大洲各種規模都市的都市人口比例圖。若將拉丁美洲與歐洲兩者資料相比較，最可能推論出拉丁美洲的都市發展具有下列哪項特色？",
                "options": {
                    "A": "政府積極推動首要型都市政策，能吸引人口移往大型都市",
                    "B": "大型都市就業機會相對充分，促使鄉村人口大量移入求職",
                    "C": "鄉村產業結構不夠健全，許多失業人口移動至大型的都市",
                    "D": "殖民時代的大型都市，迄今公共設施充足，導致人口移入"
                }
            }
        },
        "optionTailMarkers": {15: "圖1"},
        "constructedDiscipline": {
            47: "civics", 49: "history", 51: "geography", 54: "civics",
            56: "geography", 59: "history", 61: "history",
            62: "geography", 65: "civics", 66: "civics",
        },
    },
}

HISTORY_WORDS = {
    "歷史", "史料", "時代", "世紀", "朝代", "帝國", "皇帝", "王朝", "日治",
    "總督府", "殖民", "戰爭", "考古", "遺址", "清代", "明代", "宋代", "唐代",
    "羅馬", "日本", "中國", "臺灣史", "原住民族",
}
GEOGRAPHY_WORDS = {
    "地圖", "地理", "區位", "地形", "河川", "氣候", "降水", "人口", "都市",
    "農業", "產業", "遷徙", "衛星", "經緯", "地景", "區域", "交通", "環境",
    "作物", "土地", "海洋", "能源",
}
CIVICS_WORDS = {
    "政府", "法律", "權利", "民主", "政黨", "選舉", "國會", "行政", "司法",
    "市場", "價格", "成本", "GDP", "社會", "性別", "平等", "媒體", "公民",
    "政策", "憲法", "自由", "福利", "供給", "需求",
}

VISUAL_RE = re.compile(r"圖\s*\d|表\s*\d|照片\s*\d|下圖|右圖|左圖|附圖")
GROUP_RE = re.compile(r"(?m)^\s*(\d+)\s*-\s*(\d+)\s*為\s*題\s*組\s*$")


def clean_text(text: str) -> str:
    text = text.replace("\f", "\n").replace("\u2028", "\n").replace("\u2029", "\n")
    kept = []
    for line in text.splitlines():
        if re.match(r"^\s*(?:第\s*\d+\s*頁|共\s*\d+\s*頁|-?\s*\d+\s*-?)\s*$", line):
            continue
        if "請記得在答題卷簽名" in line:
            continue
        if re.match(r"^\s*(?:111|112)年學測\s*$", line) or re.match(r"^\s*社會考科\s*$", line):
            continue
        kept.append(line.strip())
    text = " ".join(part for part in kept if part)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(?:111|112)年學測", "", text)
    text = re.sub(r"第\s*\d+\s*頁", "", text)
    text = re.sub(r"共\s*\d+\s*頁", "", text)
    text = text.replace("社會考科", "")
    cjk = r"\u3400-\u9fff\u3000-\u303f\uff00-\uffef"
    text = re.sub(fr"(?<=[{cjk}])\s+(?=[{cjk}])", "", text)
    text = re.sub(r"\s+([，。；：！？、）》」』】])", r"\1", text)
    text = re.sub(r"([（《「『【])\s+", r"\1", text)
    return text.strip()


def first_question_matches(raw: str, count: int) -> dict[int, re.Match[str]]:
    result: dict[int, re.Match[str]] = {}
    for match in re.finditer(r"(?m)^\s*(\d{1,2})\.(?!\d)\s*", raw):
        number = int(match.group(1))
        if 1 <= number <= count:
            result.setdefault(number, match)
    return result


def parse_options(block: str, tail_marker: str | None = None) -> tuple[str, dict[str, str]]:
    markers = list(re.finditer(r"\(([A-D])\)", block))
    if [marker.group(1) for marker in markers[:4]] != ["A", "B", "C", "D"]:
        raise ValueError(f"option markers={[marker.group(1) for marker in markers[:4]]}")
    stem = clean_text(block[: markers[0].start()])
    options = {}
    for index, marker in enumerate(markers[:4]):
        end = markers[index + 1].start() if index < 3 else len(block)
        options[marker.group(1)] = clean_text(block[marker.end() : end])
    if tail_marker:
        options["D"] = options["D"].split(clean_text(tail_marker), 1)[0].strip()
    return stem, options


def classify(text: str, forced: str | None = None) -> tuple[str, str, list[str]]:
    if forced:
        discipline = forced
    else:
        scores = {
            "history": sum(word in text for word in HISTORY_WORDS),
            "geography": sum(word in text for word in GEOGRAPHY_WORDS),
            "civics": sum(word in text for word in CIVICS_WORDS),
        }
        ranked = sorted(scores, key=scores.get, reverse=True)
        discipline = ranked[0]
        if scores[ranked[0]] == scores[ranked[1]]:
            discipline = "integrated"
    details = {
        "history": ("H3", ["史料判讀"]),
        "geography": ("G6", ["地理判讀"]),
        "civics": ("C5", ["公民議題"]),
        "integrated": ("S3", ["跨科整合"]),
    }
    objective, tags = details[discipline]
    return discipline, objective, tags


def page_number(raw: str, position: int) -> int:
    return raw.count("\f", 0, position) + 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, choices=[111, 112], required=True)
    args = parser.parse_args()
    year = args.year
    config = CONFIG[year]
    source_dir = ROOT / "sources" / str(year)
    raw = (source_dir / "official-test-raw.txt").read_text(encoding="utf-8")
    docx = (source_dir / "official-test-docx.txt").read_text(encoding="utf-8")
    metadata = json.loads(
        (source_dir / "official-metadata.json").read_text(encoding="utf-8")
    )
    explanations_path = ROOT / "data" / f"explanations-{year}.json"
    explanations = (
        json.loads(explanations_path.read_text(encoding="utf-8"))
        if explanations_path.exists()
        else {}
    )
    count = config["questionCount"]
    raw_matches = first_question_matches(raw, count)
    docx_matches = first_question_matches(docx, count)
    missing = set(range(1, count + 1)) - set(raw_matches) - set(docx_matches)
    if missing:
        raise ValueError(f"{year} source question-boundary gaps: {sorted(missing)}")

    raw_group_matches = list(GROUP_RE.finditer(raw))
    docx_group_matches = list(GROUP_RE.finditer(docx))
    group_ranges = []
    groups = {}
    for match in docx_group_matches:
        start, end = int(match.group(1)), int(match.group(2))
        group_id = f"G{start}"
        first_match = docx_matches.get(start)
        if first_match is None:
            raw_group = next(
                candidate
                for candidate in raw_group_matches
                if int(candidate.group(1)) == start
            )
            raw_first = raw_matches[start]
            passage = clean_text(raw[raw_group.end() : raw_first.start()])
        else:
            passage = clean_text(docx[match.end() : first_match.start()])
        group = {"title": f"第 {start}–{end} 題題組", "passage": passage}
        if VISUAL_RE.search(passage):
            raw_group = next(
                candidate
                for candidate in raw_group_matches
                if int(candidate.group(1)) == start
            )
            page = page_number(raw, raw_group.start())
            group["image"] = f"img/{year}/pages/p-{page:02d}.jpg"
        groups[group_id] = group
        group_ranges.append((start, end, group_id))

    raw_boundaries = sorted(
        [match.start() for match in raw_matches.values()]
        + [match.start() for match in raw_group_matches]
    )
    docx_boundaries = sorted(
        [match.start() for match in docx_matches.values()]
        + [match.start() for match in docx_group_matches]
    )

    def question_block(number: int) -> tuple[str, str]:
        if number in docx_matches:
            source = docx
            match = docx_matches[number]
            boundaries = docx_boundaries
        else:
            source = raw
            match = raw_matches[number]
            boundaries = raw_boundaries
        end = len(source)
        for position in boundaries:
            if position > match.start():
                end = position
                break
        return source[match.end() : end], source

    questions = []
    for number in range(1, count + 1):
        official = metadata["questions"][str(number)]
        forced = config["constructedDiscipline"].get(number)
        if number in config["manualConstructed"]:
            stem = config["manualConstructed"][number]
            source_text = stem
        else:
            block, _ = question_block(number)
            source_text = clean_text(block)
            if number in config["constructedScores"]:
                stem = source_text
            else:
                try:
                    stem, options = parse_options(
                        block, config["optionTailMarkers"].get(number)
                    )
                except ValueError as error:
                    raise ValueError(f"{year} question {number}: {error}") from error
                override = config.get("manualSelected", {}).get(number)
                if override:
                    stem = override.get("stem", stem)
                    options = override.get("options", options)
                    source_text = stem + " " + " ".join(options.values())
        discipline, objective, tags = classify(source_text, forced)
        item = {
            "no": number,
            "cat": discipline,
            "discipline": discipline,
            "objective": objective,
            "tags": tags,
            "sourceReview": "verified",
        }
        for start, end, group_id in group_ranges:
            if start <= number <= end:
                item["group"] = group_id
                break
        if number in config["constructedScores"]:
            item.update(
                {
                    "type": "constructed",
                    "stem": stem,
                    "maxScore": config["constructedScores"][number],
                    "officialRubric": official["officialRubric"],
                }
            )
        else:
            answer = official["answer"]
            answer_text = options[answer]
            item.update(
                {
                    "type": "single",
                    "answer": answer,
                    "pass": official["scoreRate"] / 100,
                    "disc": official["discrimination"],
                    "stem": stem,
                    "options": options,
                    "optionStats": official["optionAnalysis"],
                    "explain": explanations.get(
                        str(number),
                        (
                            f"答案為 {answer}。題幹的時間、空間與因果條件最符合"
                            f"「{answer_text}」。作答時應逐項對照材料線索，"
                            "避免只憑單一關鍵詞判斷。"
                        ),
                    ),
                }
            )
        if number in raw_matches and VISUAL_RE.search(source_text):
            page = page_number(raw, raw_matches[number].start())
            item["image"] = f"img/{year}/pages/p-{page:02d}.jpg"
        questions.append(item)

    payload = {
        "year": year,
        "era": "學測",
        "durationMinutes": 110,
        "groups": groups,
        "questions": questions,
    }
    output = ROOT / "data" / f"g{year}.js"
    output.write_text(
        f"// {year} 學測社會：由官方試題、答案、評分原則與統計資料驗證。\n"
        "window.BANK = window.BANK || [];\n"
        f"window.BANK.push({json.dumps(payload, ensure_ascii=False, indent=2)});\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {output.relative_to(ROOT)}: {len(questions)} questions, "
        f"{len(groups)} groups"
    )


if __name__ == "__main__":
    main()
