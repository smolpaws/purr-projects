---
name: skin-app
description: This instance's skin is "Purr Projects" — a read-only project
  board over the host agent-server's conversations, grouping smolpaws' sibling
  agents into six projects. Use this to understand what the board shows, how
  conversations are classified, and how to change the grouping.
---

# This instance's skin: Purr Projects

This Agent Canvas instance's skin (default tab, code at `~/workspace/skin`) is
a project board for smolpaws' sibling OpenHands agents. `server.js` reads the
host agent-server's conversation list, classifies each conversation, and serves
a grouped view; `public/index.html` renders it as project cards.

## What it shows

Six hardcoded projects, each a card with its conversations (status dot +
first-message title + repo). Clicking a conversation deep-links into the Canvas
UI transcript. Projects: **TypeScript Transpile**, **PR Reviews**,
**Automations**, **Agent Canvas**, **SmolPaws**, **Misc**. Purely personal
conversations are excluded.

## Data flow

- `GET /skin/api/board` — the grouped board: for each conversation it fetches
  the first user message (`/api/conversations/:id/events/search`) and the
  workspace, then `classify()` (in `projects.js`) assigns a project. Cached ~15s.
- `GET /skin/api/projects` — the raw project definitions.

The server reads the host agent-server at `AGENT_SERVER_URL` (default
`http://127.0.0.1:18000`) using the injected `SESSION_API_KEY`. It is
**read-only** — it never creates, edits, or deletes conversations, and holds no
secrets.

## Classification

Rules live in `projects.js`:
- Each project has a `match` list of keywords. A conversation scores a point per
  keyword hit against `firstMessage + repoName`; highest score wins.
- Single plain words match on word boundaries (so "ui"/"skin" don't match inside
  unrelated words); multi-word/hyphenated phrases match as substrings.
- The generic Canvas workspace dir is ignored as a signal — only a real
  `…/repos/<name>` checkout counts.
- Short/scaffolding messages and a personal-signals list are special-cased
  (→ Misc, or hidden for personal).

## Working on it

To re-group projects or fix a misclassification, edit `projects.js` (the
`PROJECTS` array and the signal lists), then restart the skin
(`POST /skin-api/restart` on the host, or re-run `npm run start` standalone).
No agent-server changes are needed.
