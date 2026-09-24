/*
 * Copyright 2026 Mike Ward
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { format, isValid, parseISO, startOfDay } from 'date-fns'
import { countWorkingDays, endAfterWorkingDays, startBeforeWorkingDays, WEEKDAYS, type WorkingCalendar } from './workingDays'

export interface DateInputs {
  /** Raw string from a configured start date field, if the repo has one. */
  fieldStart: string | null
  /** Raw string from a configured due date field. */
  fieldDue: string | null
  milestoneDue: string | null
  /** Always present on a GitHub issue — the last rung of the chain. */
  createdAt: string
  /** Working days of effort, from the Days Number field; null when unset or not above zero. */
  effortDays?: number | null
}

/** Where a resolved date came from, so the UI can say "(from Days)" and so on. */
export type DateSource = 'field' | 'effort' | 'milestone' | 'default' | 'created'

export interface ResolvedDates {
  start: Date
  due: Date
  sources: { start: DateSource; due: DateSource }
  warnings: string[]
}

export interface DateResolutionConfig {
  /** Working days a task takes when nothing says otherwise. Start and End both count. */
  defaultTaskDays: number
  calendar?: WorkingCalendar
}

export const DEFAULT_TASK_DAYS = 1

/**
 * Turn whatever dates an issue happens to carry into a start and a due date
 * (ARCHITECTURE.md §5.3). First match wins on each chain. Start and End are
 * both whole days: Oct 1 → Oct 1 is a one-day task.
 *
 * Due:   date field -> Start field + Days (working days) -> milestone due
 *        -> start + the default length.
 * Start: date field -> the resolved due date minus Days -> the resolved due
 *        date minus the default length -> `createdAt`.
 *
 * Only the Start *field* feeds the Days rung of the due chain, never a
 * derived start, so the two chains cannot feed each other. Backing off from
 * whichever due date won (rather than from the milestone specifically) avoids
 * an issue with an explicit due date, no start, and a later milestone taking
 * its start from the milestone, landing after its own due date, and having
 * that due date thrown away by the clamp below.
 *
 * Every length is counted in working days through `workingDays.ts`.
 *
 * When both dates come from fields and their working days do not match
 * Days, in either direction, that is reported as a warning. GitHub itself
 * never checks, so this catches mismatches written anywhere, not only
 * through this app. It is a warning, not a correction: the user decides,
 * since the tool cannot see everything (shared or part-time work, say).
 *
 * Issue body lines (`GanttStart:` / `GanttDue:`) were once a rung here too.
 * They were removed as fragile once organisation issue fields existed.
 *
 * This function always returns two valid dates and never throws. Anything it
 * could not use is reported in `warnings` rather than silently dropped — a
 * wrong bar the user cannot explain is worse than a missing one.
 */
export function resolveDates(i: DateInputs, cfg: DateResolutionConfig): ResolvedDates {
  const warnings: string[] = []
  const calendar = cfg.calendar ?? WEEKDAYS
  const days = Number.isFinite(cfg.defaultTaskDays) && cfg.defaultTaskDays > 0
    ? cfg.defaultTaskDays
    : DEFAULT_TASK_DAYS
  const effort = typeof i.effortDays === 'number' && Number.isFinite(i.effortDays) && i.effortDays > 0
    ? i.effortDays
    : null

  const fieldStart = parseOrWarn(i.fieldStart, 'start date field', warnings)
  const fieldDue = parseOrWarn(i.fieldDue, 'due date field', warnings)
  const milestoneDue = parseOrWarn(i.milestoneDue, 'milestone due date', warnings)
  const createdAt = parseOrWarn(i.createdAt, 'issue creation date', warnings)

  // The due candidate is resolved first because the start chain backs off from it.
  let dueCandidate: { date: Date; source: DateSource } | null = null
  if (fieldDue) dueCandidate = { date: fieldDue, source: 'field' }
  else if (fieldStart && effort) dueCandidate = { date: endAfterWorkingDays(fieldStart, effort, calendar), source: 'effort' }
  else if (milestoneDue) dueCandidate = { date: milestoneDue, source: 'milestone' }

  let start: Date
  let startSource: DateSource
  if (fieldStart) {
    start = fieldStart
    startSource = 'field'
  } else if (dueCandidate && effort) {
    start = startBeforeWorkingDays(dueCandidate.date, effort, calendar)
    startSource = 'effort'
  } else if (dueCandidate) {
    // Only reachable when something gives a due date but nothing gives a start.
    start = startBeforeWorkingDays(dueCandidate.date, days, calendar)
    startSource = 'default'
  } else if (createdAt) {
    start = createdAt
    startSource = 'created'
  } else {
    start = fallbackStart(warnings)
    startSource = 'created'
  }

  let due = dueCandidate?.date ?? endAfterWorkingDays(start, days, calendar)
  const dueSource: DateSource = dueCandidate?.source ?? 'default'

  // A same-day task is valid; only an End before the Start is not.
  if (due.getTime() < start.getTime()) {
    warnings.push(
      `Due date (${toIsoDay(due)}) is before the start date (${toIsoDay(start)}); ` +
        `showing ${days} working day${days === 1 ? '' : 's'} from the start instead.`,
    )
    due = endAfterWorkingDays(start, days, calendar)
    return { start, due, sources: { start: startSource, due: 'default' }, warnings }
  }

  if (effort && startSource === 'field' && dueSource === 'field') {
    const available = countWorkingDays(start, due, calendar)
    if (!daysAligned(available, effort)) warnings.push(effortConflict(available, effort))
  }

  return { start, due, sources: { start: startSource, due: dueSource }, warnings }
}

/**
 * Whether a Start–End span of `available` working days matches `days`. Days
 * rounds up, as `endAfterWorkingDays` does: 2.5 Days fills three working days.
 */
export function daysAligned(available: number, days: number): boolean {
  return available === Math.ceil(days)
}

/** The one wording for a Days mismatch, shared by the bar and the panel. */
export function effortConflict(available: number, effort: number): string {
  return `Start–End gives ${available} working day${available === 1 ? '' : 's'}; Days is set to ${effort}.`
}

export function formatDays(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`
}

function parseOrWarn(value: string | null | undefined, label: string, warnings: string[]): Date | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const parsed = parseISO(value)
  if (!isValid(parsed)) {
    warnings.push(`Ignored the ${label}: "${value}" is not a valid date.`)
    return null
  }
  // Whole local days only. A timestamp such as `createdAt` carries a time of
  // day, and comparing it with a derived midnight would put a same-day End
  // *before* its Start.
  return startOfDay(parsed)
}

/** Unreachable for real GitHub data — `createdAt` always parses — but the chain must still end somewhere. */
function fallbackStart(warnings: string[]): Date {
  warnings.push('No usable date at all; the bar starts today.')
  return startOfDay(new Date())
}

/**
 * Format in local time. A date-only string parses to local midnight, so
 * `toISOString()` would report the previous day anywhere east of UTC.
 */
function toIsoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
