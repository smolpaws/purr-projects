/**
 * Purr Projects skin — Node server (stdlib only).
 *
 * Listens on OPENHANDS_SKIN_PORT (set by the Agent Canvas skin service) and
 * serves the project board from public/ plus a small JSON API that reads the
 * host agent-server's conversation list, classifies each conversation into a
 * hardcoded project (see projects.js), and returns the grouped view.
 *
 * Read-only: it never mutates conversations. The board's "Open in Canvas"
 * links are deep links into the Canvas UI (/canvas), resolved in the browser.
 * The agent-server session key is injected by the host and used only to read.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { PROJECTS, classify } = require("./projects.js");

const PORT = Number(process.env.OPENHANDS_SKIN_PORT || process.env.PORT || 4800);
const AGENT_SERVER_URL =
  process.env.AGENT_SERVER_URL || process.env.CANVAS_URL || "http://127.0.0.1:18000";
const SESSION_API_KEY =
  process.env.SESSION_API_KEY || process.env.OPENHANDS_SESSION_API_KEY || "";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
};

// ---------------------------------------------------------------------------
// tiny HTTP helpers
// ---------------------------------------------------------------------------
function request(method, url, headers) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`${method} ${url} -> HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const authHeaders = () =>
  SESSION_API_KEY ? { "X-Session-API-Key": SESSION_API_KEY } : {};

async function getJson(url) {
  return JSON.parse(await request("GET", url, authHeaders()));
}

// ---------------------------------------------------------------------------
// agent-server reads
// ---------------------------------------------------------------------------
async function listConversations(limit = 100) {
  const d = await getJson(
    `${AGENT_SERVER_URL}/api/conversations/search?limit=${limit}`,
  );
  return Array.isArray(d) ? d : d.items || [];
}

// First user message text — the classification signal. Best-effort; a
// conversation with no readable user text just classifies on its workspace.
async function firstUserMessage(id) {
  try {
    const d = await getJson(
      `${AGENT_SERVER_URL}/api/conversations/${encodeURIComponent(id)}/events/search?limit=40`,
    );
    for (const it of d.items || []) {
      const m = it.llm_message || {};
      if (m.role !== "user") continue;
      const c = m.content;
      const text = Array.isArray(c)
        ? c.map((x) => (x && x.text) || "").join(" ")
        : typeof c === "string"
          ? c
          : "";
      if (text.trim()) return text.trim();
    }
  } catch {
    /* fall through to empty */
  }
  return "";
}

function titleFrom(text, id) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return `conversation ${id.slice(0, 8)}`;
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

// Build the grouped project view (cached briefly to keep the board snappy).
let cache = { at: 0, data: null };
const CACHE_MS = 15_000;

async function buildBoard() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  const convs = await listConversations();
  const enriched = await Promise.all(
    convs.map(async (c) => {
      const workspace = (c.workspace && c.workspace.working_dir) || "";
      const first = await firstUserMessage(c.id);
      return {
        id: c.id,
        status: c.execution_status || c.status || "unknown",
        workspace,
        title: titleFrom(first, c.id),
        projectId: classify(first, workspace),
        updatedAt: c.updated_at || c.created_at || null,
      };
    }),
  );

  // "personal" conversations are excluded from the board entirely.
  const excluded = enriched.filter((c) => c.projectId === "personal").length;
  const shown = enriched.filter((c) => c.projectId !== "personal");

  const groups = PROJECTS.map((p) => {
    const items = shown
      .filter((c) => c.projectId === p.id)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return {
      id: p.id,
      name: p.name,
      blurb: p.blurb,
      icon: p.icon,
      color: p.color,
      count: items.length,
      conversations: items,
    };
  });

  const data = {
    generatedAt: new Date().toISOString(),
    total: shown.length,
    excludedPersonal: excluded,
    canvasUrl: AGENT_SERVER_URL,
    projects: groups,
  };
  cache = { at: Date.now(), data };
  return data;
}

// ---------------------------------------------------------------------------
// http server
// ---------------------------------------------------------------------------
function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

async function handleApi(pathname, res) {
  try {
    if (pathname === "/api/board") return sendJson(res, await buildBoard());
    if (pathname === "/api/projects") return sendJson(res, { projects: PROJECTS });
    return sendJson(res, { error: "not found" }, 404);
  } catch (e) {
    return sendJson(res, { error: String((e && e.message) || e) }, 502);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Canvas host proxies /skin/* verbatim (and serves the skin at / via an
  // internal rewrite). Strip the prefix so handlers work at /skin/, /, standalone.
  let pathname = url.pathname;
  if (pathname === "/skin" || pathname.startsWith("/skin/")) {
    pathname = pathname.slice("/skin".length) || "/";
  }

  if (pathname.startsWith("/api/")) return handleApi(pathname, res);

  // static
  let fp = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname);
  if (!fp.startsWith(path.join(__dirname, "public")) || !fs.existsSync(fp)) {
    fp = path.join(__dirname, "public", "index.html");
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(fp)] || "application/octet-stream",
  });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, () => console.log(`purr-projects skin listening on :${PORT}`));
