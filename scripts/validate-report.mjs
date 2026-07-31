import assert from "node:assert/strict";
import fs from "node:fs";
import { buildReportPayload, reportEndpoint, reportFormHtml, submitReport } from "../report-client.js";
import handler, { formatMessage } from "../api/report.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

const payload = buildReportPayload({
  questionId: "115-36",
  year: 115,
  era: "學測",
  no: 36,
  discipline: "地理",
  objective: "G3 地表現象",
  tags: "海岸環境、產業風險",
  stem: "題幹".repeat(500),
  context: "題組脈絡".repeat(500),
  options: "選項".repeat(800),
  answer: "B",
  picked: "A",
  explain: "解析".repeat(700),
  issueType: "圖片或圖表異常",
  note: "圖片看不清楚",
  unexpected: "不可送出",
});
assert.equal(payload.stem.length, 700);
assert.equal(payload.context.length, 1400);
assert.equal(payload.options.length, 1400);
assert.equal(payload.explain.length, 1200);
assert.equal("unexpected" in payload, false);

assert.equal(reportEndpoint({ hostname: "gsat-shehui.vercel.app" }), "/api/report");
assert.equal(reportEndpoint({ hostname: "gsat-shehui.pages.dev" }), "https://gsat-shehui.vercel.app/api/report");
assert.equal(reportEndpoint({ hostname: "gsat-shehui.netlify.app" }), "https://gsat-shehui.vercel.app/api/report");

let clientRequest;
await submitReport(
  { questionId: "115-36", issueType: "解析不清" },
  { hostname: "gsat-shehui.pages.dev" },
  async (url, options) => {
    clientRequest = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  },
);
assert.equal(clientRequest.url, "https://gsat-shehui.vercel.app/api/report");
assert.equal(clientRequest.options.method, "POST");

const message = formatMessage({
  questionId: "115-36",
  year: 115,
  era: "學測",
  no: 36,
  discipline: "地理",
  objective: "G3 地表現象",
  tags: "海岸環境、產業風險",
  type: "單選題",
  stem: "照片中的甲河段海拔高度比乙河段高。",
  context: "第 36–37 題題組，照片 1",
  options: "(A) 選項一\n(B) 選項二",
  answer: "B",
  picked: "A",
  explain: "先比較河階與河道位置。",
  image: "https://gsat-shehui.vercel.app/img/115/cropped/q36.jpg",
  issueType: "圖片或圖表異常",
  note: "圖片裁切不完整",
  url: "https://gsat-shehui.pages.dev/",
  device: "test-browser",
});
for (const expected of ["115-36", "地理", "海岸環境", "學生作答：A", "標準答案：B", "完整選項", "題組／資料脈絡", "目前解析", "題圖：", "圖片裁切不完整"]) {
  assert.match(message, new RegExp(expected));
}
assert.ok(message.length <= 3900);

for (const origin of [
  "https://gsat-shehui.vercel.app",
  "https://gsat-shehui.pages.dev",
  "https://gsat-shehui.netlify.app",
]) {
  const res = responseRecorder();
  await handler({ method: "OPTIONS", headers: { origin } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], origin);
}

const otherRes = responseRecorder();
await handler({
  method: "POST",
  headers: { origin: "https://gsat-shehui.vercel.app", "x-forwarded-for": "203.0.113.50" },
  body: { questionId: "115-36", issueType: "其他", note: "太短" },
}, otherRes);
assert.equal(otherRes.statusCode, 400);

const originalFetch = globalThis.fetch;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_CHAT_ID;
let telegramRequest;
globalThis.fetch = async (url, options) => {
  telegramRequest = { url, options };
  return { ok: true, json: async () => ({ ok: true }) };
};
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_CHAT_ID = "test-chat";
try {
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: { origin: "https://gsat-shehui.netlify.app", "x-forwarded-for": "203.0.113.51" },
    body: {
      questionId: "115-36",
      year: "115",
      no: "36",
      issueType: "解析不清",
      stem: "測試題幹",
      answer: "B",
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.match(telegramRequest.url, /^https:\/\/api\.telegram\.org\/bottest-token\/sendMessage$/);
  const telegramBody = JSON.parse(telegramRequest.options.body);
  assert.equal(telegramBody.chat_id, "test-chat");
  assert.match(telegramBody.text, /115-36/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = originalChatId;
}

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const check = fs.readFileSync(new URL("../check.js", import.meta.url), "utf8");
const build = fs.readFileSync(new URL("./build-site.mjs", import.meta.url), "utf8");
assert.match(reportFormHtml(), /name="issueType"/);
assert.match(app, /bindReportForm/);
assert.match(app, /questionReportContext/);
assert.match(check, /bindReportForm/);
assert.match(build, /report-client\.js/);
assert.doesNotMatch(index + app + check, /TELEGRAM_BOT_TOKEN|api\.telegram\.org\/bot/);

console.log(JSON.stringify({
  payloadAllowlist: "VERIFIED",
  fullQuestionContext: "VERIFIED",
  corsOrigins: 3,
  telegramServerOnly: "VERIFIED",
  practiceAndCheckPages: "VERIFIED",
  status: "VERIFIED",
}, null, 2));
