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

import { addDays, format, isValid, parseISO, subDays } from 'date-fns'

export interface DateInputs {
  /** Raw string from a configured start date field, if the repo has one. */
  fieldStart: string | null
  /** Raw string from a configured due date field. */
  fieldDue: string | null
  bodyStart: Date | null
  bodyDue: Date | null
  milestoneDue: string | null
  /** Always present on a GitHub issue — the last rung of the chain. */
  createdAt: string
}

export interface ResolvedDates {
  start: Date
  due: Date
  warnings: string[]
}

export interface DateResolutionConfig {
  defaultTaskDays: number
}

export const DEFAULT_TASK_DAYS = 1

/**
 * Turn whatever dates an issue happens to carry into a start and a due date
 * (ARCHITECTURE.md §5.3). First match wins on each chain.
 *
 * Start: date field -> body `GanttStart:` -> the resolved due date minus the
 * default duration -> `createdAt`.
 *
 * Rung 3 deviates slightly from ARCHITECTURE.md §5.3, which names the
 * milestone due date specifically. Backing off from whichever due date won
 * gives the same answer when the milestone is the only source, and avoids a
 * bad case the narrower rule produces: an issue with an explicit due date, no
 * start, and a later milestone would take its start from the milestone, land
 * after its own due date, and have that explicit due date thrown away by the
 * clamp below.
 * Due:   date field -> body `GanttDue:` -> milestone due -> start plus the
 * default duration.
 *
 * This function always returns two valid dates and never throws. Anything it
 * could not use is reported in `warnings` rather than silently dropped — a
 * wrong bar the user cannot explain is worse than a missing one.
 */
export function resolveDates(i: DateInputs, cfg: DateResolutionConfig): ResolvedDates {
  const warnings: string[] = []
  const days = Number.isFinite(cfg.defaultTaskDays) && cfg.defaultTaskDays > 0
    ? cfg.defaultTaskDays
    : DEFAULT_TASK_DAYS

  const fieldStart = parseOrWarn(i.fieldStart, 'start date field', warnings)
  const fieldDue = parseOrWarn(i.fieldDue, 'due date field', warnings)
  const milestoneDue = parseOrWarn(i.milestoneDue, 'milestone due date', warnings)
  const createdAt = parseOrWarn(i.createdAt, 'issue creation date', warnings)

  // The due candidate is resolved first because rung 3 of the start chain is
  // defined in terms of it.
  const dueCandidate = fieldDue ?? i.bodyDue ?? milestoneDue

  const start =
    fieldStart ??
    i.bodyStart ??
    // Only reachable when something gives a due date but nothing gives a start.
    (dueCandidate ? subDays(dueCandidate, days) : null) ??
    createdAt ??
    fallbackStart(warnings)

  const due = dueCandidate ?? addDays(start, days)

  if (due.getTime() < start.getTime()) {
    warnings.push(
      `Due date (${toIsoDay(due)}) is before the start date (${toIsoDay(start)}); ` +
        `showing ${days} day${days === 1 ? '' : 's'} from the start instead.`,
    )
    return { start, due: addDays(start, days), warnings }
  }

  return { start, due, warnings }
}

function parseOrWarn(value: string | null | undefined, label: string, warnings: string[]): Date | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const parsed = parseISO(value)
  if (!isValid(parsed)) {
    warnings.push(`Ignored the ${label}: "${value}" is not a valid date.`)
    return null
  }
  return parsed
}

/** Unreachable for real GitHub data — `createdAt` always parses — but the chain must still end somewhere. */
function fallbackStart(warnings: string[]): Date {
  warnings.push('No usable date at all; the bar starts today.')
  return new Date()
}

/**
 * Format in local time. A date-only string parses to local midnight, so
 * `toISOString()` would report the previous day anywhere east of UTC.
 */
function toIsoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
