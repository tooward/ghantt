# gh-gantt

A browser-hosted Gantt chart for GitHub issues, with dependency arrows.

No backend, no database, no server process. It is a static page that reads issues from GitHub's GraphQL API directly in your browser, using a personal access token that never leaves your machine. Read-only: editing happens in GitHub.

## What it does

- Charts the open issues of one repository, one bar per issue.
- Draws `blocked by` relationships as arrows, so the order of work is visible.
- Resolves start and due dates from issue date fields, from the issue body, or from the milestone — see [Where the dates come from](#where-the-dates-come-from).
- Pages through large boards and shows your remaining API budget.

## Running it

Requires Node 22 or newer.

```bash
npm install
npm run dev      # development server
npm run verify   # lint, typecheck, tests and a production build
npm run build    # production build into dist/
npm run preview  # serve the production build
```

The build output in `dist/` is plain static files and can be served from any static host. Nothing is deployed yet and `base` is `'/'`, which suits a domain root; if you serve from a subpath — GitHub Pages at `<user>.github.io/gh-gantt/`, say — set [`base`](https://vite.dev/config/shared-options.html#base) in `vite.config.ts` to match before building.

## Creating a token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with access to the repository you want to chart, and give it exactly:

- Repository permissions → **Issues: Read-only**
- Repository permissions → **Metadata: Read-only**

Nothing else. The app never writes to GitHub. Set an expiry of 90 days or less.

A classic token also works — `public_repo` for public repositories, `repo` for private ones — but `repo` grants far more than this app needs, so prefer a fine-grained token.

### Where your token goes

**Only to `api.github.com`.** There is no server in this project to send it to.

- By default the token is held in memory and `sessionStorage`, so it is forgotten when you close the tab.
- The connect form is marked up so your browser or password manager offers to save it. That is the recommended place to keep it: it then lives in the manager's vault rather than in this site's storage.
- Ticking "remember this token on this device" encrypts it with a key derived from a **passkey** and stores only the ciphertext. You are asked to create a passkey, then to use it; getting the token back later needs your fingerprint, face or PIN, so a script on the page cannot read it silently. If your browser or authenticator cannot do this, the app stays session-only and tells you — it never falls back to storing a bare token.
- Unlocking is an explicit "Unlock with passkey" button. The app never prompts for your passkey just because a page loaded.
- The token is never written to local storage, never put in a URL, and is redacted from error messages.
- "Disconnect" clears memory, session storage and the encrypted record. That is the only thing that forgets a remembered token: connecting with a different token and leaving "remember" unticked keeps the stored one, because re-enrolling costs a new passkey.

The mechanism is the WebAuthn `prf` extension plus AES-GCM via WebCrypto — see `docs/ARCHITECTURE.md` §6, Tier 3.

## Where the dates come from

GitHub issues have no start or due date, so each bar's dates are resolved by falling through a chain. The first match wins.

**Start date**

1. An issue **date field** named `Start date` (configurable, matched case-insensitively). Issue fields are organisation-level, so personal repositories have none — the rest of the chain always works.
2. A line in the issue body beginning `GanttStart:` followed by an ISO date, e.g. `GanttStart: 2026-03-01`.
3. The resolved due date minus the default task length.
4. The issue's creation date, which always exists.

**Due date**

1. An issue **date field** named `Target date` (configurable).
2. A line in the issue body beginning `GanttDue:`.
3. The milestone's due date.
4. The start date plus the default task length (1 day by default).

Field names, body prefixes, the default task length and the page size are all editable in the app's Settings panel and are remembered in local storage. Dates that cannot be parsed are ignored and reported on the bar rather than guessed at; a due date falling before its start is corrected and flagged.

## Dependencies

An issue's `blocked by` links become arrows pointing from the blocker to the blocked issue.

Some edges cannot be drawn: `blocked by` can name a closed issue, an issue in another repository, or one that has not been paged in yet. Those are dropped and counted in a notice rather than breaking the chart — load more issues and the ones that were merely unloaded turn into real arrows. Circular dependencies are detected, one edge is dropped to break the loop, and that too is reported.

## Documentation

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Target architecture, stack, data flow and locked design decisions. |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The phased build plan and its acceptance criteria. |

## Prior art

Designed after reviewing [GanttLab](https://gitlab.com/ganttlab/ganttlab) (Apache-2.0), which solves a similar problem for GitHub and GitLab. This is not a fork and contains none of its code. See ARCHITECTURE.md §2 for the attribution rules if that ever changes.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE).
