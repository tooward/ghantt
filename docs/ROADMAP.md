# Roadmap

What is planned, in rough order, and what has shipped. Decisions and the
schema facts behind them are in [ARCHITECTURE.md](ARCHITECTURE.md); the
original phased build is in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Last updated 2026-09-24.

---

## Next — Days: check against real data

The effort-in-working-days work (see *Shipped*) reads a Number issue field, now named **Days** by default. The organisation's `Effort` field stayed a single select for another purpose, so a separate `Days` Number field was created (confirmed via `RepoFields` on 2026-09-24). Everything has so far been tested only against faked GitHub responses. On 2026-09-24 no open issue in the organisation had a Days, Start or End value yet. Once a few Features do, check: filling Days on opening, the mismatch warning both ways, the three Set buttons, Save anyway, and editing and clearing Days.

Anyone who saved settings before the rename gets `Days` automatically: the old `effortFieldName` setting is ignored rather than carried over, since it would now point at the wrong field.

Also open:

- **Emptying Days does not stick** while both dates are set: the next time the issue is opened, Days is filled in from Start–End again. If some issues should deliberately have no Days, the panel would need to remember that.
- **Only opened issues are filled in.** Days is written when an issue's panel is opened, not across the whole board on load. A bulk "fill Days on every issue" action would be a separate, explicit step.

## Next — Milestones: check against real data

Milestone diamonds and release issues are built (see *Shipped*), and tested only against faked GitHub responses: on 2026-09-24 shieldedtech/moth-wallet had no milestones and no `release` label. Once a repository has a dated milestone, a few issues in it and a release issue, check the grouping, the roll-up arrows, the diamond's position (it should sit on the due date's day, in any time zone), post-release arrows, and each warning.

Known limits, by design for now:

- **One repository only**: GitHub milestones are per repository.
- **Paging**: a release issue on a later page is not drawn as a diamond until it is paged in. Its milestone still gets a stand-in diamond meanwhile.
- **No diamond for an undated milestone** unless it has a release issue, which is then drawn on its own End.
- **The "starts before its blocker ends" warning exists only for releases.** Extending it to every blocked-by link is a small step if wanted.
- **Not editable from the chart**: assigning an issue's milestone, or creating a release issue for a milestone that has none, would be next.

---

## Later

### Working-day calendars

Named calendars that the one calendar module (above) reads, so users can mark days that are not worked — public holidays, shutdowns, a team offsite — and have them skipped wherever days are counted: bar length, the Days check, and End from Start + Days.

- A calendar is a set of non-working dates, plus the working-week pattern below.
- Open questions: where calendars live so a whole team shares them (a file in a repository, an issue, or per-browser settings — shared is strongly preferred, for the same reason Days' meaning lives in GitHub), and whether different issues or teams can use different calendars.

### Configurable working week

Let a calendar choose which weekdays are worked — for example Sunday to Thursday, or all seven days for teams that work weekends — instead of the hard-coded Monday to Friday. Part of the calendar above rather than a separate setting.

### Status colours on bars

Bars are a single light green today, on purpose: colour is kept free so it can carry status later (e.g. not started / in progress / blocked / done). Decide the status source — an issue field, a label, or open/closed plus blockers — before choosing colours, and keep the warning amber distinct from every status colour.

### Drag bars to change dates

Move or resize a bar to change Start/End. Needs an optimistic update with rollback on failure, and the same Days conflict check as the panel.

### Warn on unmatched field names

When an issue has date fields but none match the configured names, say so on the bar instead of silently falling back to the milestone or creation date.

---

## Shipped

- **Help page and deployment setup** (2026-09-29). A user-facing help page (`help.html`, a second Vite entry), linked from a round **?** in the toolbar and from the connect page. Cloudflare Pages headers in `public/_headers`: a strict CSP (scripts from the site only, network only to `api.github.com`), `nosniff`, no referrer, and long caching for hashed assets. Checked with `wrangler pages dev`.
- **Milestones as diamonds, with release issues** (2026-09-24). Open milestones with a due date are diamonds on that day; their issues are grouped above, and their last issues roll up to the diamond. An issue labelled `release` in a milestone is its diamond, so post-release work can be blocked by it. Warnings for work ending after its milestone, work starting before the release it waits on, a release whose End is not the milestone's date, and more than one release per milestone. Also fixed: a milestone's due date was read a day early west of UTC.
- **Dates and Days kept in step** (2026-09-24). Opening an issue with a Start and End field but no Days saves Days from Start–End (never overwriting an existing Days, even `0`). A mismatch is now flagged both ways, not only when the dates are shorter, and a part day counts as the whole day. The panel offers Set Days from Start–End, Set End from Days and Set Start from Days whenever the three disagree, and Save anyway keeps what the user chose.
- **Days field renamed** (2026-09-24): the default field is `Days`, not `Effort`; labels, messages and the settings key follow. Internal names (`effortDays`, the `'effort'` date source) still say effort, which is what Days measures.
- **Effort in working days** (2026-09-23). Decisions: Effort is a GitHub **Number** field in working days (GitHub stores it as a `Float` and accepts only numbers, so no parsing and no fixed sizing scheme; values not above zero are ignored); working days are **Monday to Friday**, hard-coded for now; **Start and End both count** (Oct 1 → Oct 1 is one day); on a conflict, **warn, never block** (Effort is person-days — two people can finish five days of effort in three). Built:
  - one calendar module, `domain/workingDays.ts`, for every day count — nothing else counts days;
  - End from Start + Effort, and Start from End − Effort, in the date chain; the default length is now working days too, so a one-day default is drawn one day long (it was drawn two);
  - Length in the panel as working days; an Effort box (number, empty clears it); a live conflict note with **Save anyway**; **Set End from Effort**, which fills the End box and waits for Save; a note where a date came from Effort, the milestone or a default;
  - conflicts in data the app did not write are flagged on the bar (amber) and in the panel;
  - the field lookup reports each field's kind, so a single-select Effort gets its own message.
- **Filter by issue type** (default Feature) from the toolbar under the header.
- **Detail panel**: start, end, effort, blocked by, blocks, warnings, link to GitHub.
- **Edit Start/End** from the panel (`setIssueFieldValue`), writing only changed dates; field ids from a separate `RepoFields` query.
- **Edit blocking links** in both directions (`addBlockedBy` / `removeBlockedBy`): a picker over loaded issues with a loop check, confirm-to-remove, and lookup of issues not on the chart by `#123`, `owner/repo#123` or URL — one request, only when chosen.
- **Finish-to-start arrows**, from the blocker's end to the blocked issue's start.
- **Header and toolbar**: API budget battery, settings window, disconnect button, repository / type panel.
- **Passkey-encrypted "remember this token"**, now with one prompt where the authenticator allows it.
