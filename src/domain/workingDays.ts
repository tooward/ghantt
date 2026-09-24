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

import { addDays, startOfDay } from 'date-fns'

/**
 * The one place days are counted (ROADMAP.md, "All date arithmetic goes
 * through one calendar"). Bar lengths derived from Days, the Days check,
 * and default task lengths all come through here; nothing else adds or counts
 * days on its own.
 *
 * Start and End are both whole days: a task from Oct 1 to Oct 1 is one day.
 * That matches the chart, which draws a date-only End to the end of that day.
 */
export interface WorkingCalendar {
  isWorkingDay(date: Date): boolean
}

/** Monday to Friday. Configurable weeks and holiday calendars are on the roadmap. */
export const WEEKDAYS: WorkingCalendar = {
  isWorkingDay(date) {
    const day = date.getDay()
    return day !== 0 && day !== 6
  },
}

/**
 * How far to look before giving up. A calendar with no working days at all
 * would otherwise loop forever; ten years is far past any real task.
 */
const MAX_DAYS_SCANNED = 3660

/**
 * Working days from `start` to `end`, counting both. Zero when `end` is before
 * `start`. Dates are taken as local calendar days, so a UTC timestamp such as
 * a milestone's `dueOn` does not land on the wrong weekday.
 */
export function countWorkingDays(start: Date, end: Date, calendar: WorkingCalendar = WEEKDAYS): number {
  let day = startOfDay(start)
  const last = startOfDay(end)
  let count = 0
  for (let scanned = 0; day <= last && scanned < MAX_DAYS_SCANNED; scanned += 1) {
    if (calendar.isWorkingDay(day)) count += 1
    day = addDays(day, 1)
  }
  return count
}

/**
 * The End of a task that starts on `start` and takes `days` working days, so
 * that `countWorkingDays(start, end) === ceil(days)`. A Start on a non-working
 * day counts from the next working day, so the End is always a working day.
 * Fractions round up: half a day still occupies that day.
 */
export function endAfterWorkingDays(start: Date, days: number, calendar: WorkingCalendar = WEEKDAYS): Date {
  return walk(startOfDay(start), wholeDays(days), 1, calendar)
}

/** The Start of a task that ends on `end` and takes `days` working days. The mirror of `endAfterWorkingDays`. */
export function startBeforeWorkingDays(end: Date, days: number, calendar: WorkingCalendar = WEEKDAYS): Date {
  return walk(startOfDay(end), wholeDays(days), -1, calendar)
}

/** At least one day: a task always occupies the day it is on. */
function wholeDays(days: number): number {
  return Number.isFinite(days) && days > 0 ? Math.ceil(days) : 1
}

/** Step one day at a time until `needed` working days have been passed, including the first. */
function walk(from: Date, needed: number, step: 1 | -1, calendar: WorkingCalendar): Date {
  let day = from
  let counted = 0
  for (let scanned = 0; scanned < MAX_DAYS_SCANNED; scanned += 1) {
    if (calendar.isWorkingDay(day)) {
      counted += 1
      if (counted === needed) return day
    }
    day = addDays(day, step)
  }
  // No working days anywhere in range: fall back to plain calendar days.
  return addDays(from, step * (needed - 1))
}
