const fields = [
  "questionId", "year", "era", "no", "discipline", "objective", "tags", "type",
  "stem", "context", "options", "answer", "picked", "explain", "image",
  "issueType", "note", "url", "device", "website",
];

const limits = {
  stem: 700,
  context: 1400,
  options: 1400,
  explain: 1200,
  note: 500,
  image: 500,
  url: 400,
  device: 300,
  website: 120,
};

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

export function buildReportPayload(input) {
  const source = input || {};
  return fields.reduce((payload, field) => {
    payload[field] = text(source[field], limits[field] || 100);
    return payload;
  }, {});
}

export function reportEndpoint(locationLike) {
  const hostname = String(locationLike?.hostname || "");
  return hostname === "gsat-shehui.vercel.app" || hostname.endsWith(".vercel.app")
    ? "/api/report"
    : "https://gsat-shehui.vercel.app/api/report";
}

export async function submitReport(input, locationLike, fetchImpl) {
  const send = fetchImpl || fetch;
  const response = await send(reportEndpoint(locationLike), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildReportPayload(input)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "回報暫時無法送出");
  return data;
}

export function reportFormHtml() {
  return `<section class="report-box no-print">
    <button class="report-toggle" type="button" aria-expanded="false">🚩 這題有問題？回報給大乃老師</button>
    <form class="report-form" hidden>
      <fieldset>
        <legend>問題類型</legend>
        <div class="report-reasons">
          <label><input type="radio" name="issueType" value="題目或選項有誤" required> 題目或選項有誤</label>
          <label><input type="radio" name="issueType" value="答案有誤"> 答案有誤</label>
          <label><input type="radio" name="issueType" value="解析不清"> 解析不清</label>
          <label><input type="radio" name="issueType" value="圖片或圖表異常"> 圖片或圖表異常</label>
          <label><input type="radio" name="issueType" value="其他"> 其他</label>
        </div>
      </fieldset>
      <label>補充說明（選填）
        <textarea class="report-note" maxlength="500" rows="2" placeholder="前三類可直接送出；選其他時請簡單說明。"></textarea>
      </label>
      <label class="report-honeypot" aria-hidden="true">網站<input class="report-website" tabindex="-1" autocomplete="off"></label>
      <div class="report-actions">
        <button class="button secondary report-submit" type="submit">送出回報</button>
        <span class="report-status" role="status" aria-live="polite"></span>
      </div>
    </form>
  </section>`;
}

export function bindReportForm(container, getContext, locationLike, fetchImpl) {
  const box = container.querySelector(".report-box");
  if (!box) return;
  const toggle = box.querySelector(".report-toggle");
  const form = box.querySelector(".report-form");
  const submit = box.querySelector(".report-submit");
  const status = box.querySelector(".report-status");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    form.hidden = !expanded;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const issueType = form.querySelector('input[name="issueType"]:checked')?.value || "";
    const note = form.querySelector(".report-note").value.trim();
    if (!issueType) {
      status.textContent = "請先選擇問題類型。";
      return;
    }
    if (issueType === "其他" && note.length < 5) {
      status.textContent = "選擇其他時，請至少輸入 5 個字。";
      return;
    }
    submit.disabled = true;
    status.textContent = "送出中……";
    try {
      await submitReport({
        ...getContext(),
        issueType,
        note,
        website: form.querySelector(".report-website").value,
      }, locationLike, fetchImpl);
      status.textContent = "✓ 已送出，謝謝你幫忙校對！";
      form.querySelectorAll("input, textarea, button").forEach((element) => {
        element.disabled = true;
      });
      toggle.disabled = true;
    } catch (error) {
      status.textContent = error.message || "回報暫時無法送出";
      submit.disabled = false;
    }
  });
}
