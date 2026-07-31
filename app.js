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
const historyKey = "gsatShehuiHistory";
const fontSizeKey = "gsatShehuiFontSize";
const dayMilliseconds = 86_400_000;
const boxWaitDays = { 1: 1, 2: 3 };
let currentQuestions = [];
let answered = 0;
let correct = 0;
let sessionSaved = false;
let sessionMode = "practice";
let pendingAnswers = {};
let timerId = null;
let timeLeft = 0;
let paperQuestions = [];

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

function discriminationValue(question) {
  if (typeof question.disc !== "number") return null;
  return Math.abs(question.disc) > 1 ? question.disc / 100 : question.disc;
}

function inDiscrimination(question, value) {
  if (value === "all") return true;
  const discrimination = discriminationValue(question);
  if (discrimination === null) return false;
  if (value === "high") return discrimination >= 0.5;
  if (value === "medium") return discrimination >= 0.3 && discrimination < 0.5;
  return discrimination < 0.3;
}

function selectedMainYears() {
  if ($("mainYearAll").checked) return null;
  return new Set(
    [...document.querySelectorAll(".main-year-checkbox:checked")].map(
      (checkbox) => checkbox.value,
    ),
  );
}

function updateMainYearSummary() {
  const years = [...document.querySelectorAll(".main-year-checkbox:checked")]
    .map((checkbox) => Number(checkbox.value))
    .sort((a, b) => b - a);
  $("mainYearSummary").textContent =
    $("mainYearAll").checked || !years.length
      ? "全部年度"
      : years.length <= 4
        ? `${years.join("、")} 學年度`
        : `${years.slice(0, 3).join("、")} 等 ${years.length} 個年度`;
}

function resetMainYears() {
  $("mainYearAll").checked = true;
  document.querySelectorAll(".main-year-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateMainYearSummary();
}

function handleMainYearChange(event) {
  const all = $("mainYearAll");
  const years = [...document.querySelectorAll(".main-year-checkbox")];
  if (event.target === all && all.checked) {
    years.forEach((checkbox) => {
      checkbox.checked = false;
    });
  } else if (event.target.classList.contains("main-year-checkbox") && event.target.checked) {
    all.checked = false;
  }
  if (!all.checked && !years.some((checkbox) => checkbox.checked)) all.checked = true;
  updateMainYearSummary();
  updateSummary();
}

function selectedDisciplines() {
  if ($("disciplineAll").checked) return null;
  return new Set(
    [...document.querySelectorAll(".discipline-checkbox:checked")].map(
      (checkbox) => checkbox.value,
    ),
  );
}

function resetDisciplines() {
  $("disciplineAll").checked = true;
  document.querySelectorAll(".discipline-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function handleDisciplineChange(event) {
  const all = $("disciplineAll");
  const disciplines = [...document.querySelectorAll(".discipline-checkbox")];
  if (event.target === all && all.checked) {
    disciplines.forEach((checkbox) => { checkbox.checked = false; });
  } else if (event.target.classList.contains("discipline-checkbox") && event.target.checked) {
    all.checked = false;
  }
  if (!all.checked && !disciplines.some((checkbox) => checkbox.checked)) all.checked = true;
  updateTopicVisibility();
  updateObjectives();
  updateSummary();
}

function topicKey(discipline, tag) {
  return `${discipline}\u001f${tag}`;
}

function selectedTopics() {
  if ($("topicAll").checked) return null;
  return new Set(
    [...document.querySelectorAll(".topic-checkbox:checked")].map(
      (checkbox) => checkbox.value,
    ),
  );
}

function updateTopicSummary() {
  const selected = [...document.querySelectorAll(".topic-checkbox:checked")]
    .map((checkbox) => checkbox.dataset.label);
  $("topicSummary").textContent = $("topicAll").checked || !selected.length
    ? "全部主題"
    : selected.length <= 3
      ? selected.join("、")
      : `${selected.slice(0, 2).join("、")}等 ${selected.length} 個主題`;
}

function resetTopics() {
  $("topicAll").checked = true;
  document.querySelectorAll(".topic-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateTopicSummary();
}

function handleTopicChange(event) {
  const all = $("topicAll");
  const topics = [...document.querySelectorAll(".topic-checkbox")];
  if (event.target === all && all.checked) {
    topics.forEach((checkbox) => { checkbox.checked = false; });
  } else if (event.target.classList.contains("topic-checkbox") && event.target.checked) {
    all.checked = false;
  }
  if (!all.checked && !topics.some((checkbox) => checkbox.checked)) all.checked = true;
  updateTopicSummary();
  updateSummary();
}

function renderTopics() {
  const hierarchy = new Map();
  for (const question of allQuestions()) {
    if (!hierarchy.has(question.discipline)) hierarchy.set(question.discipline, new Map());
    const [major, ...minorTags] = question.tags || [];
    if (!major) continue;
    const majors = hierarchy.get(question.discipline);
    if (!majors.has(major)) majors.set(major, new Set());
    minorTags.forEach((tag) => majors.get(major).add(tag));
  }
  const order = ["history", "geography", "civics", "integrated"];
  $("topicOptions").innerHTML = `
    <label class="paper-year-all"><input id="topicAll" type="checkbox" value="all" checked> 全部主題</label>
    ${order.map((discipline) => {
      const majors = [...(hierarchy.get(discipline) || new Map())].sort(([a], [b]) => a.localeCompare(b, "zh-Hant"));
      return `<section class="topic-discipline" data-discipline="${discipline}">
        <h3><span>${disciplineLabels[discipline]}</span><small>${majors.length} 個大分類</small></h3>
        <div class="topic-major-list">
          ${majors.map(([major, minors], index) => {
            const minorId = `topic-minors-${discipline}-${index}`;
            return `<article class="topic-major">
              <div class="topic-major-head">
                <label><input class="topic-checkbox" type="checkbox" value="${escapeHtml(topicKey(discipline, major))}" data-label="${escapeHtml(major)}"> <b>${escapeHtml(major)}</b></label>
                ${minors.size ? `<button class="topic-minor-toggle" type="button" aria-expanded="false" aria-controls="${minorId}">展開 ${minors.size} 個小標 ▾</button>` : ""}
              </div>
              ${minors.size ? `<div class="topic-minors" id="${minorId}" hidden>${[...minors].sort((a, b) => a.localeCompare(b, "zh-Hant")).map((minor) => `<label><input class="topic-checkbox" type="checkbox" value="${escapeHtml(topicKey(discipline, minor))}" data-label="${escapeHtml(minor)}"> ${escapeHtml(minor)}</label>`).join("")}</div>` : ""}
            </article>`;
          }).join("")}
        </div>
      </section>`;
    }).join("")}`;
  updateTopicSummary();
}

function handleTopicToggle(event) {
  const button = event.target.closest(".topic-minor-toggle");
  if (!button) return;
  const minors = $(button.getAttribute("aria-controls"));
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  minors.hidden = !expanded;
  const count = minors.querySelectorAll(".topic-checkbox").length;
  button.textContent = expanded ? `收合 ${count} 個小標 ▴` : `展開 ${count} 個小標 ▾`;
}

function updateTopicVisibility() {
  const disciplines = selectedDisciplines();
  document.querySelectorAll(".topic-discipline").forEach((section) => {
    const visible = !disciplines || disciplines.has(section.dataset.discipline);
    section.hidden = !visible;
    if (!visible) {
      section.querySelectorAll(".topic-checkbox").forEach((checkbox) => {
        checkbox.checked = false;
      });
    }
  });
  if (![...document.querySelectorAll(".topic-checkbox")].some((checkbox) => checkbox.checked)) {
    $("topicAll").checked = true;
  }
  updateTopicSummary();
}

function filteredQuestions() {
  const years = selectedMainYears();
  const disciplines = selectedDisciplines();
  const topics = selectedTopics();
  const objective = $("objectiveSelect").value;
  const type = $("typeSelect").value;
  const difficulty = $("difficultySelect").value;
  const discrimination = $("discriminationSelect").value;
  return allQuestions().filter(
    (question) =>
      (!years || years.has(String(question.year))) &&
      (!disciplines || disciplines.has(question.discipline)) &&
      (!topics || (question.tags || []).some((tag) => topics.has(topicKey(question.discipline, tag)))) &&
      (objective === "all" || question.objective === objective) &&
      (
        type === "all" ||
        (type === "single"
          ? question.type !== "constructed"
          : question.type === "constructed")
      ) &&
      inDifficulty(question, difficulty) &&
      inDiscrimination(question, discrimination),
  );
}

function updateObjectives() {
  const disciplines = selectedDisciplines();
  const previous = $("objectiveSelect").value;
  const objectives = [
    ...new Set(
      allQuestions()
        .filter((question) => !disciplines || disciplines.has(question.discipline))
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
  const year = `年份 ${$("mainYearSummary").textContent}`;
  const selectedDisciplineValues = [...document.querySelectorAll(".discipline-checkbox:checked")]
    .map((checkbox) => disciplineLabels[checkbox.value]);
  const discipline = $("disciplineAll").checked
    ? "學科 全部"
    : `學科 ${selectedDisciplineValues.join("、")}`;
  const typeLabels = { single: "選擇題", constructed: "非選擇題", all: "全部題型" };
  const difficultyLabels = {
    all: "難度不限",
    easy: "較簡單",
    medium: "中等",
    hard: "較難",
  };
  const discriminationLabels = {
    all: "鑑別度不限",
    high: "高鑑別度",
    medium: "中鑑別度",
    low: "低鑑別度",
  };
  const count = Math.min(Number($("countInput").value) || 10, matches.length);
  const order = $("difficultySortCheckbox").checked
    ? "由易到難"
    : $("shuffleCheckbox").checked
      ? "隨機出題"
      : "依年份題號";
  const timing = $("timedCheckbox").checked ? "計時" : "不限時";
  $("filterSummary").textContent =
    `${year} ・ ${discipline} ・ 主題 ${$("topicSummary").textContent} ・ 每次 ${count} 題 ・ ${typeLabels[$("typeSelect").value]} ・ ` +
    `${difficultyLabels[$("difficultySelect").value]} ・ ` +
    `${discriminationLabels[$("discriminationSelect").value]} ・ ${order} ・ ${timing} ・ 可選 ${matches.length} 題`;
  $("startBtn").disabled = matches.length === 0;
}

function loadWrongBook() {
  const raw = safeRead(wrongBookKey, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([id, entry]) => [
      id,
      {
        year: entry.year,
        no: entry.no,
        box: entry.box || 1,
        streak: entry.streak || 0,
        wrong: entry.wrong || 1,
        lastSeen: entry.lastSeen || entry.seenAt || 0,
        due: entry.due || 0,
      },
    ]),
  );
}

function saveWrongBook(wrongBook) {
  safeWrite(wrongBookKey, wrongBook);
}

function dueWrongIds(wrongBook = loadWrongBook()) {
  const now = Date.now();
  return Object.keys(wrongBook).filter((id) => (wrongBook[id].due || 0) <= now);
}

function recordWrongBookResult(question, isCorrect) {
  const wrongBook = loadWrongBook();
  const id = questionId(question);
  const now = Date.now();
  if (!isCorrect) {
    const existing = wrongBook[id] || {};
    wrongBook[id] = {
      year: question.year,
      no: question.no,
      box: 1,
      streak: 0,
      wrong: (existing.wrong || 0) + 1,
      lastSeen: now,
      due: now,
    };
  } else if (wrongBook[id]) {
    const entry = wrongBook[id];
    const box = entry.box || 1;
    if (box >= 3) delete wrongBook[id];
    else {
      entry.box = box + 1;
      entry.streak = (entry.streak || 0) + 1;
      entry.lastSeen = now;
      entry.due = now + (boxWaitDays[box] || 1) * dayMilliseconds;
    }
  }
  saveWrongBook(wrongBook);
}

function updateWrongCount() {
  const wrongBook = loadWrongBook();
  const due = dueWrongIds(wrongBook).length;
  $("wrongCount").textContent = Object.keys(wrongBook).length;
  $("reviewBtn").hidden = due === 0;
  $("reviewBtn").querySelector("b").textContent = due;
}

function saveHistoryIfComplete() {
  const selectedCount = currentQuestions.filter(
    (question) => question.type !== "constructed",
  ).length;
  if (sessionSaved || !selectedCount || answered !== selectedCount) return;
  const history = safeRead(historyKey, []);
  history.push({
    completedAt: Date.now(),
    total: selectedCount,
    correct,
  });
  while (history.length > 30) history.shift();
  safeWrite(historyKey, history);
  sessionSaved = true;
}

function renderHistory() {
  const history = safeRead(historyKey, []).slice().reverse();
  $("historyList").innerHTML = history.length
    ? history
        .map((record) => {
          const percentage = Math.round((record.correct / record.total) * 100);
          const date = new Date(record.completedAt).toLocaleString("zh-TW", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `<div class="history-row"><span>${escapeHtml(date)}</span><span class="history-bar"><i style="width:${percentage}%"></i></span><strong>${record.correct}／${record.total}（${percentage}%）</strong></div>`;
        })
        .join("")
    : '<p class="history-empty">還沒有練習紀錄，先完成一回選擇題練習看看。</p>';
}

function renderGroup(question, index) {
  if (!question.groupData) return "";
  const groupAlreadyShown = currentQuestions
    .slice(0, index)
    .some(
      (previous) =>
        previous.year === question.year && previous.group === question.group,
    );
  if (groupAlreadyShown) return "";
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
  const typeLabel =
    question.type === "constructed"
      ? "非選擇題"
      : question.type === "multiple"
        ? "複選題"
        : "單選題";
  return [
    `<span class="tag ${question.discipline}">${escapeHtml(disciplineLabels[question.discipline])}</span>`,
    `<span class="tag">${escapeHtml(objectiveLabels[question.objective] ?? question.objective)}</span>`,
    ...question.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`),
    `<span class="tag">${typeLabel}</span>`,
  ].join("");
}

function optionAnalysisTable(question) {
  if (!question.optionStats) return "";
  const optionLabels = Object.keys(question.optionStats.T).filter(
    (label) => label !== "未答",
  );
  const rows = [
    ["全體", question.optionStats.T],
    ["高分組", question.optionStats.H],
    ["低分組", question.optionStats.L],
  ];
  return `
    <table class="analysis-table">
      <thead><tr><th>組別</th><th>未答</th>${optionLabels.map((label) => `<th>${label}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map(
          ([label, values]) =>
            `<tr><th>${label}</th><td>${values["未答"]}%</td>${optionLabels.map((option) => `<td>${values[option]}%</td>`).join("")}</tr>`,
        )
        .join("")}</tbody>
    </table>`;
}

function selectedQuestionHtml(question, index) {
  return `
    <article class="question-card" data-index="${index}">
      <div class="question-meta">${renderTags(question)}</div>
      ${renderGroup(question, index)}
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
      ${question.type === "multiple" ? '<button class="button secondary confirm-multiple" type="button">確認複選答案</button>' : ""}
      <div class="feedback" hidden aria-live="polite"></div>
      ${typeof question.pass === "number" ? `<details class="official-stats">
        <summary>查看官方統計</summary>
        <div class="stat-grid">
          <div><b>答對率</b><br>${Math.round(question.pass * 100)}%</div>
          <div><b>鑑別度</b><br>${question.disc}</div>
        </div>
        ${optionAnalysisTable(question)}
      </details>` : '<p class="source-warning">本年度大考中心未公布逐題答對率、鑑別度與選項分析。</p>'}
      ${question.sourceReview === "pending" ? '<p class="source-warning">此題仍在逐字原卷覆核佇列，尚未進入正式版。</p>' : ""}
    </article>`;
}

function constructedQuestionHtml(question, index) {
  return `
    <article class="question-card" data-index="${index}">
      <div class="question-meta">${renderTags(question)}</div>
      ${renderGroup(question, index)}
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

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function updateTimerText() {
  const minutes = Math.floor(Math.max(0, timeLeft) / 60);
  const seconds = Math.max(0, timeLeft) % 60;
  $("timerText").textContent =
    `剩餘時間 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startTimer(seconds) {
  stopTimer();
  timeLeft = seconds;
  $("timerText").hidden = false;
  updateTimerText();
  timerId = window.setInterval(() => {
    timeLeft -= 1;
    updateTimerText();
    if (timeLeft <= 0) {
      stopTimer();
      submitDeferredSession(true);
    }
  }, 1000);
}

function revealSelectedResult(card, question, chosen) {
  if (card.dataset.answered === "true") return;
  card.dataset.answered = "true";
  const accepted = question.acceptedAnswers ?? [question.answer];
  const isCorrect = accepted.includes(chosen);
  const officialAnswer = question.officialAnswerNote
    ? question.officialAnswerNote
    : `正確答案是 ${accepted.join(" 或 ")}。`;
  card.querySelectorAll(".option").forEach((option) => {
    option.disabled = true;
    option.classList.remove("selected");
    if (
      question.type === "multiple"
        ? question.answer.includes(option.dataset.key)
        : accepted.includes(option.dataset.key)
    ) {
      option.classList.add("correct");
    }
  });
  if (!isCorrect) {
    card.querySelectorAll(".option").forEach((option) => {
      if (chosen.includes(option.dataset.key)) option.classList.add("wrong");
    });
  }
  const feedback = card.querySelector(".feedback");
  feedback.hidden = false;
  feedback.classList.add(isCorrect ? "correct" : "wrong");
  const resultText = isCorrect
    ? `✓ 答對了。${officialAnswer}`
    : chosen
      ? `✗ 這題選了 ${chosen}，${officialAnswer}`
      : `✗ 本題未作答，${officialAnswer}`;
  feedback.innerHTML =
    `${resultText}<p class="explanation"><b>解析：</b>${escapeHtml(question.explain)}</p>`;
  answered += 1;
  if (isCorrect) correct += 1;
  recordWrongBookResult(question, isCorrect);
}

function submitDeferredSession(fromTimer = false) {
  if (!["timed", "mock"].includes(sessionMode) || $("submitSessionBtn").disabled) return;
  stopTimer();
  $("submitSessionBtn").disabled = true;
  currentQuestions.forEach((question, index) => {
    const card = document.querySelector(`.question-card[data-index="${index}"]`);
    if (question.type === "constructed") {
      const button = card.querySelector(".reveal-rubric");
      if (button) button.hidden = false;
      return;
    }
    revealSelectedResult(card, question, pendingAnswers[questionId(question)] || "");
  });
  updateWrongCount();
  updateScore();
  saveHistoryIfComplete();
  $("announcer").textContent = fromTimer ? "時間到，系統已自動交卷" : "交卷完成";
}

function bindQuestionEvents() {
  document.querySelectorAll(".question-card").forEach((card) => {
    const question = currentQuestions[Number(card.dataset.index)];
    if (question.type === "constructed") {
      const button = card.querySelector(".reveal-rubric");
      if (["timed", "mock"].includes(sessionMode)) button.hidden = true;
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
        const chosen = button.dataset.key;
        if (question.type === "multiple") {
          const id = questionId(question);
          const selected = new Set((pendingAnswers[id] || "").split("").filter(Boolean));
          if (selected.has(chosen)) selected.delete(chosen);
          else selected.add(chosen);
          pendingAnswers[id] = [...selected].sort().join("");
          card.querySelectorAll(".option").forEach((option) =>
            option.classList.toggle(
              "selected",
              pendingAnswers[id].includes(option.dataset.key),
            ),
          );
          $("announcer").textContent =
            `第 ${question.no} 題目前選擇 ${pendingAnswers[id] || "未作答"}`;
          return;
        }
        if (["timed", "mock"].includes(sessionMode)) {
          pendingAnswers[questionId(question)] = chosen;
          card.querySelectorAll(".option").forEach((option) =>
            option.classList.toggle("selected", option === button),
          );
          $("announcer").textContent = `第 ${question.no} 題已選 ${chosen}`;
          return;
        }
        revealSelectedResult(card, question, chosen);
        updateWrongCount();
        updateScore();
        saveHistoryIfComplete();
        $("announcer").textContent =
          (question.acceptedAnswers ?? [question.answer]).includes(chosen)
            ? `第 ${question.no} 題答對`
            : `第 ${question.no} 題答錯，正確答案 ${(question.acceptedAnswers ?? [question.answer]).join(" 或 ")}`;
      });
    });
    const confirmMultiple = card.querySelector(".confirm-multiple");
    if (confirmMultiple) {
      if (["timed", "mock"].includes(sessionMode)) {
        confirmMultiple.hidden = true;
      } else {
        confirmMultiple.addEventListener("click", () => {
          const chosen = pendingAnswers[questionId(question)] || "";
          revealSelectedResult(card, question, chosen);
          updateWrongCount();
          updateScore();
          saveHistoryIfComplete();
        });
      }
    }
  });
}

function startSession(questions, options = {}) {
  stopTimer();
  currentQuestions = questions;
  answered = 0;
  correct = 0;
  sessionSaved = false;
  sessionMode = options.mode || "practice";
  pendingAnswers = {};
  $("sessionTitle").textContent =
    sessionMode === "mock" ? `${questions[0]?.year ?? ""} 學年度整回模考` : "本次練習";
  $("submitSessionBtn").hidden = !["timed", "mock"].includes(sessionMode);
  $("submitSessionBtn").disabled = false;
  $("timerText").hidden = true;
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
  if (options.seconds) startTimer(options.seconds);
  $("session").scrollIntoView({ behavior: "smooth", block: "start" });
}

function orderedQuestions(matches) {
  if ($("difficultySortCheckbox").checked) {
    return [...matches].sort((a, b) => {
      const aPass = typeof a.pass === "number" ? a.pass : -1;
      const bPass = typeof b.pass === "number" ? b.pass : -1;
      return bPass - aPass || b.year - a.year || a.no - b.no;
    });
  }
  if ($("shuffleCheckbox").checked) return shuffled(matches);
  return [...matches].sort((a, b) => b.year - a.year || a.no - b.no);
}

function startFiltered() {
  const matches = filteredQuestions();
  const count = Math.max(1, Number($("countInput").value) || 10);
  const questions = orderedQuestions(matches).slice(0, count);
  const timed = $("timedCheckbox").checked;
  startSession(questions, {
    mode: timed ? "timed" : "practice",
    seconds: timed ? questions.length * 100 : 0,
  });
}

function startWrongBook(dueOnly = false) {
  const wrongBook = loadWrongBook();
  const ids = new Set(dueOnly ? dueWrongIds(wrongBook) : Object.keys(wrongBook));
  const matches = allQuestions().filter(
    (question) =>
      question.type !== "constructed" && ids.has(questionId(question)),
  );
  if (!matches.length) {
    const message = dueOnly
      ? "今天沒有到期的複習題。"
      : "錯題本目前是空的。先做幾題，答錯的題目會自動收進來。";
    $("announcer").textContent = message;
    window.alert(message);
    return;
  }
  startSession(
    [...matches].sort(
      (a, b) =>
        (wrongBook[questionId(a)].due || 0) - (wrongBook[questionId(b)].due || 0) ||
        (wrongBook[questionId(b)].wrong || 0) - (wrongBook[questionId(a)].wrong || 0),
    ),
  );
}

function startMock() {
  const selectedYears = selectedMainYears();
  if (!selectedYears || selectedYears.size !== 1) {
    $("filterBody").hidden = false;
    $("advancedToggle").setAttribute("aria-expanded", "true");
    $("advancedToggle").textContent = "收合進階篩選 ▴";
    $("mainYearFilter").open = true;
    $("mainYearSummary").focus();
    window.alert("整回模考一次只能使用一份原卷，請只勾選一個特定年份。");
    return;
  }
  const year = [...selectedYears][0];
  const bank = banks.find((item) => String(item.year) === year);
  if (!bank) return;
  const questions = allQuestions()
    .filter((question) => String(question.year) === year)
    .sort((a, b) => a.no - b.no);
  startSession(questions, {
    mode: "mock",
    seconds: (bank.durationMinutes || 110) * 60,
  });
}

function exportRecords() {
  const payload = {
    app: "gsat-shehui",
    version: 1,
    exportedAt: Date.now(),
    wrongBook: loadWrongBook(),
    history: safeRead(historyKey, []),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `gsat-shehui-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importRecords(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload.app !== "gsat-shehui") throw new Error("不是學測社會題庫的紀錄檔");
    const mergedWrongBook = loadWrongBook();
    for (const [id, incoming] of Object.entries(payload.wrongBook || {})) {
      const current = mergedWrongBook[id];
      if (!current) mergedWrongBook[id] = incoming;
      else {
        current.wrong = (current.wrong || 0) + (incoming.wrong || 0);
        current.box = Math.min(current.box || 1, incoming.box || 1);
        current.due = Math.min(current.due || 0, incoming.due || 0);
      }
    }
    saveWrongBook(mergedWrongBook);
    const history = safeRead(historyKey, []);
    const seen = new Set(history.map((record) => record.completedAt));
    for (const record of payload.history || []) {
      if (record && !seen.has(record.completedAt)) history.push(record);
    }
    history.sort((a, b) => a.completedAt - b.completedAt);
    safeWrite(historyKey, history.slice(-30));
    updateWrongCount();
    renderHistory();
    window.alert("匯入完成，已與這台裝置原有紀錄合併。");
  } catch (error) {
    window.alert(`匯入失敗：${error.message}`);
  }
}

function renderPaperPicker() {
  paperQuestions = filteredQuestions().sort((a, b) => b.year - a.year || a.no - b.no);
  const years = [...new Set(paperQuestions.map((question) => question.year))].sort(
    (a, b) => b - a,
  );
  $("paperYearQuickOptions").innerHTML = `
    <label class="paper-year-all">
      <input id="paperYearAll" type="checkbox" value="all" checked>
      全部年度
    </label>
    ${years
      .map(
        (year) => `
          <label>
            <input class="paper-year-checkbox" type="checkbox" value="${year}">
            ${year} 學年度
          </label>`,
      )
      .join("")}`;
  updatePaperYearSummary();
  $("paperFilterInfo").textContent =
    `目前套用上方篩選，共 ${paperQuestions.length} 題；可再用年度與難度快速勾選。`;
  $("paperQuestionList").innerHTML = paperQuestions
    .map(
      (question, index) => `
        <label>
          <input class="paper-question-checkbox" type="checkbox" value="${index}">
          <span><b>${question.year}－${question.no}</b>　${escapeHtml(question.stem.slice(0, 72))}${question.stem.length > 72 ? "…" : ""}</span>
          <small>${escapeHtml(disciplineLabels[question.discipline])}・${question.type === "constructed" ? "非選擇" : "選擇"}</small>
        </label>`,
    )
    .join("");
  updatePaperCount();
}

function selectedPaperQuestions() {
  return [...document.querySelectorAll(".paper-question-checkbox:checked")]
    .map((checkbox) => paperQuestions[Number(checkbox.value)])
    .filter(Boolean);
}

function updatePaperCount() {
  $("paperCount").textContent = `已選 ${selectedPaperQuestions().length} 題`;
}

function selectedPaperYears() {
  if ($("paperYearAll")?.checked) return null;
  const years = [...document.querySelectorAll(".paper-year-checkbox:checked")].map(
    (checkbox) => Number(checkbox.value),
  );
  return new Set(years);
}

function updatePaperYearSummary() {
  const years = selectedPaperYears();
  $("paperYearQuickSummary").textContent =
    !years || !years.size
      ? "全部年度"
      : [...years]
          .sort((a, b) => b - a)
          .map((year) => `${year}`)
          .join("、") + " 學年度";
}

function handlePaperYearChange(event) {
  const allCheckbox = $("paperYearAll");
  const yearCheckboxes = [...document.querySelectorAll(".paper-year-checkbox")];
  if (event.target === allCheckbox && allCheckbox.checked) {
    yearCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  } else if (
    event.target.classList.contains("paper-year-checkbox") &&
    event.target.checked
  ) {
    allCheckbox.checked = false;
  }
  if (!allCheckbox.checked && !yearCheckboxes.some((checkbox) => checkbox.checked)) {
    allCheckbox.checked = true;
  }
  updatePaperYearSummary();
}

function applyPaperQuickFilter() {
  const years = selectedPaperYears();
  const difficulty = $("paperDifficultyQuick").value;
  document.querySelectorAll(".paper-question-checkbox").forEach((checkbox) => {
    const question = paperQuestions[Number(checkbox.value)];
    checkbox.checked =
      (!years || years.has(question.year)) && inDifficulty(question, difficulty);
  });
  updatePaperCount();
}

function paperShareUrl() {
  const ids = selectedPaperQuestions().map(questionId);
  if (!ids.length) return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("questions", ids.join(","));
  return url.href;
}

async function createPaperLink() {
  const url = paperShareUrl();
  if (!url) {
    window.alert("請先勾選至少一題。");
    return;
  }
  $("paperLinkOutput").innerHTML =
    `學生測驗連結：<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
  try {
    await navigator.clipboard?.writeText(url);
    $("paperLinkOutput").prepend("已複製。");
  } catch {
    // 瀏覽器未授權剪貼簿時，畫面上的連結仍可手動複製。
  }
}

function paperQuestionHtml(question, number, includeGroup = true) {
  const group = question.groupData && includeGroup
    ? `<div><b>${escapeHtml(question.groupData.title)}</b><p>${escapeHtml(question.groupData.passage)}</p>${question.groupData.image ? `<img src="${escapeHtml(question.groupData.image)}" alt="">` : ""}</div>`
    : "";
  const options =
    question.type !== "constructed"
      ? `<ol class="print-options" type="A">${Object.values(question.options)
          .map((option) => `<li>${escapeHtml(option)}</li>`)
          .join("")}</ol>`
      : '<p>作答：____________________________________________________________</p><p>____________________________________________________________</p>';
  return `<article class="print-question">
    <h3>${number}.（${question.year}－${question.no}）</h3>
    ${group}
    <p>${escapeHtml(question.stem)}</p>
    ${question.materialHtml ? `<div>${question.materialHtml}</div>` : ""}
    ${question.image ? `<img src="${escapeHtml(question.image)}" alt="">` : ""}
    ${options}
  </article>`;
}

function paperQuestionsHtml(questions) {
  const shownGroups = new Set();
  return questions
    .map((question, index) => {
      const groupKey = question.group
        ? `${question.year}-${question.group}`
        : "";
      const includeGroup = !groupKey || !shownGroups.has(groupKey);
      if (groupKey) shownGroups.add(groupKey);
      return paperQuestionHtml(question, index + 1, includeGroup);
    })
    .join("");
}

function printPaper() {
  const questions = selectedPaperQuestions();
  if (!questions.length) {
    window.alert("請先勾選至少一題。");
    return;
  }
  const answers = questions
    .map(
      (question) =>
        `<li>${question.type === "constructed" ? "依官方評分原則評閱" : escapeHtml(question.officialAnswerNote ?? question.answer)}</li>`,
    )
    .join("");
  $("paperPrintArea").innerHTML = `
    <h1>學測社會科自編題卷</h1>
    <p>姓名：________________　班級：________　座號：________</p>
    ${paperQuestionsHtml(questions)}
    <section class="print-answer-key"><h2>教師答案</h2><ol>${answers}</ol></section>`;
  const pageSize = $("paperPageSize").value;
  document.body.classList.toggle("paper-b4", pageSize === "B4");
  $("paperPageStyle").textContent =
    `@page { size: ${pageSize} portrait; margin: 12mm; }`;
  document.body.classList.add("printing-paper");
  window.print();
}

function downloadPaperWord() {
  const questions = selectedPaperQuestions();
  if (!questions.length) {
    window.alert("請先勾選至少一題。");
    return;
  }
  const answers = questions
    .map(
      (question, index) =>
        `<h3>${index + 1}. ${question.type === "constructed" ? "依官方評分原則評閱" : escapeHtml(question.officialAnswerNote ?? question.answer)}</h3>` +
        `<p>${escapeHtml(question.explain ?? question.officialRubric ?? "")}</p>`,
    )
    .join("");
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>學測社會科自編題卷</title>
    <style>body{font-family:serif;line-height:1.7}img{max-width:100%;height:auto}.answer{page-break-before:always}</style>
    </head><body><h1>學測社會科自編題卷</h1>
    <p>姓名：________________　班級：________　座號：________</p>
    ${paperQuestionsHtml(questions)}
    <section class="answer"><h1>教師答案與解析</h1>${answers}</section></body></html>`;
  const blob = new Blob([documentHtml], {
    type: "application/msword;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "學測社會科自編題卷.doc";
  link.click();
  URL.revokeObjectURL(link.href);
}

function startLinkedQuestions() {
  const raw = new URL(window.location.href).searchParams.get("questions");
  if (!raw) return;
  const ids = new Set(raw.split(",").filter((id) => /^\d{2,3}-\d{1,2}$/.test(id)));
  const questions = allQuestions().filter((question) => ids.has(questionId(question)));
  if (!questions.length) return;
  startSession(
    [...questions].sort((a, b) => b.year - a.year || a.no - b.no),
  );
}

function setFontSize(size) {
  document.documentElement.classList.remove("font-large", "font-xlarge");
  if (size === "large") document.documentElement.classList.add("font-large");
  if (size === "xlarge") document.documentElement.classList.add("font-xlarge");
  safeWrite(fontSizeKey, size);
}

function init() {
  if (!banks.length) {
    $("filterSummary").textContent = "題庫載入失敗，請重新整理頁面。";
    return;
  }
  const questions = allQuestions();
  const selected = questions.filter(
    (question) => question.type !== "constructed",
  ).length;
  const constructed = questions.length - selected;
  $("totalStat").textContent = questions.length;
  $("selectedStat").textContent = selected;
  $("constructedStat").textContent = constructed;
  $("countInput").max = String(questions.length);
  $("groupStat").textContent = banks.reduce(
    (total, bank) => total + Object.keys(bank.groups).length,
    0,
  );
  $("draftNotice").hidden = !questions.some(
    (question) => question.sourceReview === "pending",
  );
  const years = [...new Set(banks.map((bank) => bank.year))].sort((a, b) => b - a);
  $("mainYearOptions").innerHTML = `
    <label class="paper-year-all"><input id="mainYearAll" type="checkbox" value="all" checked> 全部年度</label>
    ${years.map((year) => `<label><input class="main-year-checkbox" type="checkbox" value="${year}"> ${year} 學年度</label>`).join("")}`;
  updateMainYearSummary();
  renderTopics();
  updateTopicVisibility();
  updateObjectives();
  updateSummary();
  updateWrongCount();
  setFontSize(safeRead(fontSizeKey, "normal"));
  if (window.matchMedia("(max-width: 600px)").matches) {
    $("introBox").classList.add("collapsed");
    $("introToggle").setAttribute("aria-expanded", "false");
  }
}

$("disciplineOptions").addEventListener("change", handleDisciplineChange);
$("topicOptions").addEventListener("change", handleTopicChange);
$("topicOptions").addEventListener("click", handleTopicToggle);
for (const id of [
  "objectiveSelect",
  "typeSelect",
  "difficultySelect",
  "discriminationSelect",
  "countInput",
  "shuffleCheckbox",
  "timedCheckbox",
  "difficultySortCheckbox",
]) {
  $(id).addEventListener("change", updateSummary);
  $(id).addEventListener("input", updateSummary);
}
$("mainYearOptions").addEventListener("change", handleMainYearChange);
$("startBtn").addEventListener("click", startFiltered);
$("quickBtn").addEventListener("click", () => {
  resetMainYears();
  resetDisciplines();
  updateTopicVisibility();
  resetTopics();
  $("typeSelect").value = "single";
  $("difficultySelect").value = "all";
  $("discriminationSelect").value = "all";
  $("shuffleCheckbox").checked = true;
  $("timedCheckbox").checked = false;
  $("difficultySortCheckbox").checked = false;
  $("countInput").value = "10";
  updateObjectives();
  $("objectiveSelect").value = "all";
  startFiltered();
});
$("wrongBtn").addEventListener("click", () => startWrongBook(false));
$("reviewBtn").addEventListener("click", () => startWrongBook(true));
$("submitSessionBtn").addEventListener("click", () => submitDeferredSession(false));
$("advancedToggle").addEventListener("click", () => {
  const body = $("filterBody");
  const expanded = body.hidden;
  body.hidden = !expanded;
  $("advancedToggle").setAttribute("aria-expanded", String(expanded));
  $("advancedToggle").textContent = expanded ? "收合進階篩選 ▴" : "展開進階篩選 ▾";
});
$("moreToggle").addEventListener("click", () => {
  const row = $("moreRow");
  const expanded = row.hidden;
  row.hidden = !expanded;
  $("moreToggle").setAttribute("aria-expanded", String(expanded));
  $("moreToggle").textContent = expanded ? "更多功能 ▴" : "更多功能 ▾";
});
$("historyBtn").addEventListener("click", () => {
  renderHistory();
  $("historyPanel").hidden = false;
  $("historyPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("historyCloseBtn").addEventListener("click", () => {
  $("historyPanel").hidden = true;
});
$("exportBtn").addEventListener("click", exportRecords);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) await importRecords(file);
  event.target.value = "";
});
$("clearRecordsBtn").addEventListener("click", () => {
  if (!window.confirm("確定清除這台裝置的錯題本與學習歷程？此動作無法復原。")) return;
  safeWrite(wrongBookKey, {});
  safeWrite(historyKey, []);
  updateWrongCount();
  renderHistory();
});
$("mockBtn").addEventListener("click", startMock);
$("paperBtn").addEventListener("click", () => {
  renderPaperPicker();
  $("paperPanel").hidden = false;
  $("paperPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("paperCloseBtn").addEventListener("click", () => {
  $("paperPanel").hidden = true;
});
$("paperQuestionList").addEventListener("change", updatePaperCount);
$("paperYearQuickOptions").addEventListener("change", handlePaperYearChange);
$("paperQuickBtn").addEventListener("click", applyPaperQuickFilter);
$("paperLinkBtn").addEventListener("click", createPaperLink);
$("paperSelectAllBtn").addEventListener("click", () => {
  document.querySelectorAll(".paper-question-checkbox").forEach((checkbox) => {
    checkbox.checked = true;
  });
  updatePaperCount();
});
$("paperSelectNoneBtn").addEventListener("click", () => {
  document.querySelectorAll(".paper-question-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });
  updatePaperCount();
});
$("paperPrintBtn").addEventListener("click", printPaper);
$("paperWordBtn").addEventListener("click", downloadPaperWord);
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-paper");
});
$("constructedBtn").addEventListener("click", () => {
  resetMainYears();
  resetDisciplines();
  updateTopicVisibility();
  resetTopics();
  $("typeSelect").value = "constructed";
  $("difficultySelect").value = "all";
  $("discriminationSelect").value = "all";
  $("shuffleCheckbox").checked = true;
  $("timedCheckbox").checked = false;
  $("difficultySortCheckbox").checked = false;
  $("countInput").value = String(
    allQuestions().filter((question) => question.type === "constructed").length,
  );
  updateObjectives();
  $("objectiveSelect").value = "all";
  updateSummary();
  startFiltered();
});
$("introToggle").addEventListener("click", () => {
  const collapsed = !$("introBox").classList.contains("collapsed");
  $("introBox").classList.toggle("collapsed", collapsed);
  $("introToggle").setAttribute("aria-expanded", String(!collapsed));
  $("introToggle").textContent = collapsed ? "看更多 ▾" : "收合 ▴";
});
$("fontFold").addEventListener("click", () => {
  const folded = $("fontSizeControl").classList.toggle("folded");
  $("fontFold").setAttribute("aria-expanded", String(!folded));
});
document.querySelectorAll(".font-option").forEach((button) => {
  button.addEventListener("click", () => setFontSize(button.dataset.size));
});
$("resetBtn").addEventListener("click", () => {
  stopTimer();
  $("session").hidden = true;
  $("questionList").innerHTML = "";
  currentQuestions = [];
  answered = 0;
  correct = 0;
  sessionSaved = false;
  sessionMode = "practice";
  pendingAnswers = {};
});

init();
startLinkedQuestions();
