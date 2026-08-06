/**
 * Hardcoded project definitions + classification rules for the odie siblings.
 *
 * A "project" groups the sibling OpenHands conversations that ran on this
 * Canvas. Each conversation is scored against every project's `match` rules
 * (applied to its first user message + workspace path); highest score wins,
 * ties break by project order, and anything unmatched lands in `misc`.
 *
 * Rules are intentionally simple and legible — edit them here.
 */

const PROJECTS = [
  {
    id: "reviews",
    name: "PR Reviews",
    blurb:
      "Reviewing and merging upstream OpenHands PRs — analyze, merge main into, /codereview passes on software-agent-sdk and OpenHands.",
    icon: "git-pull-request",
    color: "#4ad98a",
    match: [
      "review",
      "merge main into",
      "/codereview",
      "codereview-roasted",
      "wdyt about this pr",
      "analyze the pr",
      "pull/",
      "accept my pr",
    ],
  },
  {
    id: "canvas",
    name: "Agent Canvas",
    blurb:
      "The Agent Canvas product itself: UI bugs, version checks, the LLM-profile screens, consent banner, canvas PRs and skins.",
    icon: "monitor",
    color: "#4ea1ff",
    match: [
      "agent-canvas",
      "canvas",
      "llm profile",
      "llm profiles",
      "consent banner",
      "skin",
      "automate tab",
      "sidebar",
    ],
  },
  {
    id: "transpile",
    name: "TypeScript Transpile",
    blurb:
      "The SDK→TS rewrite and everything hanging off it: native tool calling, agent-server parity, the message-work coordinator, and the live-test evidence runs.",
    icon: "boxes",
    color: "#4ea1ff",
    match: [
      "openhands-agent",
      "agent-server parity",
      "native tool",
      "transpile",
      "transpilation",
      "coordinator",
      "message queue",
      "message-work",
      "b1r",
      "packages/openhands-agent-server",
      "3899",
      "ready beads",
    ],
  },
  {
    id: "automations",
    name: "Automations",
    blurb:
      "Building automations — agents that make agents: the code-review automation, the daily GitHub mentions newspaper, scheduled digests.",
    icon: "workflow",
    color: "#f5b942",
    match: [
      "automation",
      "newspaper",
      "mentions newspaper",
      "daily",
      "schedule",
      "cron",
    ],
  },
  {
    id: "smolpaws",
    name: "SmolPaws",
    blurb:
      "smolpaws itself — bridges, identity, memory, infra: the WhatsApp Main recovery, the Slack bridge migration, repo/channel setup, skill imports.",
    icon: "cat",
    color: "#C0C0C0",
    match: [
      "smolpaws",
      "whatsapp",
      "slack bridge",
      "3 channels",
      "import the skill",
      "last30days",
      "odie",
      "deleted almost everything",
    ],
  },
  {
    id: "misc",
    name: "Misc",
    blurb:
      "Diagnostics and throwaway runs — identity/model probes, auth smoke tests, one-line 'hello' checks. Kept for the record, not real projects.",
    icon: "flask-conical",
    color: "#8a95a3",
    match: [], // fallback bucket — everything unmatched lands here
  },
];

// Phrases that mark a conversation as pure scaffolding/diagnostics → force misc.
const MISC_SIGNALS = [
  "who are you, what model",
  "what llm model and provider are you",
  "say hello in exactly one short sentence",
  "reply with exactly",
  "hello after first-message auth",
  "hello from wsproto",
  "create a basic webpage explaining what openhands can do",
  "call canvas_ui_client exactly once",
  "who are you, what model exactly",
];

// Purely personal (non-work) conversations Engel asked to keep out of the
// projects entirely — they fall through to Misc.
const PERSONAL_SIGNALS = [
  "gym",
  "vacation",
  "apartment",
  "rent an apartment",
  "portugal",
  "dancing",
];

// Match a phrase against the text. Multi-word phrases and hyphenated/slashed
// tokens use plain substring; single plain words use a word-boundary test so
// short tokens (e.g. "ui", "skin") don't match inside unrelated words.
function phraseHit(hay, kw) {
  const k = kw.toLowerCase();
  if (/[^a-z0-9]/.test(k)) return hay.includes(k); // has space/slash/hyphen/digit-punct
  return new RegExp(`\\b${k}\\b`).test(hay);
}

function classify(firstMessage, workspace) {
  const msg = (firstMessage || "").toLowerCase();

  // The generic Canvas workspace dir (~/.openhands/agent-canvas/workspaces/…)
  // is NOT a signal — otherwise every conversation would match "Agent Canvas".
  // Only a real repo checkout path (…/repos/<name>) carries meaning.
  let wsSignal = "";
  const ws = (workspace || "").toLowerCase();
  const repoMatch = ws.match(/\/repos\/([^/]+)/);
  if (repoMatch) wsSignal = repoMatch[1];

  const hay = `${msg} ${wsSignal}`.trim();

  // Short / scaffolding messages → misc (test on the message alone).
  const m = msg.trim();
  if (m === "" || m === "test" || m === "hey" || m === "hey hey" || m.length < 3) {
    return "misc";
  }
  for (const sig of PERSONAL_SIGNALS) {
    if (phraseHit(hay, sig)) return "personal"; // excluded from the board
  }
  for (const sig of MISC_SIGNALS) {
    if (msg.includes(sig)) return "misc";
  }

  let best = null;
  let bestScore = 0;
  for (const p of PROJECTS) {
    if (p.id === "misc") continue;
    let score = 0;
    for (const kw of p.match) {
      if (phraseHit(hay, kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p.id;
    }
  }
  return best || "misc";
}

module.exports = { PROJECTS, classify };
