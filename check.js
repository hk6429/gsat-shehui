import { bindReportForm, reportFormHtml } from "./report-client.js";

const $ = (id) => document.getElementById(id);
const disciplineLabels = {
  history: "歷史",
  geography: "地理",
  civics: "公民與社會",
  integrated: "跨科整合",
};
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function parseQuery(value) {
  const numbers = value.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length === 1) return { year: 115, no: numbers[0] };
  if (numbers.length >= 2) return { year: numbers[0], no: numbers[1] };
  return null;
}

function render() {
  const parsed = parseQuery($("queryInput").value);
  if (!parsed) {
    $("result").innerHTML = '<div class="notice">請輸入「年份-題號」，例如 115-49。</div>';
    return;
  }
  const bank = (window.BANK ?? []).find((item) => item.year === parsed.year);
  const question = bank?.questions.find((item) => item.no === parsed.no);
  if (!bank || !question) {
    $("result").innerHTML = `<div class="notice">目前找不到 ${escapeHtml(parsed.year)}－${escapeHtml(parsed.no)}。</div>`;
    return;
  }
  const group = question.group ? bank.groups[question.group] : null;
  const groupHtml = group
    ? `<section class="group-material"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.passage)}</p>${group.image ? `<img class="group-image" src="${escapeHtml(group.image)}" alt="${escapeHtml(group.title)}附圖">` : ""}</section>`
    : "";
  const answerHtml =
    question.type === "single"
      ? `<div class="options">${Object.entries(question.options)
          .map(
            ([key, value]) =>
              `<div class="option ${key === question.answer ? "correct" : ""}"><b>(${key})</b><span>${escapeHtml(value)}</span></div>`,
          )
          .join("")}</div><div class="feedback correct">官方答案：${question.answer}　答對率：${Math.round(question.pass * 100)}%　鑑別度：${question.disc}<p class="explanation"><b>解析：</b>${escapeHtml(question.explain)}</p></div>`
      : `<div class="rubric"><b>本題滿分 ${question.maxScore} 分</b>\n\n${escapeHtml(question.officialRubric)}</div>`;
  $("result").innerHTML = `
    <article class="question-card">
      <div class="question-meta"><span class="tag ${question.discipline}">${escapeHtml(disciplineLabels[question.discipline])}</span><span class="tag">${escapeHtml(question.objective)}</span>${question.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      ${groupHtml}
      <p class="question-stem"><b>${bank.year}－${question.no}.</b> ${escapeHtml(question.stem)}</p>
      ${question.materialHtml ? `<div class="material">${question.materialHtml}</div>` : ""}
      ${question.image ? `<img class="question-image" src="${escapeHtml(question.image)}" alt="第 ${question.no} 題附圖">` : ""}
      ${answerHtml}
      ${question.sourceReview === "pending" ? '<p class="source-warning">尚未完成逐字原卷覆核，不得視為正式版。</p>' : ""}
      ${reportFormHtml()}
    </article>`;
  const card = $("result").querySelector(".question-card");
  bindReportForm(card, () => ({
    questionId: `${bank.year}-${question.no}`,
    year: bank.year,
    era: bank.era || "學測",
    no: question.no,
    discipline: disciplineLabels[question.discipline],
    objective: question.objective,
    tags: (question.tags || []).join("、"),
    type: question.type === "constructed" ? "非選擇題" : question.type === "multiple" ? "複選題" : "單選題",
    stem: question.stem,
    context: [group?.title, group?.passage, card.querySelector(".material")?.innerText].filter(Boolean).join("\n"),
    options: Object.entries(question.options || {}).map(([key, value]) => `(${key}) ${value}`).join("\n"),
    answer: question.type === "constructed" ? question.officialAnswer || "請見評分原則" : question.answer,
    explain: question.type === "constructed" ? question.officialRubric : question.explain,
      image: (question.image || group?.image)
        ? new URL(question.image || group.image, window.location.href).href
        : "",
    url: window.location.href,
    device: navigator.userAgent,
  }), window.location);
}

$("queryBtn").addEventListener("click", render);
$("queryInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") render();
});
