# Architecture

**Project:** `gh-gantt` — a browser-hosted Gantt chart for GitHub issues.
**Status:** Design agreed, not yet implemented.
**Last verified:** 2026-09-17 (all API shapes and package versions in this document were checked against live sources on that date).

---

## 1. What this is

A **static, browser-only single-page application** that reads issues from GitHub and renders them as a Gantt chart with dependency arrows.

### Scope decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| Issue sources | **GitHub only** | No GitLab adapter. A `IssueSource` port still exists so one could be added, but do not build it. |
| Direction | **Read, plus date and blocker edits** (changed 2026-09-23; was read-only) | Writes are `setIssueFieldValue` on an issue's Start/End date fields, and `addBlockedBy` / `removeBlockedBy` for blocking links, all from the detail panel. No optimistic UI: the panel waits for GitHub and swaps in the issues as returned (both sides of a link). Date writes set absolute values and links are idempotent, so no conflict handling is needed yet. A new link is refused before any request if the loaded tasks show it would close a loop (`wouldCreateCycle`). |
| Hosting | **Static files, no backend** | No server to hold secrets. This constrains authentication (see §6). |
| Deployment | Any static host (GitHub Pages, Netlify, Vercel static) | Build output is plain `index.html` + assets. |
| Browser target | **Chrome / Chromium only, for now** | Other browsers are expected later, so do not build foundations on Chromium-only APIs. See §6. |

### Explicit non-goals

Do **not** build these. If a task seems to require one, stop and ask.

- Editing issues, dates, or dependencies from the chart
- Server-side rendering, API routes, or any backend process
- Critical-path calculation or auto-scheduling
- Resource management or capacity planning
- Multi-repository or cross-org aggregated views (v1 is one repository at a time)
- User accounts, sessions, or a database

---

## 2. Relationship to the `ganttlab` repo

This project was designed after reviewing [GanttLab](https://gitlab.com/ganttlab/ganttlab), which is Apache-2.0 licensed. We are **not** forking it.

- GanttLab is **reference material**. Read it for how it handles the GitHub REST API and its view/strategy layering.
- If any file is copied, it must retain the Apache-2.0 copyright header and add a note stating it was modified. Record every such file in `docs/THIRD_PARTY.md`.
- The name "GanttLab" is **not** licensed to us. Do not use it anywhere in this project.
- As of this writing, **no GanttLab code has been copied.** The design below diverges enough (GraphQL-first, cursor pagination, dependency graph) that direct reuse was judged not worthwhile.

---

## 3. Technology stack

All versions verified against the npm registry on 2026-09-17. **Re-check before installing** — several of these move fast.

| Concern | Choice | Version at verification | Why |
|---|---|---|---|
| Framework | Vue 3 | 3.5.43 | Mature, good TS support, small runtime |
| Build tool | Vite | 8.3.0 | Current standard; `vue-cli` is dead |
| Vue plugin | `@vitejs/plugin-vue` | 6.0.9 | Required by Vite for SFCs |
| Language | TypeScript | 7.0.2 | Strict mode, non-negotiable |
| Type-check | `vue-tsc` | 3.3.11 | `tsc` alone cannot check `.vue` files |
| State | Pinia | 4.0.3 | Official Vue store; Vuex is maintenance-only |
| Styling | Tailwind CSS | 4.3.3 | v4 uses **CSS-first config** — no `tailwind.config.js` |
| Gantt rendering | `frappe-gantt` | 1.2.2 | MIT, zero dependencies, ~0.24 MB, draws dependency arrows |
| Dates | `date-fns` | latest | Tree-shakeable; do **not** use `moment` |
| HTTP | native `fetch` | — | No axios. One POST endpoint is all we need. |

### Versions actually installed (Phase 0, 2026-09-17)

Recorded so later phases know what the code was written against:

`vue` 3.5.43 · `vite` 8.3.0 · `@vitejs/plugin-vue` 6.0.9 · `typescript` **6.0.3** · `vue-tsc` 3.3.11 · `pinia` 4.0.3 · `tailwindcss` / `@tailwindcss/vite` 4.3.3 · `frappe-gantt` **1.2.2** · `date-fns` 4.4.0 · `vitest` 5.0.1 · `eslint` 10.10.0 · `typescript-eslint` 8.70.0 · `eslint-plugin-vue` 10.11.0 · Node 24.18.0

Two notes:

- **TypeScript resolved to 6.0.3, not the 7.0.2 in the table above.** The `vue-ts` Vite template pins `~6.0.2`. Nothing in this design depends on a 7.x feature, so it was left alone.
- **`frappe-gantt` resolved to exactly 1.2.2**, the version §8 was read from, so the API contract there stands verified.

### Libraries deliberately rejected

- **Apollo Client / urql** — a normalized cache we do not need. GraphQL is one `POST` with a JSON body; Pinia already owns state. Adds 30–50 kB gzipped plus the `graphql` package (~40 kB) for zero benefit here.
- **dhtmlx-gantt** — MIT and excellent, but ~6.3 MB unpacked. Its advantages (inline editing, drag-to-reschedule) are all write features we explicitly don't want. Revisit only if read-only changes.
- **gantt-task-react** — abandoned since July 2022.
- **SVAR / `wx-react-gantt`** — npm metadata says GPLv3, which would force us to relicense. React-only regardless.
- **d3** — only needed if hand-rolling the chart. `frappe-gantt` makes that unnecessary.

---

## 4. Layering

A single npm package with enforced directory boundaries. **No monorepo, no lerna** — one source is not worth four packages.

```
src/
  domain/        Pure TypeScript. No I/O, no framework, no GitHub types.
  ports/         Interfaces the domain depends on. No implementations.
  adapters/      Implementations of ports. All I/O lives here.
  app/           Pinia stores. Orchestration between adapters and UI.
  ui/            Vue components. No fetch calls, no GitHub types.
```

### The dependency rule

Dependencies point **inward only**:

```
ui  →  app  →  ports  →  domain
              ↑
        adapters (implement ports)
```

Concretely, these must always be true:

- `domain/` imports nothing from `adapters/`, `app/`, `ui/`, or any npm package except `date-fns`.
- `ui/` never imports from `adapters/`. It talks to Pinia stores only.
- GitHub-shaped types (`GitHubIssueNode`, raw GraphQL responses) never escape `adapters/github/`. They are mapped to domain types at the adapter boundary.
- If a component needs data, it reads a store. It does not fetch.

A lint rule enforces this (see Implementation Plan, Phase 0).

### Full tree

```
src/
  domain/
    Task.ts              Task type + TaskId
    TaskGraph.ts         Tasks + dependency edges, cycle detection
    dateResolution.ts    The date-resolution chain (§5)
  ports/
    IssueSource.ts       interface IssueSource { fetchPage(...) }
  adapters/
    github/
      GitHubClient.ts        POST to /graphql, error handling, rate limits
      GitHubIssueSource.ts   implements IssueSource
      queries/boardIssues.graphql
      types.ts               Raw response types. Never leave this folder.
      mapIssue.ts            GitHubIssueNode -> domain Task
    storage/
      TokenStore.ts          Token persistence + its security policy (§6)
  app/
    stores/
      auth.ts
      board.ts
      settings.ts
  ui/
    App.vue
    views/ConnectView.vue, BoardView.vue
    components/GanttChart.vue, RepoPicker.vue, ErrorBanner.vue, TaskTooltip.vue
  main.ts
```

---

## 5. Data flow

### 5.1 Transport: GraphQL only

**Every GitHub read goes through one GraphQL POST to `https://api.github.com/graphql`.** No REST.

This was measured, not assumed. Against `frappe/gantt` on 2026-09-17:

| Approach | Requests | Rate-limit cost |
|---|---|---|
| REST (issues + per-issue dependencies) | 44 | 44 of 5,000/hr |
| **GraphQL (one query)** | **1** | **1 point of 5,000/hr** |

Fetching 43 issues *with* milestones, issue field values, and `blockedBy` edges cost **1 point**. The REST equivalent N+1s at one request per issue. GraphQL is ~44× cheaper here and gets faster as boards grow.

CORS was verified by preflight: `api.github.com/graphql` returns `access-control-allow-origin: *`, allows `POST`, and allows the `Authorization` header. **A browser can call it directly with no proxy.** This is what makes the no-backend design possible.

### 5.2 The query

This query is **verified working** — it was executed successfully against a live repository (last re-run 2026-09-23, after adding Effort, blocker details and dropping `body`). Use it as-is.

```graphql
query BoardIssues($owner: String!, $repo: String!, $first: Int!, $after: String, $type: String) {
  repository(owner: $owner, name: $repo) {
    # A null $type means no type filter.
    issues(first: $first, after: $after, states: OPEN, filterBy: {type: $type},
           orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      totalCount
      nodes { ...BoardIssue }
    }
    issueTypes(first: 25) { nodes { name } }
  }
  rateLimit { cost limit remaining resetAt }
}

# Everything mapIssue reads. Shared by the board query and the date mutation,
# so an issue returned by a save maps exactly like one loaded by the board.
fragment BoardIssue on Issue {
  id
  number
  title
  url
  createdAt
  repository { nameWithOwner }
  viewerCanSetFields
  milestone { title dueOn }
  issueFieldValues(first: 20) {
    nodes {
      __typename
      ... on IssueFieldDateValue {
        value
        field { ... on IssueFieldDate { name } }
      }
      ... on IssueFieldNumberValue {
        numberValue: value
        field { ... on IssueFieldNumber { name } }
      }
      ... on IssueFieldSingleSelectValue {
        optionName: name
        field { ... on IssueFieldSingleSelect { name } }
      }
    }
  }
  blockedBy(first: 50) {
    nodes { id number title state repository { nameWithOwner } }
  }
  blocking(first: 50) {
    nodes { id number title state repository { nameWithOwner } }
  }
}
```

The fragment lives in `queries/boardIssue.fragment.graphql` and is appended to both the board query and the `SetIssueDates` mutation, so an issue returned by a save maps exactly like one loaded by the board. The `AddBlockedBy` / `RemoveBlockedBy` mutations use it too, for both `issue` and `blockingIssue`. The repository's date-field ids come from a separate `RepoDateFields` query (`repository.issueFields`), so a failure there turns editing off rather than breaking the chart.

Schema facts confirmed by introspection on 2026-09-17:

- `Issue.blockedBy` → `IssueConnection`, `Issue.blocking` → `IssueConnection`
- `Issue.issueFieldValues` → `IssueFieldValueConnection`
- `IssueFieldValue` is a **union**: `IssueFieldDateValue | IssueFieldTextValue | IssueFieldNumberValue | IssueFieldSingleSelectValue | IssueFieldMultiSelectValue`
- `IssueFieldDateValue` has `{ field: IssueFields, id: ID, value: String }` — note `value` is a **String**, not a Date
- `IssueFields` is a **union**: `IssueFieldDate | IssueFieldText | IssueFieldNumber | IssueFieldSingleSelect | IssueFieldMultiSelect`
- `Milestone.dueOn` (camelCase — the REST API calls it `due_on`)
- `IssueFieldNumberValue.value` is a non-null **Float** and `IssueFieldSingleSelectValue` carries the chosen option as `name` (plus `value`, `color`, `optionId`). GraphQL rejects one response key with different types across fragments, so the query aliases them to `numberValue` and `optionName`. (Re-checked 2026-09-23.)
- `IssueFilters` (the `issues(filterBy:)` argument) accepts `type`, `labels`, `milestone` and `issueFieldValues`. An `IssueFieldValueFilter` matches a date field by **exact** `dateValue` only — there is no range filter. (Re-checked 2026-09-23.)
- Write mutations exist for later: `setIssueFieldValue`, `addBlockedBy`, `removeBlockedBy`. (Re-checked 2026-09-23.)

Always request `rateLimit` so budget can be surfaced in the UI.

### 5.3 Date resolution chain

A Gantt bar needs a start and an end. GitHub issues have **no native start/due fields**, so dates are resolved by falling through this chain. First match wins, evaluated per issue.

**Start date:**
1. `issueFieldValues` — a `IssueFieldDateValue` whose `field.name` matches the configured start-field name (default `"Start"`, case-insensitive)
2. **The resolved due date** minus the configured default duration — *only if* a due date was found and no start was. (§5.3 originally named `milestone.dueOn` here specifically. Phase 2 widened it to whichever due date won, because the narrow rule mangles a real case: an issue with an explicit due date, no start, and a later milestone took its start from the milestone, landed *after* its own due date, and had that explicit due date overwritten by the due-before-start clamp. When the milestone is the only due source the two rules agree.)
3. `createdAt` — guaranteed to exist, so a start date is always produced

**Due date:**
1. `issueFieldValues` — a date field matching the configured due-field name (default `"End"`)
2. `milestone.dueOn`
3. Start date + `defaultTaskDays` (default 1)

Body lines (`GanttStart:` / `GanttDue:`, a GanttLab convention) were a rung on both chains until 2026-09-23. They were removed as fragile once organisation issue fields were in place: free text in a body is easy to break by accident and awkward to write back to.

Notes for the implementer:

- **Issue fields are organisation-level.** A personal-account repo returns an empty `issueFieldValues` list. The later steps must therefore always work. Never assume step 1 produces anything.
- `IssueFieldDateValue.value` is a **String**. Parse it and reject invalid dates — never let `Invalid Date` reach the chart.
- If due < start after resolution, clamp due to start + `defaultTaskDays` and record a warning on the task. Do not throw.
- **Format dates in local time, not with `toISOString()`.** A date-only string like `2026-04-20` parses to local midnight, so `toISOString().slice(0,10)` reports the previous day anywhere east of UTC. Use `date-fns`' `format(date, 'yyyy-MM-dd')` everywhere a date becomes a string, including the strings handed to `frappe-gantt`.

### 5.4 Dependencies

`blockedBy` gives the edges: if issue A is blocked by issue B, then **B must finish before A can start**, so the arrow points B → A.

Three problems the implementer must handle explicitly:

1. **Dangling edges.** `blockedBy` can reference issues that are closed, in another repository, or simply not in the loaded page. An edge whose target is not in the current task set **must be dropped** before handing data to `frappe-gantt`, which will otherwise misrender or throw. This is the single most likely source of bugs in this feature.
2. **Cycles.** GitHub does not guarantee an acyclic dependency graph. Run cycle detection (DFS with a colour marking) in `TaskGraph.ts`. On detecting a cycle, drop the edge that closes it and surface a non-fatal warning. Never recurse without a visited set.
3. **Fan-out cap.** The query requests `blockedBy(first: 50)`. GitHub's own limit is 50 per relationship type, so this is complete — but do not raise the number and assume more.

---

## 6. Authentication and token security

This is the sharpest constraint of a no-backend design, and it must not be glossed over.

### Mechanism

The user supplies a **GitHub Personal Access Token**, pasted into the app. Standard OAuth authorization-code flow is impossible without a server to hold the client secret.

**Required scopes (fine-grained token, strongly preferred):**
- Repository → Issues: **Read and write** to save dates, or **Read-only** to view only
- Repository → Metadata: **Read-only**

That is all. `Issue.viewerCanSetFields` reflects the *user's* rights, not the token's: a read-only token still reports `true` and only fails on save (FORBIDDEN, surfaced as `AuthError`). The save path therefore catches that and explains it in the panel, and must never treat it as a dead connection. If a classic token is used, `public_repo` covers public repositories and `repo` is needed for private ones — `repo` is far broader than we need, so recommend fine-grained tokens in the UI.

### Storage policy

A token in browser storage is readable by any successful XSS. There is no way to eliminate that without a backend, so the design mitigates in tiers rather than pretending otherwise.

**Tier 1 — password-manager compatibility (build in Phase 1).**

Mark the connect form up so the browser's own password manager, and third-party managers (1Password, Bitwarden, iCloud Keychain), recognise it and offer to save the token:

- a real `<form>` element, not a bare div
- a text input with `autocomplete="username"` holding the GitHub login or a user-chosen label
- the token input as `<input type="password" autocomplete="current-password">`
- a genuine submit handler — never auto-submit on paste

This costs nothing and is the single best return on effort. The token then lives in the password manager's vault rather than in our origin's storage, so an XSS firing on page load finds nothing to steal.

Be precise about the limit of that benefit: **once a value is autofilled into the DOM, script on the page can read it.** The gain is at rest, not in-session. So do not auto-fill and auto-submit silently; require the user's explicit action.

**Tier 2 — the "remember me" path.**

Default persistence stays **in-memory + `sessionStorage`**; the token dies with the tab. If persistence is offered, prefer the encrypted option below over storing a bare token.

**Tier 3 — WebAuthn PRF encryption. BUILT in Phase 6 — see the note at the end of this tier.**

The strongest option available to a backend-less app. Use the WebAuthn `prf` extension to derive a symmetric key from a passkey, encrypt the token with AES-GCM via WebCrypto, and store **only the ciphertext** in IndexedDB. MDN names this exact use case: deriving "a symmetric key for encrypting sensitive data... that can only be decrypted by a user who has the seed and the associated authenticator."

Why this is genuinely stronger: the key is never in storage, and decryption needs a fresh user-verification gesture. An XSS cannot silently exfiltrate the token — it would have to trigger a biometric or PIN prompt the user can see.

Support for `prf` varies by browser *and* by authenticator (fewer authenticators support PRF at credential-creation time than at assertion time). **Feature-detect at runtime and fall back to session-only.** Never assume availability.

**Status as built (Phase 6):** implemented in `adapters/storage/PasskeyCipher.ts`, and it is now the *only* way a token persists — the plaintext IndexedDB option was removed rather than kept as a fallback. If a passkey cannot do the job, the app stays session-only and says so; it never silently downgrades to plaintext at rest.

How it goes together:

- Enrolment creates a discoverable credential with `extensions: { prf: { eval: { first: salt } } }`. Where the authenticator returns a PRF result at creation, that is the key and enrolment costs one prompt. Where it returns only `enabled`, the key has to come from an assertion — and that assertion is **not** fired straight after creation: browsers reject a second prompt without a fresh user gesture, surfacing as `NotAllowedError` ("dismissed") on a prompt the user never saw. The passkey is held pending in memory and a "Use passkey" button makes the assertion on its own click; a dismissed retry reuses the same passkey rather than creating another.
- The PRF output is run through HKDF-SHA-256 with a per-record 32-byte salt and a fixed `info` string, so the same passkey used elsewhere yields a different key. The AES-GCM key is non-extractable.
- Only `{ credentialId, salt, iv, ciphertext }` reaches IndexedDB.
- Unlocking is behind an explicit "Unlock with passkey" button. `restore()` deliberately does **not** decrypt on page load: that would mean a biometric prompt nobody asked for, and the whole point of this tier is that the gesture is visible.
- Every failure is classified (`unsupported` / `declined` / `no-prf` / `failed`) so the UI can say what happened, and no message can carry the token.

**One portability trap worth recording.** Do not test a buffer from WebAuthn or WebCrypto with `instanceof ArrayBuffer`. Those values can arrive from another realm, where `instanceof` is `false` for a perfectly good ArrayBuffer — the code then takes a wrong branch and fails on a property that does not exist. `ArrayBuffer.isView()` and the `Uint8Array` constructor inspect internal slots instead and work across realms.

**Rules that hold regardless of tier:**

- Never use `localStorage` for the token. Settings only.
- Never put the token in a URL, query string, or fragment.
- Never log the token; redact it from every error path and console output.
- Link to GitHub's fine-grained token page, state the minimal scopes, recommend an expiry of 90 days or less.
- Provide a visible "disconnect" that clears memory, `sessionStorage`, and IndexedDB.

### The Credential Management API, under a Chrome-only target

`navigator.credentials` with `PasswordCredential` is **Chromium-only** — MDN classifies it "Not Baseline — Limited Availability" and still marks it experimental. Targeting Chrome removes the portability objection, but it does **not** promote this to the foundation, for two reasons:

1. The stated plan is to expand to other browsers later. Anything built on a Chromium-only API has to be torn out at that point.
2. It is still experimental, with no other engine shipping it. Chrome could deprecate it.

**Rule:** Tier 1 form markup is the primary mechanism and must work on its own. `PasswordCredential` may be added as *pure progressive enhancement* behind a feature check — its real benefit is `navigator.credentials.get()` for silent re-auth on return visits — but the app must be fully usable with it absent.

### Error handling

GraphQL returns **HTTP 200 with an `errors` array** for query-level failures. A naive client that only checks `response.ok` will treat a failed query as success and hand `null` data downstream. `GitHubClient` **must** check `body.errors` on every response before touching `body.data`. Map `UNAUTHORIZED`/`FORBIDDEN` to a "reconnect" state; map `RATE_LIMITED` to a message showing `rateLimit.resetAt`.

---

## 7. Pagination

GraphQL connections are **cursor-based**: `pageInfo { hasNextPage endCursor }`. There are no page numbers, no random access, and **no "jump to last page"**.

Design the UI around this from the start:

- Use **"Load more"** or infinite scroll, not numbered pagination.
- `totalCount` is available for a progress indicator ("showing 43 of 210").
- The board store accumulates tasks across pages into a single array. Dependency edges are re-resolved against the **full accumulated set** after each page load, because a page can introduce the target of a previously dangling edge.

Do not attempt to emulate page numbers on top of cursors.

---

## 8. Rendering

`frappe-gantt` is vanilla JS rendering into a DOM element, wrapped in one Vue component: `ui/components/GanttChart.vue`.

### Verified API facts

Everything below was read from the **source of `frappe-gantt@1.2.2`**, not from memory or blog posts. Trust this section over anything found online.

**Constructor:** `new Gantt(wrapper, tasks, options)` — `wrapper` may be a CSS selector string, an `HTMLElement`, or an `SVGElement`.

**Task object shape** (note the field names differ from our domain type):

```js
{ id: '1', name: 'Redesign website', start: '2016-12-28', end: '2016-12-31', progress: 20, dependencies: [] }
```

| Domain `Task` | frappe field |
|---|---|
| `id` | `id` |
| `title` | **`name`** |
| `start` | `start` |
| `due` | **`end`** |
| `dependsOn` | `dependencies` |

**Options are `snake_case`**: `view_mode`, `bar_height`, `column_width`, `arrow_curve`, `container_height`, `infinite_padding`, `readonly`.

**Valid `view_mode` strings** (exact): `'Hour'`, `'Quarter Day'`, `'Half Day'`, `'Day'`, `'Week'`, `'Month'`, `'Year'`.

**`dependencies` accepts an array or a comma-separated string.** Source normalises strings to arrays. **Pass an array.**

### Four traps, all confirmed in source

1. **The library mutates the task objects you pass it.** It assigns `task._start`, `task._end`, `task._index`, overwrites `task.dependencies`, and rewrites `task.id`. Passing domain objects or Vue reactive proxies directly **will corrupt store state**. Always pass freshly built plain objects — deep copies, not references into the store.
2. **The README's refresh example is wrong.** It shows `gantt.tasks.refresh()`. The actual instance method is **`gantt.refresh(tasks)`** (`src/index.js:233`). Following the README means the chart silently never updates.
3. **Invalid tasks are dropped silently.** A task with no `end`, with `start` after `end`, or spanning more than ten years is `console.error`-ed and filtered out — no exception, the bar just vanishes. Our domain layer guarantees valid dates, which is the defence; do not weaken it.
4. **Ids are rewritten**: `id.replaceAll(' ', '_')`, applied to dependency ids too. GitHub node ids contain no spaces so this is safe, but never introduce ids with spaces.

### TypeScript

`frappe-gantt` ships **no type declarations** (`types` is absent from its `package.json`).

**Do not install `@types/frappe-gantt`.** It is stuck at 0.9.0 against a 1.2.2 library and describes a different, older API. It will typecheck cleanly and be wrong at runtime — the worst possible failure mode.

Write a local declaration at `src/types/frappe-gantt.d.ts` covering only what we use.

### Wrapper component rules

- Props in, nothing out. Hold the instance in **`shallowRef`, never `ref`** — deep reactivity over a library that mutates its own internals destroys performance.
- Import the stylesheet from `frappe-gantt/dist/frappe-gantt.css`. **Caveat found in Phase 0:** the package's `exports` map declares only `"."` (with `require` / `import` / `style` conditions) and no subpath, so a bare deep import of the CSS can fail to resolve. If it does, alias it in `vite.config.ts` or import via an explicit relative path — do not vendor a copy of the stylesheet.
- Handle the empty-array case **before** constructing; frappe does not handle zero tasks gracefully.
- Call `clear()` and drop the instance in `onBeforeUnmount`.
- Bar click opens `task.url` with `target="_blank"` and `rel="noopener noreferrer"`.
- Set `readonly: true` in options. Dates are edited in the detail panel, not by dragging bars; dragging is a later step (backlog).

## 9. Testing

- **Vitest** for unit tests. The `domain/` layer is pure and must reach high coverage — it holds every rule that can silently produce a wrong chart.
- Mandatory test cases: each rung of the date-resolution chain; invalid/unparseable date strings; due-before-start clamping; dangling dependency edges; dependency cycles; empty `issueFieldValues`; a GraphQL 200-with-errors response.
- Store fixture JSON captured from real API responses under `test/fixtures/`. **Scrub tokens from fixtures.**
- No network access in unit tests. Mock at the `IssueSource` port.

---

## 10. Decisions to revisit later

Recorded so they are not silently re-litigated:

- **Projects v2 field values** (`Issue.projectItems`) as a date source. Deferred — issue fields cover the org case more simply. Add as a fifth rung if users ask.
- **Sub-issues** (`Issue.subIssues`, `Issue.parent`) for hierarchical summary tasks. Deferred to a later phase; `frappe-gantt` support needs checking first.
- **dhtmlx-gantt migration**, required only if read-only ever changes.
- **Device flow authentication** instead of pasted PATs. Worth investigating — it needs no client secret — but its token endpoint's CORS behaviour must be verified before committing.
