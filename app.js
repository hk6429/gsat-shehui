const banks = Array.isArray(window.BANK) ? window.BANK : [];
const disciplineLabels = {
  history: "歷史",
  geography: "地理",
  civics: "公民與社會",
  integrated: "跨科整合",
};
const objectiveLabels = {
  H1: "H1 變遷與延續",
  H2: "H2 時空關聯",
  H3: "H3 資料分析",
  H4: "H4 歷史解釋",
  H5: "H5 當代與過去",
  H6: "H6 事實與解釋",
  H7: "H7 證據適切性",
  H8: "H8 解釋觀點",
  H9: "H9 歷史反思",
  G1: "G1 地理概念",
  G2: "G2 原理內涵",
  G3: "G3 地表現象",
  G4: "G4 系統分析",
  G5: "G5 現象解析",
  G6: "G6 空間資料",
  G7: "G7 議題探討",
  G8: "G8 整合評價",
  G9: "G9 反思策略",
  C1: "C1 社會現象",
  C2: "C2 核心概念",
  C3: "C3 現象解釋",
  C4: "C4 觀點區辨",
  C5: "C5 問題界定",
  C6: "C6 反思評論",
  C7: "C7 主張論證",
  S1: "S1 跨科詮釋",
  S2: "S2 跨科反思",
  S3: "S3 議題分析",
  S4: "S4 資料評估",
  S5: "S5 探究策略",
};
const $ = (id) => document.getElementById(id);
const wrongBookKey = "gsatShehuiWrongBook";
let currentQuestions = [];
let answered = 0;
let correct = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeRead(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function questionId(question) {
  return `${question.year}-${question.no}`;
}

function allQuestions() {
  return banks.flatMap((bank) =>
    bank.questions.map((question) => ({
      ...question,
      year: bank.year,
      era: bank.era,
      groupData: question.group ? bank.groups[question.group] : null,
    })),
  );
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function inDifficulty(question, value) {
  if (value === "all") return true;
  if (typeof question.pass !== "number") return false;
  if (value === "easy") return question.pass >= 0.7;
  if (value === "medium") return question.pass >= 0.4 && question.pass < 0.7;
  return question.pass < 0.4;
}

function filteredQuestions() {
  const year = $("yearSelect").value;
  const discipline = $("disciplineSelect").value;
  const objective = $("objectiveSelect").value;
  const type = $("typeSelect").value;
  const difficulty = $("difficultySelect").value;
  return allQuestions().filter(
    (question) =>
      (year === "all" || String(question.year) === year) &&
      (discipline === "all" || question.discipline === discipline) &&
      (objective === "all" || question.objective === objective) &&
      (type === "all" || question.type === type) &&
      inDifficulty(question, difficulty),
  );
}

function updateObjectives() {
  const discipline = $("disciplineSelect").value;
  const previous = $("objectiveSelect").value;
  const objectives = [
    ...new Set(
      allQuestions()
        .filter((question) => discipline === "all" || question.discipline === discipline)
        .map((question) => question.objective),
    ),
  ].sort();
  $("objectiveSelect").innerHTML =
    '<option value="all">全部能力目標</option>' +
    objectives
      .map(
        (objective) =>
          `<option value="${objective}">${escapeHtml(objectiveLabels[objective] ?? objective)}</option>`,
      )
      .join("");
  if (objectives.includes(previous)) $("objectiveSelect").value = previous;
}

function updateSummary() {
  const matches = filteredQuestions();
  $("filterSummary").textContent = `目前條件可選 ${matches.length} 題；將隨機抽出最多 ${Math.min(
    Number($("countInput").value) || 10,
    matches.length,
  )} 題。`;
  $("startBtn").disabled = matches.length === 0;
}

function renderGroup(question) {
  if (!question.groupData) return "";
  const group = question.groupData;
  return `
    <section class="group-material">
      <h3>${escapeHtml(group.title)}</h3>
      <p>${escapeHtml(group.passage)}</p>
      ${group.image ? `<img class="group-image" src="${escapeHtml(group.image)}" alt="${escapeHtml(group.title)}附圖">` : ""}
    </section>`;
}

function renderMaterial(question) {
  return question.materialHtml
    ? `<div class="material">${question.materialHtml}</div>`
    : "";
}

function renderTags(question) {
  return [
    `<span class="tag ${question.discipline}">${escapeHtml(disciplineLabels[question.discipline])}</span>`,
    `<span class="tag">${escapeHtml(objectiveLabels[question.objective] ?? question.objective)}</span>`,
    ...question.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`),
    `<span class="tag">${question.type === "constructed" ? "非選擇題" : "單選題"}</span>`,
  ].join("");
}

function optionAnalysisTable(question) {
  if (!question.optionStats) return "";
  const rows = [
    ["全體", question.optionStats.T],
    ["高分組", question.optionStats.H],
    ["低分組", question.optionStats.L],
  ];
  return `
    <table class="analysis-table">
      <thead><tr><th>組別</th><th>未答</th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
      <tbody>${rows
        .map(
          ([label, values]) =>
            `<tr><th>${label}</th><td>${values["未答"]}%</td><td>${values.A}%</td><td>${values.B}%</td><td>${values.C}%</td><td>${values.D}%</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;
}

function selectedQuestionHtml(question, index) {
  return `
    <article class="question-card" data-index="${index}">
      <div class="question-meta">${renderTags(question)}</div>
      ${renderGroup(question)}
      <p class="question-stem"><b>${question.year}－${question.no}.</b> ${escapeHtml(question.stem)}</p>
      ${renderMaterial(question)}
      ${question.image ? `<img class="question-image" src="${escapeHtml(question.image)}" alt="第 ${question.no} 題附圖">` : ""}
      <div class="options" role="group" aria-label="第 ${question.no} 題選項">
        ${Object.entries(question.options)
          .map(
            ([key, value]) =>
              `<button class="option" type="button" data-key="${key}"><b>(${key})</b><span>${escapeHtml(value)}</span></button>`,
          )
          .join("")}
      </div>
      <div class="feedback" hidden aria-live="polite"></div>
      <details class="official-stats">
        <summary>查看官方統計</summary>
        <div class="stat-grid">
          <div><b>答對率</b><br>${Math.round(question.pass * 100)}%</div>
          <div><b>鑑別度</b><br>${question.disc}</div>
        </div>
        ${optionAnalysisTable(question)}
      </details>
      ${question.sourceReview === "pending" ? '<p class="source-warning">此題仍在逐字原卷覆核佇列，尚未進入正式版。</p>' : ""}
    </article>`;
}

function constructedQuestionHtml(question, index) {
  return `
    <article class="question-card" data-index="${index}">
      <div class="question-meta">${renderTags(question)}</div>
      ${renderGroup(question)}
      <p class="question-stem"><b>${question.year}－${question.no}.</b> ${escapeHtml(question.stem)}</p>
      ${question.image ? `<img class="question-image" src="${escapeHtml(question.image)}" alt="第 ${question.no} 題附圖">` : ""}
      <div class="constructed-box">
        <label>我的作答
          <textarea placeholder="先寫下自己的答案，再打開官方評分原則核對。"></textarea>
        </label>
        <button class="button secondary reveal-rubric" type="button">查看官方滿分答案與評分原則</button>
        <div class="rubric" hidden></div>
      </div>
      ${question.sourceReview === "pending" ? '<p class="source-warning">此題仍在逐字原卷覆核佇列，尚未進入正式版。</p>' : ""}
    </article>`;
}

function updateScore() {
  $("sessionScore").textContent = answered
    ? `選擇題已答 ${answered} 題，答對 ${correct} 題`
    : "尚未作答";
}

function bindQuestionEvents() {
  document.querySelectorAll(".question-card").forEach((card) => {
    const question = currentQuestions[Number(card.dataset.index)];
    if (question.type === "constructed") {
      const button = card.querySelector(".reveal-rubric");
      button.addEventListener("click", () => {
        const rubric = card.querySelector(".rubric");
        rubric.textContent = `本題滿分 ${question.maxScore} 分\n\n${question.officialRubric}`;
        rubric.hidden = false;
        button.disabled = true;
        $("announcer").textContent = `已展開第 ${question.no} 題官方評分原則`;
      });
      return;
    }

    card.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", () => {
        if (card.dataset.answered === "true") return;
        card.dataset.answered = "true";
        const chosen = button.dataset.key;
        const isCorrect = chosen === question.answer;
        card.querySelectorAll(".option").forEach((option) => {
          option.disabled = true;
          if (option.dataset.key === question.answer) option.classList.add("correct");
        });
        if (!isCorrect) button.classList.add("wrong");
        const feedback = card.querySelector(".feedback");
        feedback.hidden = false;
        feedback.classList.add(isCorrect ? "correct" : "wrong");
        const resultText = isCorrect
          ? `✓ 答對了。正確答案是 ${question.answer}。`
          : `✗ 這題選了 ${chosen}，正確答案是 ${question.answer}。`;
        feedback.innerHTML = `${resultText}<p class="explanation"><b>解析：</b>${escapeHtml(question.explain)}</p>`;
        answered += 1;
        if (isCorrect) correct += 1;
        const wrongBook = safeRead(wrongBookKey, {});
        const id = questionId(question);
        if (isCorrect) delete wrongBook[id];
        else wrongBook[id] = { year: question.year, no: question.no, seenAt: Date.now() };
        safeWrite(wrongBookKey, wrongBook);
        updateScore();
        $("announcer").textContent = isCorrect
          ? `第 ${question.no} 題答對`
          : `第 ${question.no} 題答錯，正確答案 ${question.answer}`;
      });
    });
  });
}

function startSession(questions) {
  currentQuestions = questions;
  answered = 0;
  correct = 0;
  $("questionList").innerHTML = questions
    .map((question, index) =>
      question.type === "constructed"
        ? constructedQuestionHtml(question, index)
        : selectedQuestionHtml(question, index),
    )
    .join("");
  $("session").hidden = false;
  updateScore();
  bindQuestionEvents();
  $("session").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startFiltered() {
  const matches = filteredQuestions();
  const count = Math.max(1, Number($("countInput").value) || 10);
  startSession(shuffled(matches).slice(0, count));
}

function startWrongBook() {
  const wrongBook = safeRead(wrongBookKey, {});
  const ids = new Set(Object.keys(wrongBook));
  const matches = allQuestions().filter(
    (question) => question.type === "single" && ids.has(questionId(question)),
  );
  if (!matches.length) {
    $("announcer").textContent = "錯題本目前沒有題目";
    window.alert("錯題本目前是空的。先做幾題，答錯的題目會自動收進來。");
    return;
  }
  startSession(shuffled(matches));
}

function init() {
  if (!banks.length) {
    $("filterSummary").textContent = "題庫載入失敗，請重新整理頁面。";
    return;
  }
  const questions = allQuestions();
  const selected = questions.filter((question) => question.type === "single").length;
  const constructed = questions.length - selected;
  $("totalStat").textContent = questions.length;
  $("selectedStat").textContent = selected;
  $("constructedStat").textContent = constructed;
  $("groupStat").textContent = banks.reduce(
    (total, bank) => total + Object.keys(bank.groups).length,
    0,
  );
  $("draftNotice").hidden = !questions.some(
    (question) => question.sourceReview === "pending",
  );
  const years = [...new Set(banks.map((bank) => bank.year))].sort((a, b) => b - a);
  $("yearSelect").innerHTML =
    '<option value="all">全部年份</option>' +
    years.map((year) => `<option value="${year}">${year} 學年度</option>`).join("");
  updateObjectives();
  updateSummary();
}

$("disciplineSelect").addEventListener("change", () => {
  updateObjectives();
  updateSummary();
});
for (const id of [
  "yearSelect",
  "objectiveSelect",
  "typeSelect",
  "difficultySelect",
  "countInput",
]) {
  $(id).addEventListener("change", updateSummary);
  $(id).addEventListener("input", updateSummary);
}
$("startBtn").addEventListener("click", startFiltered);
$("quickBtn").addEventListener("click", () => {
  $("yearSelect").value = "all";
  $("disciplineSelect").value = "all";
  $("typeSelect").value = "single";
  $("difficultySelect").value = "all";
  $("countInput").value = "10";
  updateObjectives();
  $("objectiveSelect").value = "all";
  startFiltered();
});
$("wrongBtn").addEventListener("click", startWrongBook);
$("resetBtn").addEventListener("click", () => {
  $("session").hidden = true;
  $("questionList").innerHTML = "";
  currentQuestions = [];
  answered = 0;
  correct = 0;
});

init();
