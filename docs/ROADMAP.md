# Roadmap

What is planned, in rough order, and what has shipped. Decisions and the
schema facts behind them are in [ARCHITECTURE.md](ARCHITECTURE.md); the
original phased build is in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Last updated 2026-09-23.

---

## Next — Effort: check against real data

Effort in working days is built (see *Shipped*). It has only been tested against faked GitHub responses, because the organisation's Effort field is still a single select. Once it is a Number field (steps below), check on a few Features: Length and the conflict warning, Save anyway, Set End from Effort, and editing and clearing Effort.

**Moving an existing single-select Effort to a Number field** (a field's type is fixed when it is created — `updateIssueField` can rename it but not change its type):

1. In the organisation's issue fields, rename the old field, e.g. to `Effort (old)`.
2. Create a new **Number** field named `Effort` and enable it on the issue types in use (e.g. Feature).
3. Re-enter the values as days on each issue; the old field shows what each one had.
4. Delete the old field once nothing reads it.

Until then the panel shows the single-select value and says “Effort” is a single-select field, so editing and calculations are off; nothing breaks.

---

## Later

### Working-day calendars

Named calendars that the one calendar module (above) reads, so users can mark days that are not worked — public holidays, shutdowns, a team offsite — and have them skipped wherever days are counted: bar length, the effort check, and End from Start + Effort.

- A calendar is a set of non-working dates, plus the working-week pattern below.
- Open questions: where calendars live so a whole team shares them (a file in a repository, an issue, or per-browser settings — shared is strongly preferred, for the same reason Effort's meaning lives in GitHub), and whether different issues or teams can use different calendars.

### Configurable working week

Let a calendar choose which weekdays are worked — for example Sunday to Thursday, or all seven days for teams that work weekends — instead of the hard-coded Monday to Friday. Part of the calendar above rather than a separate setting.

### Status colours on bars

Bars are a single light green today, on purpose: colour is kept free so it can carry status later (e.g. not started / in progress / blocked / done). Decide the status source — an issue field, a label, or open/closed plus blockers — before choosing colours, and keep the warning amber distinct from every status colour.

### Drag bars to change dates

Move or resize a bar to change Start/End. Needs an optimistic update with rollback on failure, and the same effort-conflict check as the panel.

### Warn on unmatched field names

When an issue has date fields but none match the configured names, say so on the bar instead of silently falling back to the milestone or creation date.

---

## Shipped

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
