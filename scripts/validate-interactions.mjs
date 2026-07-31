import fs from "node:fs";
import { JSDOM } from "jsdom";
import { bindReportForm, reportFormHtml } from "../report-client.js";

const root = new URL("../", import.meta.url);
const html = fs.readFileSync(new URL("index.html", root), "utf8");
const bankSource = fs.readFileSync(new URL("data/bank.js", root), "utf8");
const appSource = fs.readFileSync(new URL("app.js", root), "utf8");

const dom = new JSDOM(html, {
  url: "https://gsat-shehui.test/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
let printed = false;

window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
window.HTMLElement.prototype.scrollIntoView = () => {};
window.alert = () => {};
window.confirm = () => true;
window.print = () => {
  printed = true;
};
window.URL.createObjectURL = () => "blob:records";
window.URL.revokeObjectURL = () => {};
window.__REPORT_CLIENT__ = { bindReportForm, reportFormHtml };

window.eval(bankSource);
window.eval(appSource.replace(
  'import { bindReportForm, reportFormHtml } from "./report-client.js";',
  "const { bindReportForm, reportFormHtml } = window.__REPORT_CLIENT__;",
));

const $ = (id) => window.document.getElementById(id);
const click = (element) =>
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const change = (element) =>
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const chooseMainYears = (...values) => {
  const wanted = new Set(values.map(String));
  $("mainYearAll").checked = wanted.size === 0;
  const checkboxes = [...window.document.querySelectorAll(".main-year-checkbox")];
  checkboxes.forEach((checkbox) => {
    checkbox.checked = wanted.has(checkbox.value);
  });
  change(wanted.size ? checkboxes.find((checkbox) => checkbox.checked) : $("mainYearAll"));
};
const chooseDisciplines = (...values) => {
  const wanted = new Set(values);
  $("disciplineAll").checked = wanted.size === 0;
  const checkboxes = [...window.document.querySelectorAll(".discipline-checkbox")];
  checkboxes.forEach((checkbox) => { checkbox.checked = wanted.has(checkbox.value); });
  change(wanted.size ? checkboxes.find((checkbox) => checkbox.checked) : $("disciplineAll"));
};

// 首頁須直接呈現完整練習設定，不把鑑別度與教師功能藏在摺疊區。
assert(!$("filterBody").hidden, "首頁未預設展開完整篩選");
assert(
  $("discriminationSelect").options.length === 4,
  "首頁鑑別度篩選選項不完整",
);
assert(!$("moreRow").hidden, "首頁未預設顯示整回模考與出卷功能");

// 學科與課綱主題皆可複選，主題以聯集方式納入符合任一標籤的題目。
chooseDisciplines("history", "geography");
assert(!$("disciplineAll").checked, "學科複選未取消全部學科");
const taiwanHistory = [...window.document.querySelectorAll(".topic-checkbox")].find(
  (checkbox) => checkbox.dataset.label === "臺灣史" && checkbox.value.startsWith("history"),
);
const naturalGeography = [...window.document.querySelectorAll(".topic-checkbox")].find(
  (checkbox) => checkbox.dataset.label === "自然地理" && checkbox.value.startsWith("geography"),
);
assert(taiwanHistory && naturalGeography, "課綱主題缺少跨學科大分類");
const firstMinorToggle = window.document.querySelector(".topic-minor-toggle");
const firstMinorPanel = $(firstMinorToggle.getAttribute("aria-controls"));
assert(firstMinorPanel.hidden, "主題小標不應預設全部展開");
click(firstMinorToggle);
assert(!firstMinorPanel.hidden && firstMinorToggle.getAttribute("aria-expanded") === "true", "主題小標無法展開");
click(taiwanHistory);
click(naturalGeography);
const topicMatches = window.BANK.flatMap((bank) => bank.questions).filter(
  (question) =>
    question.type !== "constructed" &&
    ((question.discipline === "history" && question.tags.includes("臺灣史")) ||
      (question.discipline === "geography" && question.tags.includes("自然地理"))),
).length;
assert($("filterSummary").textContent.includes(`可選 ${topicMatches} 題`), "主題複選未採聯集篩選");
chooseDisciplines();
click($("topicAll"));

// 由易到難：即使同時勾著隨機，排序仍優先，且三題順序對應官方答對率。
$("countInput").value = "3";
$("difficultySortCheckbox").checked = true;
change($("difficultySortCheckbox"));
click($("startBtn"));
const expectedEasy = window.BANK.flatMap((bank) =>
  bank.questions
    .filter(
      (question) =>
        question.type !== "constructed" && typeof question.pass === "number",
    )
    .map((question) => ({ ...question, year: bank.year })),
)
  .sort((a, b) => b.pass - a.pass || b.year - a.year || a.no - b.no)
  .slice(0, 3)
  .map((question) => `${question.year}－${question.no}.`);
const renderedEasy = [...window.document.querySelectorAll(".question-stem b")].map(
  (node) => node.textContent,
);
assert(
  JSON.stringify(renderedEasy) === JSON.stringify(expectedEasy),
  "由易到難排序未依官方答對率生效",
);

// 計時練習：先選答案、不立即揭曉；交卷後才顯示解析並停止計時。
click($("resetBtn"));
$("difficultySortCheckbox").checked = false;
$("shuffleCheckbox").checked = false;
$("timedCheckbox").checked = true;
$("countInput").value = "2";
click($("startBtn"));
const timedCard = window.document.querySelector(".question-card");
click(timedCard.querySelector(".option"));
assert(timedCard.querySelector(".feedback").hidden, "計時模式作答後不應立即揭曉");
assert(!$("submitSessionBtn").hidden && !$("timerText").hidden, "計時模式缺少交卷或倒數");
click($("submitSessionBtn"));
assert(!timedCard.querySelector(".feedback").hidden, "計時模式交卷後未顯示結果");
const statsPanel = timedCard.querySelector(".option-stats");
assert(statsPanel, "作答後解析區未顯示官方選項畫記率");
assert(
  statsPanel.querySelectorAll('.option-stat-bar[role="progressbar"]').length === 4,
  "官方選項畫記率未以四個橫條呈現",
);
const lowStatsButton = statsPanel.querySelector('[data-stats-group="L"]');
assert(lowStatsButton, "官方選項畫記率缺少低分組切換");
click(lowStatsButton);
assert(
  lowStatsButton.getAttribute("aria-pressed") === "true" &&
    statsPanel.querySelector(".option-stats-title").textContent.startsWith("低分組"),
  "低分組選項畫記率切換失效",
);

// 90 年舊制複選題：可同時選取多個答案，確認後依官方答案 BDE 判分。
click($("resetBtn"));
chooseMainYears(90);
$("timedCheckbox").checked = false;
$("countInput").value = "80";
click($("startBtn"));
const multipleCard = [...window.document.querySelectorAll(".question-card")].find(
  (card) => card.querySelector(".question-stem b")?.textContent === "90－51.",
);
assert(multipleCard, "90 年第 51 題複選題未載入");
for (const key of ["B", "D", "E"]) {
  click(multipleCard.querySelector(`.option[data-key="${key}"]`));
}
click(multipleCard.querySelector(".confirm-multiple"));
assert(
  multipleCard.querySelector(".feedback").classList.contains("correct"),
  "90 年複選題未依官方 BDE 答案判分",
);

// 整回模考：指定 114 年後須載入完整 64 題，並使用 110 分鐘倒數。
click($("resetBtn"));
chooseMainYears(114);
click($("mockBtn"));
assert(
  window.document.querySelectorAll(".question-card").length === 64,
  "114 年整回模考未載入完整 64 題",
);
assert($("sessionTitle").textContent.includes("114 學年度整回模考"), "模考標題錯誤");
assert($("timerText").textContent.includes("110:00"), "整回模考倒數不是官方 110 分鐘");
click($("submitSessionBtn"));

// 未作答題會進第 1 盒並顯示今日複習入口。
assert(Number($("wrongCount").textContent) > 0, "交卷後錯題未加入錯題本");
assert(!$("reviewBtn").hidden, "有到期錯題時未顯示今日複習");

// 教師出卷：依目前 114 年條件列題、可全選並產生列印題卷與教師答案。
click($("paperBtn"));
const paperCheckboxes = window.document.querySelectorAll(".paper-question-checkbox");
assert(paperCheckboxes.length === 54, "教師出卷未依 114 年選擇題條件列出 54 題");
click($("paperSelectAllBtn"));
assert($("paperCount").textContent === "已選 54 題", "教師出卷全選計數錯誤");
click($("paperPrintBtn"));
assert(printed, "教師出卷未觸發列印");
assert($("paperPrintArea").textContent.includes("教師答案"), "列印內容缺少教師答案");

// 教師出卷年度可複選：同時勾選 113、114 年，只選出這兩年的題目。
click($("paperCloseBtn"));
chooseMainYears();
click($("paperBtn"));
const year113 = window.document.querySelector('.paper-year-checkbox[value="113"]');
const year114 = window.document.querySelector('.paper-year-checkbox[value="114"]');
assert(year113 && year114, "教師出卷缺少 113、114 年複選項目");
click(year113);
click(year114);
click($("paperQuickBtn"));
const selectedPaperYears = [
  ...window.document.querySelectorAll(".paper-question-checkbox:checked"),
].map((checkbox) => {
  const label = checkbox.closest("label");
  return Number(label.querySelector("b").textContent.split("－")[0]);
});
assert(selectedPaperYears.length > 54, "教師出卷年度複選沒有同時選入兩個年度");
assert(
  selectedPaperYears.every((year) => year === 113 || year === 114),
  "教師出卷年度複選混入未勾選年度",
);
assert(
  $("paperYearQuickSummary").textContent === "114、113 學年度",
  "教師出卷年度複選摘要錯誤",
);

dom.window.close();

console.log(
  JSON.stringify(
    {
      difficultySort: "VERIFIED",
      timedDeferredGrading: "VERIFIED",
      multipleChoice90: "BDE / VERIFIED",
      mockExam114: "64 questions / 110 minutes",
      dueReview: "VERIFIED",
      teacherPaper: "54 selected questions / answer key + multi-year filter",
      homepageControls: "expanded / discrimination + advanced actions visible",
      status: "VERIFIED",
    },
    null,
    2,
  ),
);
