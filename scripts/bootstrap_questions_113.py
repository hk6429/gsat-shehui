#!/usr/bin/env python3
"""Build the verified 113 question file from official CEEC source files."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "sources" / "113"
TEXT = SOURCE_DIR / "official-test-docx.txt"
METADATA = SOURCE_DIR / "official-metadata.json"
CLASSIFICATION = SOURCE_DIR / "classification.json"
EXPLANATIONS = ROOT / "data" / "explanations-113.json"
OUTPUT = ROOT / "data" / "g113.js"

QUESTION_COUNT = 64
CONSTRUCTED_SCORES = {
    38: 3,
    40: 4,
    43: 4,
    46: 3,
    49: 3,
    50: 4,
    53: 4,
    57: 3,
    60: 4,
    64: 4,
}

QUESTION_IMAGES = {
    8: "img/113/q8.png",
    18: "img/113/q18.png",
    20: "img/113/q20.png",
    29: "img/113/q29.png",
    54: "img/113/q54.png",
}

GROUP_IMAGES = {
    "G27": "img/113/g27.png",
    "G36": "img/113/g36.png",
    "G51": "img/113/g51.png",
}

MATERIAL_HTML = {
    7: (
        "<table><caption>表 1：浙江四縣戶口數</caption>"
        "<thead><tr><th rowspan=\"2\">縣</th><th colspan=\"2\">嘉靖 1 年（1522）</th>"
        "<th colspan=\"2\">嘉靖 11 年（1532）</th><th colspan=\"2\">嘉靖 21 年（1542）</th></tr>"
        "<tr><th>戶數</th><th>人口數</th><th>戶數</th><th>人口數</th><th>戶數</th><th>人口數</th></tr></thead>"
        "<tbody><tr><th>鄞縣</th><td>58,345</td><td>193,380</td><td>58,350</td><td>193,385</td><td>58,355</td><td>193,395</td></tr>"
        "<tr><th>慈溪</th><td>21,000</td><td>37,525</td><td>19,300</td><td>32,501</td><td>18,732</td><td>27,455</td></tr>"
        "<tr><th>定海</th><td>12,517</td><td>37,450</td><td>13,026</td><td>38,808</td><td>14,017</td><td>38,701</td></tr>"
        "<tr><th>象山</th><td>3,802</td><td>17,812</td><td>3,802</td><td>17,812</td><td>3,802</td><td>17,812</td></tr></tbody></table>"
    ),
    9: (
        "<table><caption>表 2：日治前期官隘與民隘人數</caption>"
        "<thead><tr><th>時間</th><th>官隘</th><th>民隘</th><th>合計</th></tr></thead>"
        "<tbody><tr><th>1895</th><td>—</td><td>568</td><td>568</td></tr>"
        "<tr><th>1897</th><td>159</td><td>437</td><td>596</td></tr>"
        "<tr><th>1903</th><td>3,054</td><td>0</td><td>3,054</td></tr></tbody></table>"
    ),
    29: (
        "<table><caption>表 3：歐盟四國經濟資料</caption>"
        "<thead><tr><th>國家</th><th>GDP（10 億美元）</th><th>人均 GDP（美元）</th><th>主要出口項目</th></tr></thead>"
        "<tbody><tr><th>甲</th><td>89.0</td><td>13,772</td><td>電氣機械設備、礦物燃料、礦物油、機械設備等</td></tr>"
        "<tr><th>乙</th><td>4,072.2</td><td>48,432</td><td>機械和運輸設備、醫學和藥品、航太產品、電腦設備等</td></tr>"
        "<tr><th>丙</th><td>1,397.5</td><td>29,350</td><td>機械和運輸設備、食品飲料和香菸、化學品等</td></tr>"
        "<tr><th>丁</th><td>585.9</td><td>55,873</td><td>機械和運輸設備、化學品和相關產品等</td></tr></tbody></table>"
    ),
    31: (
        "<table><caption>表 4：河川水位觀測資料</caption>"
        "<thead><tr><th>觀測站</th><th>水面距堤防頂部高差（m）</th><th>最高水位日期、時間</th></tr></thead>"
        "<tbody><tr><th>甲</th><td>9.8</td><td>09/22 01:20</td></tr>"
        "<tr><th>乙</th><td>7.3</td><td>09/22 00:40</td></tr><tr><th>丙</th><td>7.4</td><td>09/21 23:20</td></tr>"
        "<tr><th>丁</th><td>8.8</td><td>09/22 12:40</td></tr><tr><th>戊</th><td>16.3</td><td>09/21 23:50</td></tr></tbody></table>"
    ),
    39: (
        "<table><caption>表 5：咖啡店區位條件</caption>"
        "<thead><tr><th>地區</th><th>至火車站直線距離（km）</th><th>人口密度（人／km²）</th>"
        "<th>區域內咖啡店（家）</th><th>店面平均租金（元／坪）</th></tr></thead>"
        "<tbody><tr><th>甲</th><td>5</td><td>18,949</td><td>59</td><td>2,300</td></tr>"
        "<tr><th>乙</th><td>3</td><td>23,215</td><td>57</td><td>3,500</td></tr></tbody></table>"
    ),
}

MANUAL_SELECTED = {
    7: {
        "stem": "某生進行探究學習時，根據明代《寧波府志》的資料，整理出 1522 至 1542 年間鄞縣等地的人口資料（表 1）。比較史書記載，發現此時期該地區並無大的天災或戰亂，按理戶數和人口數應會增加，但實則不然。針對上述現象，以下哪個解釋最合理？",
        "options": {
            "A": "明代簡化賦役為按土地人丁徵銀，官員不再精算戶、口數",
            "B": "當地官員為維持轄下治安，強制將新增加的人口遷移他處",
            "C": "當地鄰近海口，大量人民搭乘海船前往遼東地區開墾荒地",
            "D": "明代實施海禁，當地由於海盜猖獗，政府乃限制移民進入",
        },
    },
    18: {
        "stem": "臺灣部分村落常在四周外緣設置東、西、南、北、中等五營的小廟，以彰顯守護的村落範圍，並象徵能避開災禍侵擾。照片 1 為某村落五營中的兩座小廟，其對聯呈現該村落常面臨的自然災害；若自然災害與自然環境有關，而地名可顯示當地自然環境特徵，這兩座小廟最可能位於下列哪組地名所在村落的外緣？",
        "options": {
            "A": "大潭、後塭仔",
            "B": "崁頂、馬頭山",
            "C": "東澳、烏石鼻",
            "D": "大坪頂、松柏崙",
        },
    },
    20: {
        "stem": "地球上有袋類動物起源於北美洲，目前主要分布在澳洲，另外南美洲亦有少數分布，其棲地廣闊。關於澳洲有袋類物種遷移路線之一，學界有不同觀點，有的主張：早期地球有兩塊大陸，其中之一為岡瓦納大陸，有袋類在該大陸內部遷移，等到該大陸分裂成現今的數個大洲後，由於澳洲地理位置的特性，才使它成為絕大多數有袋類分布區。至於在亞洲、非洲發現的有袋類化石，則與歐洲的物種關係較為密切，與澳洲有袋化石關係較遠。圖 3 為岡瓦納大陸復原圖，圖中哪條物種遷移路線，最符合上述學界的觀點？",
        "options": {"A": "甲", "B": "乙", "C": "丙", "D": "丁"},
    },
    29: {
        "stem": "表 3 的甲、乙、丙、丁四個國家，最可能分別位在下圖中的何處？",
        "options": {"A": "圖示 A", "B": "圖示 B", "C": "圖示 C", "D": "圖示 D"},
    },
    36: {
        "stem": "依題文，此農民抗議起因於政府農產品政策對農民經濟福祉的影響。假設圖 5 為國內農產品市場供需的兩種情形，請判斷前述情境適用甲圖或乙圖，並從經濟福祉的角度分析可能的影響為何？",
        "options": {
            "A": "適用甲圖，開放進口後，消費者剩餘會增加",
            "B": "適用甲圖，開放進口後，生產者剩餘會減少",
            "C": "適用乙圖，開放進口後，消費者剩餘會減少",
            "D": "適用乙圖，開放進口後，生產者剩餘會減少",
        },
    },
    54: {
        "stem": "圖 7 是四個島嶼的位置圖。題文中「加勒比海的某島西部」最可能位於圖中的哪個島嶼？",
        "options": {"A": "甲", "B": "乙", "C": "丙", "D": "丁"},
    },
}

MANUAL_CONSTRUCTED = {
    53: "在答題卷中標示出土耳其的國家位置（1 分），並寫出該國反對黨若要阻絕俄羅斯海運，從地理位置層面可提出的具體做法（1 分），以及此舉將使俄羅斯對外交通所帶來的具體影響（2 分）。",
}

QUESTION_TAIL_MARKERS = {
    6: "表1",
    17: "照片1",
    19: "圖3",
    52: "俄羅斯\n\n烏克蘭",
}

STEM_TAIL_MARKERS = {
    8: "工匠或店主的孩子",
    9: "表2",
    38: "重要政治體制問題",
    40: "區位優勢條件",
    43: "資料名稱",
    46: "受限制的公民權",
    49: "分析之理由",
    50: "措施或政策",
    57: "最適合之解釋",
    60: "學校",
    64: "說明",
}

GROUP_TAIL_MARKERS = {
    "G29": "表3",
    "G31": "表4",
    "G36": "圖5",
    "G39": "表5",
    "G54": "圖7",
}

GROUP_PASSAGE_OVERRIDES = {
    "G27": (
        "大英博物館收藏一件銀製的胡椒罐（照片 2），屬於四世紀某個富有的羅馬家庭所有。"
        "這個罐子的高度約 10 公分，外觀像是一位羅馬主婦的半身雕像，設計精巧。"
        "圖 4 是四條貿易路線示意圖。請問："
    ),
    "G29": (
        "某生分別從東歐、西歐、南歐、北歐各地區挑選一個國家，蒐集相關資料，"
        "進行某項主題的探究。表 3 是 2022 年這些國家的三項經濟發展資料。"
        "已知 2022 年歐盟平均每人國內生產毛額為 37,150 美元。請問："
    ),
    "G31": (
        "某年 9 月 21 日夜晚，臺灣某河川上游降下大雨。表 4 是 9 月 22 日 15:00"
        "該河川沿岸各觀測站測量的水位資料，以及降水之後最高水位的發生日期與時間。請問："
    ),
    "G51": (
        "土耳其領土橫跨歐、亞兩大陸，被稱為文明的十字路口，五千年來歷經波斯、希臘、"
        "羅馬、拜占庭、鄂圖曼和土耳其共和國等治理。土耳其始終擺盪於西方（歐洲）與"
        "東方（西亞）之間，雖於 1952 年加入北大西洋公約組織，但近年來幾經爭取，迄今"
        "仍未成為歐盟會員國。2017 年土耳其通過修憲公投，將憲政體制由議會內閣制改為"
        "總統制，總統由普選產生且擁有更大行政權，由總統組成政府並任免各部會首長。"
        "俄烏戰爭期間，多國對俄羅斯實施經濟制裁，禁止俄國石油、天然氣等能源進口。"
        "圖 6 是俄羅斯、烏克蘭位置圖。土耳其反對黨提出封鎖俄羅斯交通線的制裁方案，"
        "但執政黨基於能源高度依賴俄國，表明不加入制裁。請問："
    ),
}


def clean_text(text: str) -> str:
    text = text.replace("\f", "\n").replace("\u2028", "\n").replace("\u2029", "\n")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def parse_options(block: str) -> tuple[str, dict[str, str]]:
    markers = list(re.finditer(r"\(([A-D])\)", block))
    sequence = [marker.group(1) for marker in markers[:4]]
    if sequence != ["A", "B", "C", "D"]:
        raise ValueError(f"Expected A-D option markers, got {sequence}")
    stem = clean_text(block[: markers[0].start()])
    options: dict[str, str] = {}
    for index, marker in enumerate(markers[:4]):
        end = markers[index + 1].start() if index < 3 else len(block)
        options[marker.group(1)] = clean_text(block[marker.end() : end])
    return stem, options


def main() -> None:
    raw = TEXT.read_text(encoding="utf-8")
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))["questions"]
    classifications = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    explanations = json.loads(EXPLANATIONS.read_text(encoding="utf-8"))

    question_matches = {}
    for match in re.finditer(r"(?m)^(\d{1,2})\.(?!\d)\s*", raw):
        number = int(match.group(1))
        if 1 <= number <= QUESTION_COUNT:
            question_matches.setdefault(number, match)
    missing = sorted(set(range(1, QUESTION_COUNT + 1)) - set(question_matches))
    if missing != [7, 18, 20, 36, 53, 54]:
        raise ValueError(f"Unexpected DOCX question-boundary gaps: {missing}")

    group_matches = list(re.finditer(r"(?m)^(\d+)-(\d+)為題組\s*$", raw))
    groups: dict[str, dict[str, str]] = {}
    group_ranges: list[tuple[int, int, str]] = []
    for match in group_matches:
        start_number, end_number = int(match.group(1)), int(match.group(2))
        group_id = f"G{start_number}"
        if group_id in GROUP_PASSAGE_OVERRIDES:
            passage = GROUP_PASSAGE_OVERRIDES[group_id]
        else:
            next_candidates = [
                candidate.start()
                for candidate in question_matches.values()
                if candidate.start() > match.end()
            ]
            next_start = min(next_candidates)
            passage = raw[match.end() : next_start]
            if group_id in GROUP_TAIL_MARKERS:
                passage = passage.split(GROUP_TAIL_MARKERS[group_id], 1)[0]
            passage = clean_text(passage)
        groups[group_id] = {
            "title": f"第 {start_number}–{end_number} 題題組",
            "passage": passage,
        }
        if group_id in GROUP_IMAGES:
            groups[group_id]["image"] = GROUP_IMAGES[group_id]
        group_ranges.append((start_number, end_number, group_id))

    boundaries = sorted(
        [(match.start(), "question", number) for number, match in question_matches.items()]
        + [(match.start(), "group", None) for match in group_matches]
    )

    def source_block(number: int) -> str:
        match = question_matches[number]
        end = len(raw)
        for position, _, _ in boundaries:
            if position > match.start():
                end = position
                break
        block = raw[match.end() : end]
        if number in QUESTION_TAIL_MARKERS:
            block = block.split(QUESTION_TAIL_MARKERS[number], 1)[0]
        return block

    questions = []
    for number in range(1, QUESTION_COUNT + 1):
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
        for start_number, end_number, group_id in group_ranges:
            if start_number <= number <= end_number:
                item["group"] = group_id
                break

        if number in CONSTRUCTED_SCORES:
            if number in MANUAL_CONSTRUCTED:
                stem = MANUAL_CONSTRUCTED[number]
            else:
                stem = clean_text(source_block(number))
                if number in STEM_TAIL_MARKERS:
                    stem = stem.split(STEM_TAIL_MARKERS[number], 1)[0].strip()
            item.update(
                {
                    "type": "constructed",
                    "stem": stem,
                    "maxScore": CONSTRUCTED_SCORES[number],
                    "officialRubric": official["officialRubric"],
                }
            )
        else:
            if number in MANUAL_SELECTED:
                stem = MANUAL_SELECTED[number]["stem"]
                options = MANUAL_SELECTED[number]["options"]
            else:
                try:
                    stem, options = parse_options(source_block(number))
                except ValueError as error:
                    raise ValueError(f"Question {number}: {error}") from error
                if number in STEM_TAIL_MARKERS:
                    stem = stem.split(STEM_TAIL_MARKERS[number], 1)[0].strip()
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
        "year": 113,
        "era": "學測",
        "durationMinutes": 110,
        "groups": groups,
        "questions": questions,
    }
    javascript = (
        "// 113 學測社會：由官方 PDF、DOCX、答案、評分原則與統計資料驗證。\n"
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
