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

import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { resolveDates, type DateInputs } from '../src/domain/dateResolution'

const cfg = { defaultTaskDays: 1 }

function inputs(overrides: Partial<DateInputs> = {}): DateInputs {
  return {
    fieldStart: null,
    fieldDue: null,
    milestoneDue: null,
    createdAt: '2026-01-10T09:00:00Z',
    ...overrides,
  }
}

// Expected dates were worked out independently with a weekday calendar, not
// copied from the code's output. Start and End both count: 1 day = same day.
// 2026-01-10 (the default createdAt) is a Saturday.

// Local formatting, to match how dates reach the chart. A date-only string
// parses to local midnight, so toISOString() would be a day out east of UTC.
const day = (date: Date) => format(date, 'yyyy-MM-dd')

describe('resolveDates — start chain', () => {
  it('rung 1: the date field wins', () => {
    const { start } = resolveDates(
      inputs({
        fieldStart: '2026-02-01',
        milestoneDue: '2026-04-01',
      }),
      cfg,
    )

    expect(day(start)).toBe('2026-02-01')
  })

  it('rung 2: milestone due minus the default duration', () => {
    // Fri 10 Apr, three working days: Wed 8, Thu 9, Fri 10.
    const { start } = resolveDates(inputs({ milestoneDue: '2026-04-10T00:00:00Z' }), { defaultTaskDays: 3 })

    expect(day(start)).toBe('2026-04-08')
  })

  it('rung 3: createdAt when nothing else is present', () => {
    const { start } = resolveDates(inputs(), cfg)

    expect(day(start)).toBe('2026-01-10')
  })
})

describe('resolveDates — due chain', () => {
  it('rung 1: the date field wins', () => {
    const { due } = resolveDates(
      inputs({
        fieldStart: '2026-02-01T00:00:00Z',
        fieldDue: '2026-02-20',
        milestoneDue: '2026-04-20',
      }),
      cfg,
    )

    expect(day(due)).toBe('2026-02-20')
  })

  it('rung 2: the milestone due date', () => {
    const { due } = resolveDates(inputs({ fieldStart: '2026-04-01', milestoneDue: '2026-04-20T00:00:00Z' }), cfg)

    expect(day(due)).toBe('2026-04-20')
  })

  it('rung 3: start plus the default duration, in working days', () => {
    // Wed 1 Apr, five working days: Wed–Fri, then Mon 6, Tue 7.
    const { start, due } = resolveDates(inputs({ fieldStart: '2026-04-01T00:00:00Z' }), { defaultTaskDays: 5 })

    expect(day(start)).toBe('2026-04-01')
    expect(day(due)).toBe('2026-04-07')
  })

  it('a one-day default ends on the start day', () => {
    const { due } = resolveDates(inputs({ fieldStart: '2026-04-01' }), cfg)

    expect(day(due)).toBe('2026-04-01')
  })
})

describe('resolveDates — malformed input', () => {
  it.each(['not-a-date', '  ', '2026-13-45'])('ignores %p in a date field and warns', (value) => {
    const { start, warnings } = resolveDates(inputs({ fieldStart: value }), cfg)

    expect(day(start)).toBe('2026-01-10')
    if (value.trim() !== '') {
      expect(warnings.join(' ')).toContain('not a valid date')
    } else {
      expect(warnings).toEqual([])
    }
  })

  it('ignores a malformed milestone date and warns', () => {
    const { due, warnings } = resolveDates(inputs({ milestoneDue: 'soon' }), cfg)

    // Created on a Saturday: the first working day is Monday the 12th.
    expect(day(due)).toBe('2026-01-12')
    expect(warnings.join(' ')).toContain('milestone due date')
  })

  it('never returns an invalid date', () => {
    const { start, due } = resolveDates(
      inputs({ fieldStart: 'rubbish', fieldDue: 'rubbish', milestoneDue: 'rubbish', createdAt: 'rubbish' }),
      cfg,
    )

    expect(Number.isNaN(start.getTime())).toBe(false)
    expect(Number.isNaN(due.getTime())).toBe(false)
  })

  it('never throws, whatever it is given', () => {
    expect(() => resolveDates(inputs({ createdAt: '' }), { defaultTaskDays: 0 })).not.toThrow()
  })

  it('falls back to a sane duration when the configured one is nonsense', () => {
    const { start, due } = resolveDates(inputs({ fieldStart: '2026-04-01T00:00:00Z' }), { defaultTaskDays: -4 })

    // One day, which ends on the start day.
    expect(day(due)).toBe(day(start))
  })
})

describe('resolveDates — start rung 3 backs off from the resolved due date', () => {
  it('derives the start from an explicit due date rather than the milestone', () => {
    const { start, due, warnings } = resolveDates(
      inputs({ fieldDue: '2026-02-20T00:00:00Z', milestoneDue: '2026-04-20T00:00:00Z' }),
      { defaultTaskDays: 2 },
    )

    // Fri 20 Feb, two working days: Thu 19, Fri 20.
    expect(day(start)).toBe('2026-02-19')
    expect(day(due)).toBe('2026-02-20')
    expect(warnings).toEqual([])
  })
})

describe('resolveDates — clamping', () => {
  it('clamps a due date that falls before the start, with a warning', () => {
    const { start, due, warnings } = resolveDates(
      inputs({ fieldStart: '2026-05-10T00:00:00Z', fieldDue: '2026-05-01T00:00:00Z' }),
      { defaultTaskDays: 2 },
    )

    // Sun 10 May: two working days from the next working day are Mon 11, Tue 12.
    expect(day(start)).toBe('2026-05-10')
    expect(day(due)).toBe('2026-05-12')
    expect(warnings.join(' ')).toContain('before the start date')
  })

  it('leaves a due date equal to the start alone', () => {
    const { due, warnings } = resolveDates(
      inputs({ fieldStart: '2026-05-10T00:00:00Z', fieldDue: '2026-05-10T00:00:00Z' }),
      cfg,
    )

    expect(day(due)).toBe('2026-05-10')
    expect(warnings).toEqual([])
  })
})

describe('resolveDates — the personal-repo case', () => {
  // Issue fields are organisation-level: a personal repo returns none at all.
  it('still produces valid dates with no fields and no milestone', () => {
    const { start, due, sources, warnings } = resolveDates(inputs(), cfg)

    expect(day(start)).toBe('2026-01-10')
    expect(day(due)).toBe('2026-01-12')
    expect(sources).toEqual({ start: 'created', due: 'default' })
    expect(warnings).toEqual([])
  })
})

describe('resolveDates — Effort', () => {
  it('gives the End from the Start field plus Effort, ahead of the milestone', () => {
    // Mon 2 Mar, five working days: Mon–Fri 6 Mar.
    const { due, sources } = resolveDates(
      inputs({ fieldStart: '2026-03-02', milestoneDue: '2026-04-30T00:00:00Z', effortDays: 5 }),
      cfg,
    )

    expect(day(due)).toBe('2026-03-06')
    expect(sources.due).toBe('effort')
  })

  it('gives the Start from the End less Effort', () => {
    // Thu 30 Apr, three working days: Tue 28, Wed 29, Thu 30.
    const { start, sources } = resolveDates(inputs({ milestoneDue: '2026-04-30T00:00:00Z', effortDays: 3 }), cfg)

    expect(day(start)).toBe('2026-04-28')
    expect(sources).toEqual({ start: 'effort', due: 'milestone' })
  })

  it('lets an End field win over Effort', () => {
    const { due, sources } = resolveDates(inputs({ fieldStart: '2026-10-01', fieldDue: '2026-10-30', effortDays: 2 }), cfg)

    expect(day(due)).toBe('2026-10-30')
    expect(sources).toEqual({ start: 'field', due: 'field' })
  })

  it('warns, without changing anything, when Start–End is shorter than Effort', () => {
    // Thu 1 – Mon 5 Oct is three working days.
    const { start, due, warnings } = resolveDates(
      inputs({ fieldStart: '2026-10-01', fieldDue: '2026-10-05', effortDays: 5 }),
      cfg,
    )

    expect(day(start)).toBe('2026-10-01')
    expect(day(due)).toBe('2026-10-05')
    expect(warnings).toEqual(['Start–End gives 3 working days; Effort is 5 days.'])
  })

  it('does not warn when Start–End exactly fits Effort', () => {
    const { warnings } = resolveDates(inputs({ fieldStart: '2026-10-01', fieldDue: '2026-10-05', effortDays: 3 }), cfg)

    expect(warnings).toEqual([])
  })

  it('only checks dates that both came from fields', () => {
    // End from the milestone: nobody chose this pair, so there is nothing to warn about.
    const { warnings } = resolveDates(
      inputs({ fieldStart: '2026-10-01', milestoneDue: '2026-10-02T00:00:00Z', effortDays: 1 }),
      cfg,
    )

    expect(warnings).toEqual([])
  })

  it.each([0, -2, Number.NaN, null])('ignores an Effort of %p', (effortDays) => {
    const { due, sources } = resolveDates(inputs({ fieldStart: '2026-04-01', effortDays }), cfg)

    expect(day(due)).toBe('2026-04-01')
    expect(sources.due).toBe('default')
  })
})
