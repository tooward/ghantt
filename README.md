# gh-gantt

A browser-hosted Gantt chart for GitHub issues, with dependency arrows.

No backend, no database, no server process. It is a static page that reads issues from GitHub's GraphQL API directly in your browser, using a personal access token that never leaves your machine. It can also change an issue's Start and End dates and its blocking links from the chart; everything else is edited in GitHub.

## What it does

- Charts the open issues of one repository, one bar per issue — by default only issues of type **Feature**. The repository and type are chosen from the button in the toolbar under the header, which slides down Owner, Repository and Type fields; clear Type to chart every type. It suggests the repository's own issue types.
- Draws `blocked by` relationships as arrows, so the order of work is visible.
- Resolves start and due dates from issue date fields or from the milestone — see [Where the dates come from](#where-the-dates-come-from).
- Edits an issue's Start and End dates, and what it is blocked by and what it blocks, from the detail panel, saving straight to GitHub.
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

- Repository permissions → **Issues: Read and write** — or **Read-only** if you only want to view the chart
- Repository permissions → **Metadata: Read-only**

Nothing else. The only things the app ever writes are an issue's date fields and its blocking links, and only when you ask it to. With a read-only token the chart works as before and a save is refused with a message saying so. Set an expiry of 90 days or less.

A classic token also works — `public_repo` for public repositories, `repo` for private ones — but `repo` grants far more than this app needs, so prefer a fine-grained token.

### Where your token goes

**Only to `api.github.com`.** There is no server in this project to send it to.

- By default the token is held in memory and `sessionStorage`, so it is forgotten when you close the tab.
- The connect form is marked up so your browser or password manager offers to save it. That is the recommended place to keep it: it then lives in the manager's vault rather than in this site's storage.
- Ticking "remember this token on this device" encrypts it with a key derived from a **passkey** and stores only the ciphertext. You are asked to create a passkey — and, if your authenticator needs it, to use it once more with a "Use passkey" button; getting the token back later needs your fingerprint, face or PIN, so a script on the page cannot read it silently. If your browser or authenticator cannot do this, the app stays session-only and tells you — it never falls back to storing a bare token.
- Unlocking is an explicit "Unlock with passkey" button. The app never prompts for your passkey just because a page loaded.
- The token is never written to local storage, never put in a URL, and is redacted from error messages.
- "Disconnect" clears memory, session storage and the encrypted record. That is the only thing that forgets a remembered token: connecting with a different token and leaving "remember" unticked keeps the stored one, because re-enrolling costs a new passkey.

The mechanism is the WebAuthn `prf` extension plus AES-GCM via WebCrypto — see `docs/ARCHITECTURE.md` §6, Tier 3.

## Where the dates come from

GitHub issues have no start or due date, so each bar's dates are resolved by falling through a chain. The first match wins. Lengths are counted in **working days (Monday to Friday)**, and Start and End both count — a task from Oct 1 to Oct 1 is one day.

**Start date**

1. An issue **date field** named `Start` (configurable, matched case-insensitively). Issue fields are organisation-level, so personal repositories have none — the rest of the chain always works.
2. The resolved due date minus **Days**, in working days.
3. The resolved due date minus the default task length.
4. The issue's creation date, which always exists.

**Due date**

1. An issue **date field** named `End` (configurable).
2. The **Start** field plus **Days**, in working days.
3. The milestone's due date.
4. The start date plus the default task length (1 working day by default, so the End is the Start).

**Days** is an issue field named `Days` (configurable) of type **Number**, holding the working days of effort a task needs — `0.5`, `3`, `20`, whatever your team's sizing is. Start–End and Days are meant to agree: a span of N working days matches a Days of N (a part day counts as the whole day, so 2.5 matches three). When Start and End are both set and do not match Days, in either direction, the bar turns amber and the panel says so, e.g. "Start–End gives 3 working days; Days is set to 5." That is a warning, not a block: the tool cannot see everything — shared or part-time work, say — so the user decides. GitHub itself never checks this, so the warning also catches dates changed in GitHub. A single-select field of that name is shown but not calculated with.

Clicking a bar selects it and shows its start, end, Days and blockers in a panel at the top right of the chart, with a link to the issue in GitHub. Start, End and Days can be changed there and saved to the issue's fields. Length shows the working days between Start and End. **When an issue has both a Start and an End field but no Days, opening it fills in Days from Start–End and saves it straight away**; the panel says it did. A Days value that is already there is never overwritten automatically. Whenever the three disagree — as loaded, or after you change any of them — the panel offers **Set Days from Start–End**, **Set End from Days** and **Set Start from Days**; each fills its box and waits for Save, and Save becomes **Save anyway** while they still disagree. Only a value you changed is written, so a date shown from the milestone or the creation date is never copied into a field by accident. A date is read-only when the repository has no date field of that name, or you cannot set fields on the issue.

Field names, the default task length and the page size are all editable in the app's Settings window (the gear icon in the header) and are remembered in local storage. Dates that cannot be parsed are ignored and reported on the bar rather than guessed at; a due date falling before its start is corrected and flagged.

## Dependencies

An issue's `blocked by` links become finish-to-start arrows: from the right end of the blocker to the start of the blocked issue. When the blocked issue starts before its blocker ends, the arrow runs back along the gap between the rows so it still points into the start.

The detail panel lists both directions — **Blocked by** and **Blocks** — and can change them. **+ Add blocker** / **+ Add blocked issue** opens a picker over the issues already loaded on the chart: type a number or part of a title, then pick with the mouse or the arrow keys and Enter. It makes no requests while you type. Issues that would create a circular dependency are shown greyed out with the reason. Removing a link asks you to confirm first.

To link an issue that is not on the chart — a Task or Bug when the board shows Features, say — type `#123`, `owner/repo#123`, or paste its issue URL, and choose **Look up …**. That fetches the one issue (a single request, only when you choose it), shows it, and links it when you pick it. Pull requests cannot be picked. A looked-up issue's own links count when checking for loops.

Some edges cannot be drawn: `blocked by` can name a closed issue, an issue in another repository, or one that has not been paged in yet. Those are dropped and counted in a notice rather than breaking the chart — load more issues and the ones that were merely unloaded turn into real arrows. Circular dependencies are detected, one edge is dropped to break the loop, and that too is reported.

## Documentation

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Target architecture, stack, data flow and locked design decisions. |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The phased build plan and its acceptance criteria. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is planned next, later features, and what has shipped. |

## Prior art

Designed after reviewing [GanttLab](https://gitlab.com/ganttlab/ganttlab) (Apache-2.0), which solves a similar problem for GitHub and GitLab. This is not a fork and contains none of its code. See ARCHITECTURE.md §2 for the attribution rules if that ever changes.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE).
