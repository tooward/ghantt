# Ghantt — project notes for Claude Code

Read at the start of every session. Current status is at the bottom; keep it
up to date when work lands.

## What this is

A browser-only Gantt chart for GitHub issues (Vue 3 + Vite + TypeScript,
frappe-gantt for drawing). No backend: the page calls GitHub's GraphQL API
directly with the user's own personal access token. Live at
**https://ghantt.app** (Cloudflare), repository **github.com/tooward/ghantt**.

Read before changing things:

- `docs/ARCHITECTURE.md` — layering, the GraphQL queries, date resolution
  (§5.3), dependencies (§5.4), milestones and release issues (§5.5), token
  security (§6).
- `docs/ROADMAP.md` — what is next, known limits, and what has shipped.
- `README.md` — user-facing behaviour and deployment; `help.html` — the
  in-app help page users see.

## Working conventions

- `npm run verify` (lint, typecheck, tests, build) must pass before a commit.
- Never commit on `main`: branch, push, open a PR. Commit messages end with the
  `Co-Authored-By` line the harness supplies.
- All day counting goes through `src/domain/workingDays.ts` (Mon–Fri, Start
  and End both count). Date rules live in `src/domain/dateResolution.ts`.
- GitHub-shaped types stay inside `src/adapters/github/` (lint-enforced).
- Issue and milestone titles are untrusted: frappe-gantt writes task names
  with `innerHTML`, so `frappeTasks.ts` escapes them; the chart's own
  additions set text with `textContent` only.
- Storage keys still say `gh-gantt` on purpose (`gh-gantt:settings`,
  `gh-gantt:token`, the `gh-gantt` IndexedDB, and the passkey PRF string
  `gh-gantt:token-encryption:v1`). Renaming any of them logs every user out
  or makes remembered tokens unreadable. CSS classes `gh-gantt-*` are internal.
- The dev server for testing over Tailscale:
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.ts.net npx vite --host 0.0.0.0 --port 5180`
  then `http://100.113.112.23:5180/`. Plain HTTP, so passkeys do not work there.
- Four `test/dateResolution.test.ts` cases fail under a US time zone
  (`TZ=America/Los_Angeles`): their inputs are UTC timestamps where GitHub
  sends plain dates. Pre-existing; the app is fine. Worth fixing.

## GitHub setup facts (shieldedtech organisation)

- Issue fields: `Start` and `End` (Date), `Days` (Number — effort in working
  days). `Effort` is a separate single-select field used for something else;
  the app must not read it.
- Issue types: Task, Bug, Feature, Risk, Audit Finding, Security Advisory.
  The chart shows Feature by default.
- Milestones need **Write** access to create; **Triage** can assign them and
  apply existing labels. The `release` label also needs Write to create.
- The user's working GitHub account is `shieldedme`. The `gh` CLI on this
  machine is logged in as `tooward`, which has only Read access to
  shieldedtech repositories and cannot see the repositories being charted —
  so live checks against that data need `shieldedme` logged in to `gh`.

## Hosting

- Cloudflare **Worker** (created through Cloudflare's "import a repository"
  flow, not a classic Pages project), building `npm run build` to `dist/`.
  Every push to `main` redeploys. Also served at `ghantt.setflow.workers.dev`.
- Domain `ghantt.app`, DNS on Cloudflare. `www.ghantt.app` also serves the app.
- `public/_headers` sets the CSP (scripts from the site only, network only to
  `api.github.com`, images from the site and GitHub avatars), nosniff,
  no-referrer, COOP, Permissions-Policy, and immutable caching for
  `/assets/*`. Verified live: the headers are applied on ghantt.app.
- A remembered token belongs to one address. Users should only ever use
  `https://ghantt.app`.

## Status — 2026-10-28

All work is merged to `main` (PRs #1–#7) and deployed to ghantt.app.

Latest: a label filter in the toolbar (#6); the app now fills exactly the
window height and the chart scrolls inside itself, and a title too long for
its bar is written just past the bar's end instead of being cut short (#7).

Shipped recently: the Days field and keeping dates and Days in step;
milestones as diamonds with `release`-labelled release issues; refresh
button; labels that fit their bars with full text on hover; title escaping
(a real XSS fix); full-width, page-length chart with a sticky detail panel;
octopus logo and favicon; rename from gh-gantt to ghantt; help page with a
round `?` in the toolbar; Cloudflare security headers.

### Open — needs the user (Cloudflare dashboard)

1. **`www` → apex redirect.** Not done yet: on 2026-10-05
   `https://www.ghantt.app/` still answered 200 instead of a 301. Set it on
   the ghantt.app zone under **Rules → Redirect Rules** (template "Redirect
   from WWW to root"): hostname equals `www.ghantt.app` → dynamic
   `concat("https://ghantt.app", http.request.uri.path)`, 301, preserve query
   string. Not under the Worker's Domains & Routes. Check afterwards with
   `curl -sI https://www.ghantt.app/`.
2. Optionally turn off `ghantt.setflow.workers.dev` (Worker → Settings →
   Domains & Routes), or add an in-app redirect to ghantt.app.
3. **Browser check of the CSP** on https://ghantt.app: connect, load a chart,
   and look for "Content-Security-Policy" errors in DevTools → Console.
   `style-src` allows `'unsafe-inline'` (Vue and frappe-gantt set styles at
   run time); tighten it if nothing needs it.
4. On 2026-09-29 the user's own machine could not resolve `ghantt.app` while
   `www` worked — a cached negative DNS answer (negative TTL 1800 s), not a
   site problem. Should have cleared by itself.

### Open — needs real data

- Nothing has been tried against real issues yet: Days auto-fill and the
  mismatch warnings, the three Set buttons, milestones and release issues.
  See ROADMAP "Next". The user saw two diamonds for "2026-Q4 Release" (a
  stand-in plus #186 drawn on its own End): #186 most likely lacked the
  milestone assignment, and the SOW-Q4 Features were not in the milestone.
  Unconfirmed — `tooward` cannot see that repository.

### Ideas offered, not decided

- Hide stand-in diamonds (milestones with no release issue), and warn on a
  release issue that is in no milestone — avoids the duplicate-diamond
  confusion above.
- Extend the "starts before its blocker ends" warning from releases to every
  blocked-by link.
- Assign milestones and create release issues from the detail panel.

### Housekeeping

- Stale branches, all merged: `feat/editing-and-panel`,
  `feat/days-sync-and-milestones`, `chore/rename-ghantt`,
  `chore/cloudflare-pages` (local and on GitHub). Safe to delete.
- PR #4 accidentally committed wrangler's local state (`.wrangler/`); the
  `chore/handoff-notes` branch removes it from the repository and ignores it.
- `public/icons.svg` is a leftover from the Vite starter that nothing uses.
