# Implementation Plan

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first. This document assumes its decisions and does not repeat the reasoning.

## How to use this plan

- Phases are **strictly sequential**. Do not start a phase until the previous one's acceptance criteria all pass.
- Every phase ends with a **commit**. Keep commits inside phase boundaries.
- Acceptance criteria are checked with **commands that must exit 0**. If a command fails, fix it before moving on. Do not disable a check to make it pass.
- Where a file's contents are given, use them. Where only a signature is given, implement it to match.

## Stop and ask the user if

- A verification command in a phase fails twice and the cause is not obvious.
- An API response does not match the shape in ARCHITECTURE.md §5.2 (the schema changed).
- A phase seems to require writing to GitHub, a backend, or a server process.
- A dependency you are about to install has a **GPL** or **AGPL** licence.
- You are about to copy code from the `ganttlab` repo (attribution rules apply — see ARCHITECTURE.md §2).

## Global guardrails

- **Never commit a token.** Not in code, tests, fixtures, or docs. `.env*` is gitignored from Phase 0.
- **TypeScript strict mode stays on.** Never add `any` to silence an error; type it properly.
- **No `npm install --force` / `--legacy-peer-deps`.** If peers conflict, stop and ask.
- Run `npm run verify` before every commit.

---

# Phase 0 — Scaffold and tooling

**Goal:** An empty but fully wired Vue 3 + Vite + TS project that builds, lints, type-checks, and tests clean.

### Steps

1. Scaffold in the existing repo directory (`~/dev/gh-gantt`, already `git init`-ed on `main`):

```bash
cd ~/dev/gh-gantt && npm create vite@latest . -- --template vue-ts
```

2. Install dependencies. **Check the resolved versions afterwards** — the versions in ARCHITECTURE.md §3 were correct on 2026-09-17 but move fast.

```bash
npm install && npm install pinia date-fns frappe-gantt && npm install -D tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 eslint vue-tsc
```

3. Configure Tailwind v4. **v4 uses CSS-first config — do not create `tailwind.config.js`; it will be ignored.** Two edits only:

`src/style.css` — first line:
```css
@import "tailwindcss";
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
```

3b. **Importing the `.graphql` file.** Vite does not handle `.graphql` natively. Do **not** add a GraphQL plugin. Import it as a raw string with Vite's `?raw` suffix:

```ts
import boardIssuesQuery from './queries/boardIssues.graphql?raw'
```

Add this to `src/vite-env.d.ts` so TypeScript accepts it:
```ts
declare module '*.graphql?raw' {
  const src: string
  export default src
}
```

3c. **Node version.** Use Node 22 LTS or newer (Vite 8 requires a modern Node). Record it in `.nvmrc` and in `engines` in `package.json`.

4. Create the directory skeleton with a `.gitkeep` in each:

```bash
cd ~/dev/gh-gantt && mkdir -p src/{domain,ports,adapters/github/queries,adapters/storage,app/stores,ui/views,ui/components} test/fixtures && find src test -type d -empty -exec touch {}/.gitkeep \;
```

5. Add the **dependency-rule lint**. This is what keeps the layering honest; without it the boundaries rot within a week. ESLint 9 uses **flat config** — create `eslint.config.js` (not `.eslintrc`):

```js
import js from '@eslint/js'

const restrict = (patterns) => ({
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

export default [
  js.configs.recommended,
  {
    files: ['src/domain/**/*.ts'],
    ...restrict(['**/adapters/**', '**/app/**', '**/ui/**', 'vue', 'pinia']),
  },
  {
    files: ['src/ui/**/*.{ts,vue}'],
    ...restrict(['**/adapters/**']),
  },
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/adapters/github/**'],
    ...restrict(['**/adapters/github/types*']),
  },
]
```

**The snippet above has a real bug — read this before copying it.** All three blocks match `src/domain/**/*.ts`, and ESLint does **not** merge `no-restricted-imports` across blocks: the last matching block wins outright, so the domain and ui restrictions are silently replaced by the third block's and never fire. Order the blocks general -> specific and repeat every applicable pattern in each. See `eslint.config.js` for the working version.

**This snippet specifies the layering rules only, not the full parser setup.** To lint `.ts` and `.vue` files you must also wire in `typescript-eslint` and `eslint-plugin-vue` (install both, spread their flat configs before the blocks above, and make sure the `.vue` parser is set so `<script setup lang="ts">` parses). Expect some iteration here — it is the one step in Phase 0 that commonly needs adjusting. The acceptance criterion below is what proves you got it right.

Verify the rule actually bites before moving on: temporarily add `import { GitHubClient } from '../adapters/github/GitHubClient'` to a file in `src/domain/`, confirm `npm run lint` **fails**, then remove it.

6. Add scripts to `package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vue-tsc --noEmit && vite build",
  "preview": "vite preview",
  "lint": "eslint src test --max-warnings 0",
  "typecheck": "vue-tsc --noEmit",
  "test": "vitest run",
  "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
}
```

6b. **Two scripts fail on an empty project.** `eslint src test` exits non-zero when `test/` holds only a `.gitkeep` (no lintable files), and `vitest run` exits 1 with zero test files. Landing one real test in Phase 0 (`test/smoke.test.ts`) fixes both without adding `--passWithNoTests` flags that would later hide a broken test run.

6c. **`eslint-plugin-vue`: use `flat/essential`, not `flat/recommended`.** The latter adds line-break formatting rules that fail under `--max-warnings 0` on any hand-written template.

7. Create `.gitignore` containing at least: `node_modules`, `dist`, `.env`, `.env.*`, `.DS_Store`, `coverage`.

8. Copy `docs/ARCHITECTURE.md` and this file into the repo if not already present, and write a short `README.md` pointing at both.

### Acceptance criteria

```bash
cd ~/dev/gh-gantt && npm run verify
```

- Exits 0.
- `git status --porcelain` shows no `node_modules` or `.env` entries.

### Commit

`chore: scaffold Vue 3 + Vite + TypeScript project`

---

# Phase 1 — GitHub client and authentication

**Goal:** Paste a token, prove it works, store it safely. No issue fetching yet.

### Files

**`src/adapters/github/GitHubClient.ts`**

```ts
export interface GraphQLResult<T> { data: T; rateLimit?: RateLimitInfo }
export interface RateLimitInfo { cost: number; remaining: number; resetAt: string }

export class GitHubClient {
  constructor(private getToken: () => string | null) {}
  async query<T>(query: string, variables: Record<string, unknown>): Promise<GraphQLResult<T>>
}
```

Implementation requirements — **all of these are mandatory**:

- `POST https://api.github.com/graphql` via native `fetch`, body `JSON.stringify({ query, variables })`.
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`.
  **Note:** the header value is `Bearer`, not `token`. GitHub's REST examples use `token`; GraphQL expects `Bearer`.
- **Check `body.errors` before `body.data`.** GraphQL returns **HTTP 200 with an `errors` array** on query failure. Checking only `response.ok` will silently pass `null` data downstream. This is the highest-risk bug in the whole client.
- Map error types to typed failures: `UNAUTHORIZED`/`FORBIDDEN` → `AuthError`; `RATE_LIMITED` → `RateLimitError` carrying `resetAt`; anything else → `GitHubError` with the messages joined.
- On HTTP 401, throw `AuthError`.
- **Redact the token from every thrown error and every log line.**

**`src/adapters/storage/TokenStore.ts`**

```ts
export type Persistence = 'session' | 'persistent'
export class TokenStore {
  get(): string | null
  set(token: string, persistence: Persistence): void
  clear(): void   // must clear memory, sessionStorage AND IndexedDB
}
```

- Default persistence is `'session'`. `'persistent'` (IndexedDB) is opt-in only.
- **Never** use `localStorage`. Never put the token in a URL.
- Wrap every storage read/write in `try/catch` — these throw in private-browsing modes.

**`src/app/stores/auth.ts`** — Pinia store holding `token`, `user`, `status` (`'disconnected' | 'connecting' | 'connected' | 'error'`), with `connect(token, persistence)` and `disconnect()`.

`connect()` validates the token with:

```graphql
query { viewer { login avatarUrl } rateLimit { remaining resetAt } }
```

**`src/ui/views/ConnectView.vue`** — the connect form. Its markup matters as much as its logic, because it is what makes the browser's password manager work (ARCHITECTURE.md §6, Tier 1). Build it as:

```html
<form @submit.prevent="onSubmit">
  <input type="text" name="username" autocomplete="username" v-model="label" />
  <input type="password" name="token" autocomplete="current-password" v-model="token" />
  <button type="submit">Connect</button>
</form>
```

Requirements:

- A **real `<form>` with a real submit button**. A div with a click handler will not trigger a save prompt in any password manager.
- Both inputs need the `autocomplete` values shown. Without `autocomplete="username"` on a companion field, most managers will not offer to save.
- The username field holds a user-chosen label or GitHub login — it is **not** used for authentication, only to make the credential findable in the vault.
- **Never auto-submit on paste or on autofill.** The user submits explicitly.
- Also include: a "remember this token" checkbox defaulting to **unchecked**, a link to GitHub's fine-grained token page, the required scopes in plain text (Issues: Read-only, Metadata: Read-only), an expiry recommendation, and an error area.

**Do not use `navigator.credentials` / `PasswordCredential`.** It is Chromium-only and MDN classifies it "Not Baseline — Limited Availability". See ARCHITECTURE.md §6.

### Acceptance criteria

- `npm run verify` exits 0.
- Manual: `npm run dev`, paste a valid token → the view shows your GitHub login and remaining rate limit.
- Manual: paste `ghp_invalid` → a readable error, no unhandled promise rejection in the console.
- Manual: with "remember" unchecked, close and reopen the tab → the app asks for the token again.
- Manual: submitting the form causes the browser (or your password manager) to offer to save the credential. If no prompt appears, the `autocomplete` attributes or the `<form>`/submit structure are wrong — fix the markup, do not work around it in JS.
- Unit test: a mocked 200 response containing `{errors:[{type:'RATE_LIMITED'}]}` causes `query()` to **throw `RateLimitError`**, not return.
- Grep check — must print nothing:

```bash
cd ~/dev/gh-gantt && grep -rn "localStorage" src/ || echo "clean"
```

### Commit

`feat: GitHub GraphQL client and token authentication`

---

# Phase 2 — Domain model and date resolution

**Goal:** Pure, fully tested business logic. **No network, no Vue, no GitHub types in this phase.**

This phase holds every rule that can silently produce a wrong chart. Test it hard.

### Files

**`src/domain/Task.ts`**

```ts
export type TaskId = string
export interface Task {
  id: TaskId
  number: number
  title: string
  url: string
  start: Date
  due: Date
  dependsOn: TaskId[]     // ids of tasks that must finish first
  warnings: string[]      // non-fatal issues, shown in the UI
}
```

**`src/domain/bodyDates.ts`**

```ts
export function parseBodyDates(
  body: string | null,
  cfg: { startPrefix: string; duePrefix: string }
): { start: Date | null; due: Date | null }
```

- Split on `\n`. A line matches only if it **starts with** the prefix (after trimming leading whitespace).
- Parse the remainder as ISO 8601. Reject anything producing `Invalid Date`.
- Handle `body` being `null` or empty — return `{start: null, due: null}`.
- Default prefixes: `GanttStart:` and `GanttDue:`.

**`src/domain/dateResolution.ts`**

```ts
export interface DateInputs {
  fieldStart: string | null    // raw string from a date field
  fieldDue: string | null
  bodyStart: Date | null
  bodyDue: Date | null
  milestoneDue: string | null
  createdAt: string
}
export interface ResolvedDates { start: Date; due: Date; warnings: string[] }
export function resolveDates(i: DateInputs, cfg: { defaultTaskDays: number }): ResolvedDates
```

Implement exactly the chain in ARCHITECTURE.md §5.3. Required behaviours:

- **Always returns a valid start and due.** It must never return `Invalid Date` and must never throw.
- Any string that fails to parse is treated as absent **and** appends a warning.
- If `due < start`, set `due = start + defaultTaskDays` and append a warning. Do not throw.
- All fallbacks lead to `createdAt`, which is always present.

**`src/domain/TaskGraph.ts`**

```ts
export function pruneDanglingEdges(tasks: Task[]): { tasks: Task[]; dropped: number }
export function detectAndBreakCycles(tasks: Task[]): { tasks: Task[]; brokenEdges: Array<[TaskId, TaskId]> }
```

- `pruneDanglingEdges`: remove any id in `dependsOn` that is not the `id` of a task in the same array. **This is required** — `blockedBy` routinely references closed issues, issues in other repositories, or issues on a page not yet loaded, and passing such an id to the chart library breaks rendering.
- `detectAndBreakCycles`: DFS with three-colour marking (white/grey/black). On finding a back edge, remove that edge and record it. **Must use a visited set** — a naive recursion will stack-overflow on a cycle.
- Both are pure: they return new arrays and do not mutate the input.

### Acceptance criteria

```bash
cd ~/dev/gh-gantt && npm run test -- --coverage
```

- `src/domain/**` line coverage ≥ 90%.
- Tests exist and pass for **every one of these**:
  - each rung of the start chain and the due chain fires when expected
  - field date wins over body date; body date wins over milestone; milestone wins over createdAt
  - a malformed date string (`"not-a-date"`, `""`) is ignored and produces a warning
  - due-before-start is clamped, with a warning
  - empty field list + null body + null milestone → still returns valid dates from `createdAt`
  - `pruneDanglingEdges` drops an edge to a non-existent id and reports the count
  - `detectAndBreakCycles` terminates on a 2-node cycle (A→B→A) and on a 3-node cycle
  - a self-referencing dependency (A→A) is removed
- Grep check — must print nothing:

```bash
cd ~/dev/gh-gantt && grep -rn "from 'vue'\|adapters/" src/domain/ || echo "clean"
```

### Commit

`feat: domain model, date resolution and dependency graph`

---

# Phase 3 — Fetch and map issues

**Goal:** Real issues from a real repository become domain `Task[]`. Still no chart.

### Files

**`src/adapters/github/queries/boardIssues.graphql`** — the query from ARCHITECTURE.md §5.2, **copied verbatim**. It has been verified against the live API; do not rewrite it from memory.

**`src/adapters/github/types.ts`** — types for the raw response. These must **not** be imported anywhere outside `src/adapters/github/`.

**`src/adapters/github/mapIssue.ts`**

```ts
export function mapIssue(node: GitHubIssueNode, cfg: MapConfig): Task
```

- Extract date fields from `issueFieldValues.nodes` by filtering on `__typename === 'IssueFieldDateValue'` and matching `field.name` **case-insensitively** against `cfg.startFieldName` / `cfg.dueFieldName`.
- **`IssueFieldDateValue.value` is a `String`**, not a date. Pass it to `resolveDates` as a raw string and let the domain parse it.
- `issueFieldValues.nodes` will be **empty for personal-account repositories** — issue fields are organisation-level. This is normal, not an error.
- Map `blockedBy.nodes[].id` into `dependsOn`.
- Delegate all date logic to `resolveDates`. **Put no date rules in this file.**

**`src/ports/IssueSource.ts`**

```ts
export interface IssuePage { tasks: Task[]; endCursor: string | null; hasNextPage: boolean; totalCount: number }
export interface IssueSource {
  fetchPage(repo: { owner: string; name: string }, cursor: string | null, pageSize: number): Promise<IssuePage>
}
```

**`src/adapters/github/GitHubIssueSource.ts`** — implements `IssueSource` using `GitHubClient` and `mapIssue`.

**`src/app/stores/board.ts`** — Pinia store holding `tasks`, `loading`, `error`, `cursor`, `hasNextPage`, `totalCount`, with `loadRepo(owner, name)` and `loadMore()`.

**Critical:** after each page loads, append the new tasks and then re-run `pruneDanglingEdges` and `detectAndBreakCycles` over the **entire accumulated array**, not just the new page. A later page can supply the target of an edge that dangled earlier.

**Do not write the pruned result back over the store's tasks.** Doing so deletes the very edge the next page would heal — it is gone from `dependsOn`, so it can never come back, and no unit test of a single page load will notice. Keep `tasks` exactly as mapped, with `dependsOn` as `blockedBy` gave it, and expose the pruned, cycle-broken set as a **derived** value recomputed from the whole array (`board.graph`). That also stops `detectAndBreakCycles` appending a duplicate cycle warning on every page load, and gives Phase 5 the dropped-edge count it needs.

**`src/ui/views/BoardView.vue`** — repo owner/name inputs, a "Load" button, and for now a **plain table** of resolved tasks (number, title, start, due, dependsOn count, warnings).

### Acceptance criteria

- `npm run verify` exits 0.
- Manual: load `frappe/gantt` → the table shows rows with plausible dates and `totalCount` matches the issue count on github.com.
- Manual: load a repo with no issues → an empty state, no crash.
- Manual: load a non-existent repo → a readable error, no crash.
- Unit test: `mapIssue` against a **captured real fixture** in `test/fixtures/` produces the expected `Task`. Capture it with the authenticated GitHub CLI (no token ends up in the file):

```bash
gh api graphql -F query=@src/adapters/github/queries/boardIssues.graphql -F owner=frappe -F repo=gantt -F first=5 > test/fixtures/boardIssues.frappe-gantt.json
```

  That capture proves the empty-issue-fields case and little else: every node in `frappe/gantt` has `issueFieldValues: []`, `milestone: null` and `blockedBy: []`. A second, clearly-labelled **synthetic** fixture is therefore required, and is the only cover for rung 1 of both date chains and for dependency mapping. It must include a mixed `issueFieldValues` union (a text or select value alongside the date ones — those carry neither `value` nor `field`), a date value whose `field` is `{}`, a `field.name` differing in case from the configured name, a `blockedBy` edge pointing outside the fixture's own nodes, and a non-null milestone.

  Check the file for any token-like string before committing it.
- Unit test: a node with `issueFieldValues.nodes: []` still maps to a task with valid dates.

### Commit

`feat: fetch and map GitHub issues into domain tasks`

---

# Phase 4 — Render the Gantt chart

**Goal:** The table becomes a chart. Dependencies still not drawn.

### Files

**`src/types/frappe-gantt.d.ts`** — the library ships **no types**. Write them locally:

```ts
declare module 'frappe-gantt' {
  export interface FrappeTask {
    id: string
    name: string
    start: string
    end: string
    progress: number
    dependencies: string[]
    custom_class?: string
  }
  export interface FrappeOptions {
    view_mode?: 'Hour' | 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month' | 'Year'
    readonly?: boolean
    bar_height?: number
    column_width?: number
    arrow_curve?: number
    infinite_padding?: boolean
    on_click?: (task: FrappeTask) => void
  }
  export default class Gantt {
    constructor(wrapper: string | HTMLElement | SVGElement, tasks: FrappeTask[], options?: FrappeOptions)
    refresh(tasks: FrappeTask[]): void
    change_view_mode(mode: string): void
    clear(): void
  }
}
```

**Do NOT run `npm install @types/frappe-gantt`.** That package is at 0.9.0 against a 1.2.2 library — it describes an older API, will typecheck cleanly, and will be wrong at runtime.

**`src/ui/components/GanttChart.vue`**

Props: `tasks: Task[]`, `viewMode: string`. The API below is verified against the source of `frappe-gantt@1.2.2` — **use it as written and do not consult blog posts or the package README for these calls.**

- Construct with `new Gantt(el, frappeTasks, { view_mode, readonly: true, on_click })`. Options are **snake_case**.
- Import CSS: `import 'frappe-gantt/dist/frappe-gantt.css'`. The package's `exports` map has no subpath entry for it (see ARCHITECTURE.md §8) — if resolution fails, add a Vite alias rather than copying the file into the repo.
- **Map domain → frappe field names.** They differ: `title` → **`name`**, `due` → **`end`**, `dependsOn` → `dependencies`. Dates go in as `YYYY-MM-DD` strings.
- **Build fresh plain objects for every render.** The library **mutates what you pass it** — it writes `_start`, `_end`, `_index`, overwrites `dependencies`, and rewrites `id`. Handing it store objects or Vue reactive proxies will corrupt state. Never pass `props.tasks` or anything derived from it by reference.
- Hold the instance in **`shallowRef`, not `ref`**.
- **To update, call `gantt.refresh(newTasks)`** (instance method). The package README shows `gantt.tasks.refresh()` — **that is wrong and the chart will silently never update.**
- Guard the **empty array before constructing**; frappe does not handle zero tasks gracefully.
- `onBeforeUnmount`: call `clear()` and drop the ref.
- `on_click` opens `task.url` via the domain task looked up by id — `window.open(url, '_blank', 'noopener,noreferrer')`.

**Silent-failure warning:** frappe `console.error`s and then **silently drops** any task with a missing `end`, `start` after `end`, or a span over ten years. Bars vanish with no exception. If bars are missing, check the console first.

Add a view-mode switcher backed by `settings.ts`. Valid values are exactly: `'Hour'`, `'Quarter Day'`, `'Half Day'`, `'Day'`, `'Week'`, `'Month'`, `'Year'`. Expose Day / Week / Month.

### Acceptance criteria

- `npm run verify` exits 0.
- Manual: loading a repo renders bars positioned by the resolved dates.
- Manual: switching view mode re-renders correctly.
- Manual: loading repo A then repo B fully replaces the chart, with no leftover bars from A.
- Manual: a repo with zero issues shows an empty state rather than a broken chart.
- Manual: no console errors or Vue warnings during any of the above.
- **Mutation check:** after the chart renders, confirm in the console that the board store's tasks still have their original shape and no `_start` / `_end` / `_index` properties. Their presence means objects were passed by reference — fix the mapping to build fresh copies.

### Commit

`feat: render issues as a Gantt chart`

---

# Phase 5 — Dependency arrows

**Goal:** `blockedBy` becomes arrows. This is the feature the project exists for.

### Steps

1. Pass `dependsOn` as frappe's `dependencies`, **as a `string[]`**. (The library also accepts a comma-separated string and normalises it, but an array avoids any escaping question.)
2. **Before passing anything to the chart**, run `pruneDanglingEdges` then `detectAndBreakCycles`. Never hand the library an id that is not present in the same task array.
3. Surface dropped edges and broken cycles in the UI as a dismissible, non-blocking notice ("3 dependencies point to issues outside this view").
4. Add a per-task warning indicator for tasks whose `warnings` array is non-empty, with the messages in a tooltip.

### Acceptance criteria

- `npm run verify` exits 0.
- Manual: a repo using issue dependencies renders arrows between the correct bars.
- Manual: a task blocked by a **closed** issue renders with no arrow and contributes to the "outside this view" count — it does **not** crash.
- Manual: paging in more issues resolves previously dangling edges into real arrows.
- Unit test: a task set containing a cycle renders (after breaking) without infinite recursion — the test must complete, not hang.

### Commit

`feat: render blocked-by dependencies as arrows`

---

# Phase 6 — Pagination, polish, deploy

**Goal:** Usable on a real board, and hosted.

### Steps

1. **"Load more"** button driven by `hasNextPage`. Show `tasks.length` of `totalCount`. **Do not build numbered pagination or a jump-to-last-page control** — cursor pagination cannot support them.
2. Show remaining rate limit from `rateLimit`, with `resetAt` when low.
3. Persist the last repo, view mode, field names and prefixes to `localStorage` — **settings only, never the token.**
4. Loading skeletons, keyboard-accessible controls, and a visible error banner.
5. Settings panel exposing: start/due field names, `GanttStart:`/`GanttDue:` prefixes, `defaultTaskDays`, page size.
6. **Optional, recommended — encrypted "remember me" via WebAuthn PRF.** Replace plaintext-in-IndexedDB persistence with: derive a symmetric key from a passkey using the WebAuthn `prf` extension, encrypt the token with AES-GCM via WebCrypto, store only the ciphertext. See ARCHITECTURE.md §6 Tier 3.
   - **Feature-detect at runtime.** `prf` support varies by browser *and* by authenticator, and fewer authenticators support it at credential-creation time than at assertion time.
   - If detection fails, fall back silently to session-only storage and tell the user persistence is unavailable.
   - Do not block the release on this. Ship session-only if it proves awkward.
7. Add the Apache 2.0 short header to source files (the template in the LICENSE appendix). Not legally required, but conventional and cheap.
8. Build and deploy to a static host. Set Vite's `base` correctly if serving from a subpath.
9. Write the real `README.md`: what it does, how to create a minimal-scope token, the date-resolution chain explained for users, and a clear statement that the token stays in the browser and is never sent anywhere but `api.github.com`.

### Acceptance criteria

- `npm run verify` exits 0.
- `npm run build && npm run preview` serves a working app from the production bundle.
- Manual: a repo with 200+ open issues pages in smoothly, with arrows correct across page boundaries.
- Manual: reloading restores the last repo and settings but **requires the token again** (with "remember" off).
- Deployed URL loads and functions.
- Final check — must print nothing:

```bash
cd ~/dev/gh-gantt && grep -rniE "gh[pousr]_[A-Za-z0-9]{16,}" . --exclude-dir=node_modules --exclude-dir=.git || echo "no tokens committed"
```

### Commit

`feat: pagination, settings and production build`

---

## Phase summary

| Phase | Delivers | Main risk |
|---|---|---|
| 0 | Scaffold, tooling, layering lint | Tailwind v4 config differs from v3 |
| 1 | Auth + GraphQL client | GraphQL errors arrive as HTTP 200 |
| 2 | Domain logic, fully tested | Silent wrong dates; cycle recursion |
| 3 | Real issues → tasks | Empty issue fields on personal repos |
| 4 | Chart renders | frappe API differs from memory; deep reactivity |
| 5 | Dependency arrows | Dangling edges crash the chart |
| 6 | Pagination, deploy | Edges spanning page boundaries |
