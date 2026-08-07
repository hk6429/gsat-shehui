import handler from "../../api/report.js";

function requestHeaders(request) {
  return Object.fromEntries(
    [...request.headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function responseAdapter() {
  let status = 200;
  const headers = new Headers();
  return {
    setHeader(name, value) {
      headers.set(name, String(value));
    },
    status(code) {
      status = code;
      return this;
    },
    json(body) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(body), { status, headers });
    },
    end() {
      return new Response(null, { status, headers });
    },
  };
}

export async function onRequest({ request, env }) {
  let body = {};
  if (request.method === "POST") {
    const rawBody = await request.text();
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      body = {};
    }
  }

  return handler(
    {
      method: request.method,
      headers: requestHeaders(request),
      body,
      socket: { remoteAddress: request.headers.get("cf-connecting-ip") || "" },
      env,
    },
    responseAdapter(),
  );
}
