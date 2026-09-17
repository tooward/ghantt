# gh-gantt

A browser-hosted Gantt chart for GitHub issues, with dependency arrows.

**Status:** design complete, implementation not started.

## What it will be

A static single-page app — no backend, no database, no server process. It reads issues from GitHub's GraphQL API directly from the browser using a personal access token that never leaves the user's machine, and renders them as a Gantt chart with `blocked by` relationships drawn as arrows.

Read-only. GitHub only. Editing happens in GitHub.

## Documentation

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The target architecture, stack, data flow and locked design decisions. Read this first. |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phased build plan with per-phase acceptance criteria. |

## Getting started

Nothing to run yet. Begin at **Phase 0** of the implementation plan.

## Prior art

Designed after reviewing [GanttLab](https://gitlab.com/ganttlab/ganttlab) (Apache-2.0), which solves a similar problem for GitHub and GitLab. This is not a fork and currently contains none of its code. See ARCHITECTURE.md §2 for the attribution rules if that changes.

## Licence

Not yet chosen. Decide before the first public push.
