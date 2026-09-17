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
| Direction | **Read-only** | The app never writes to GitHub. No mutations, no write token scopes, no optimistic UI, no conflict handling. |
| Hosting | **Static files, no backend** | No server to hold secrets. This constrains authentication (see §6). |
| Deployment | Any static host (GitHub Pages, Netlify, Vercel static) | Build output is plain `index.html` + assets. |

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
    bodyDates.ts         Parse "GanttStart:" / "GanttDue:" from issue body
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

This query is **verified working** — it was executed successfully against a live repository. Use it as-is.

```graphql
query BoardIssues($owner: String!, $repo: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: $first, after: $after, states: OPEN,
           orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      totalCount
      nodes {
        id
        number
        title
        url
        createdAt
        body
        milestone { title dueOn }
        issueFieldValues(first: 20) {
          nodes {
            __typename
            ... on IssueFieldDateValue {
              value
              field { ... on IssueFieldDate { name } }
            }
          }
        }
        blockedBy(first: 50) { nodes { id number } }
      }
    }
  }
  rateLimit { cost remaining resetAt }
}
```

Schema facts confirmed by introspection on 2026-09-17:

- `Issue.blockedBy` → `IssueConnection`, `Issue.blocking` → `IssueConnection`
- `Issue.issueFieldValues` → `IssueFieldValueConnection`
- `IssueFieldValue` is a **union**: `IssueFieldDateValue | IssueFieldTextValue | IssueFieldNumberValue | IssueFieldSingleSelectValue | IssueFieldMultiSelectValue`
- `IssueFieldDateValue` has `{ field: IssueFields, id: ID, value: String }` — note `value` is a **String**, not a Date
- `IssueFields` is a **union**: `IssueFieldDate | IssueFieldText | IssueFieldNumber | IssueFieldSingleSelect | IssueFieldMultiSelect`
- `Milestone.dueOn` (camelCase — the REST API calls it `due_on`)

Always request `rateLimit` so budget can be surfaced in the UI.

### 5.3 Date resolution chain

A Gantt bar needs a start and an end. GitHub issues have **no native start/due fields**, so dates are resolved by falling through this chain. First match wins, evaluated per issue.

**Start date:**
1. `issueFieldValues` — a `IssueFieldDateValue` whose `field.name` matches the configured start-field name (default `"Start date"`, case-insensitive)
2. Body text — a line beginning `GanttStart:` followed by an ISO 8601 date
3. `milestone.dueOn` minus the configured default duration — *only if* a due date was found and no start was
4. `createdAt` — guaranteed to exist, so a start date is always produced

**Due date:**
1. `issueFieldValues` — a date field matching the configured due-field name (default `"Target date"`)
2. Body text — a line beginning `GanttDue:`
3. `milestone.dueOn`
4. Start date + `defaultTaskDays` (default 1)

Notes for the implementer:

- **Issue fields are organisation-level.** A personal-account repo returns an empty `issueFieldValues` list. Steps 2–4 must therefore always work. Never assume step 1 produces anything.
- The `GanttStart:`/`GanttDue:` body convention is inherited from GanttLab so existing users' issues keep working. The prefixes are configurable.
- `IssueFieldDateValue.value` is a **String**. Parse it and reject invalid dates — never let `Invalid Date` reach the chart.
- If due < start after resolution, clamp due to start + `defaultTaskDays` and record a warning on the task. Do not throw.

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
- Repository → Issues: **Read-only**
- Repository → Metadata: **Read-only**

That is all. If a classic token is used, `public_repo` covers public repositories and `repo` is needed for private ones — `repo` is far broader than we need, so recommend fine-grained tokens in the UI.

### Storage policy

A token in browser storage is readable by any successful XSS. There is no way around this without a backend, so mitigate rather than pretend:

- **Default: in-memory + `sessionStorage`.** The token dies when the tab closes.
- **Opt-in only:** a "remember this token" checkbox persists to IndexedDB. It must be off by default and carry a plain-language warning.
- Never place the token in a URL, query string, or `localStorage`.
- Never log the token. Redact it from all error output, including anything sent to a console.
- The UI must link to GitHub's token-creation page pre-filled with minimal scopes, and must state the recommended expiry (90 days or less).
- Provide a visible "disconnect" control that clears memory, `sessionStorage`, and IndexedDB.

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

`frappe-gantt` is a vanilla JS library that renders into a DOM element. Wrap it in a single Vue component, `ui/components/GanttChart.vue`.

Rules for that wrapper:

- It receives domain `Task[]` as a prop and maps them to frappe's shape inside the component.
- It owns the frappe instance in a `shallowRef` — **not** `ref`. Deep reactivity over a library instance that mutates its own internals causes performance collapse and subtle bugs.
- It must call the library's cleanup on `onBeforeUnmount` and re-render on prop change.
- Every task handed to frappe needs a **stable, unique `id`**. Use the GitHub node `id`. This is the field GanttLab's chart layer discarded, which is precisely why it could never draw dependencies.
- Dependencies are passed as the ids of prerequisite tasks. Validate that every referenced id exists in the same array first (see §5.4).

---

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
