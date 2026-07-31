import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixes = {
  "90-17-D": "澳門",
  "91-8-D": "局部地殼陷落",
  "91-19-A": "日本政府設立公學校，使台灣人可以接受小學教育",
  "91-19-B": "日本政府鼓勵台灣人接受高等教育，增加台灣人學習日語意願",
  "91-19-C": "1935 年起日本在台灣實施有限度的地方自治選舉，增加台灣人學習日語的意願",
  "91-19-D": "日本政府在二次大戰期間推行「皇民化」運動",
  "91-35-A": "自由是以不侵犯他人的自由為前提",
  "93-33-C": "乙、戊",
  "94-20-D": "鐵路港口的興建",
  "95-58-B": "古巴",
  "96-57-C": "勞動人口負擔加重",
  "96-61-C": "該國的中下階層缺乏受教育機會",
  "97-1-D": "甲丁",
  "97-12-D": "丁",
  "97-44-B": "洋流性質",
  "97-54-D": "丙、丁、戊",
  "97-58-B": "媒體是政府政策宣導的重要管道",
  "98-3-D": "1980 年後死亡率上升與老年人口增加有關",
  "98-70-D": "淋溶作用強烈，表層有薄層的有機質，其下土層呈灰白色",
  "98-71-B": "中部區域",
  "102-55-C": "區位慣性",
  "103-21-A": "生產第十單位香蕉的機會成本高於生產其他單位香蕉之水準",
  "103-42-A": "伊比利半島",
  "103-53-D": "丁",
  "103-61-D": "亞洲太平洋經濟合作會議（APEC）",
  "104-51-C": "乙丙",
  "104-65-B": "乙",
  "105-60-D": "河岸崩塌阻塞的堰塞湖",
  "107-15-C": "選前由單一政黨長期掌控行政權力",
  "109-18-C": "伊斯蘭教",
  "109-29-B": "美國國內的經濟不景氣，關切蘇聯的經濟發展",
  "111-46-D": "從阿拉伯半島向東北經過伊朗高原擴散而來",
  "112-15-D": "英國招募自治領與殖民地的軍隊，共同參與第二次世界大戰",
  "112-45-D": "申請保留地的權利",
  "113-35-D": "L 衛星，重返週期 16 天，解析度 30 公尺",
  "113-37-D": "集會遊行為人民重要憲法權利，即使動員戡亂時期檢警亦不得限制之",
};

const applied = [];
for (const sourcePath of fs
  .readdirSync(path.join(root, "data"))
  .filter((name) => /^g\d{2,3}\.js$/.test(name))
  .map((name) => path.join(root, "data", name))
  .sort()) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const bank = JSON.parse(
    source.split("window.BANK.push(", 2)[1].replace(/\);\s*$/, ""),
  );
  let changed = false;
  for (const question of bank.questions) {
    for (const key of Object.keys(question.options ?? {})) {
      const id = `${bank.year}-${question.no}-${key}`;
      if (!(id in fixes)) continue;
      question.options[key] = fixes[id];
      applied.push(id);
      changed = true;
    }
  }
  if (!changed) continue;
  const rendered =
    `// ${bank.year} 學測社會：由官方試題、答案、評分原則與統計資料驗證。\n` +
    "window.BANK = window.BANK || [];\n" +
    `window.BANK.push(${JSON.stringify(bank, null, 2)});\n`;
  fs.writeFileSync(sourcePath, rendered);
}

const missing = Object.keys(fixes).filter((id) => !applied.includes(id));
if (missing.length) {
  throw new Error(`未找到待修正選項：${missing.join(", ")}`);
}
console.log(JSON.stringify({ corrected: applied.length, ids: applied }, null, 2));
