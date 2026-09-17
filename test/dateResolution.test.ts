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
    bodyStart: null,
    bodyDue: null,
    milestoneDue: null,
    createdAt: '2026-01-10T09:00:00Z',
    ...overrides,
  }
}

// Local formatting, to match how dates reach the chart. A date-only string
// parses to local midnight, so toISOString() would be a day out east of UTC.
const day = (date: Date) => format(date, 'yyyy-MM-dd')

describe('resolveDates — start chain', () => {
  it('rung 1: the date field wins', () => {
    const { start } = resolveDates(
      inputs({
        fieldStart: '2026-02-01',
        bodyStart: new Date('2026-03-01T00:00:00Z'),
        milestoneDue: '2026-04-01',
      }),
      cfg,
    )

    expect(day(start)).toBe('2026-02-01')
  })

  it('rung 2: the body date wins when there is no field', () => {
    const { start } = resolveDates(
      inputs({ bodyStart: new Date('2026-03-01T00:00:00Z'), milestoneDue: '2026-04-01' }),
      cfg,
    )

    expect(day(start)).toBe('2026-03-01')
  })

  it('rung 3: milestone due minus the default duration', () => {
    const { start } = resolveDates(inputs({ milestoneDue: '2026-04-10T00:00:00Z' }), { defaultTaskDays: 3 })

    expect(day(start)).toBe('2026-04-07')
  })

  it('rung 4: createdAt when nothing else is present', () => {
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
        bodyDue: new Date('2026-03-20T00:00:00Z'),
        milestoneDue: '2026-04-20',
      }),
      cfg,
    )

    expect(day(due)).toBe('2026-02-20')
  })

  it('rung 2: the body date beats the milestone', () => {
    const { due } = resolveDates(
      inputs({
        fieldStart: '2026-03-01T00:00:00Z',
        bodyDue: new Date('2026-03-20T00:00:00Z'),
        milestoneDue: '2026-04-20T00:00:00Z',
      }),
      cfg,
    )

    expect(day(due)).toBe('2026-03-20')
  })

  it('rung 3: the milestone due date', () => {
    const { due } = resolveDates(inputs({ fieldStart: '2026-04-01', milestoneDue: '2026-04-20T00:00:00Z' }), cfg)

    expect(day(due)).toBe('2026-04-20')
  })

  it('rung 4: start plus the default duration', () => {
    const { start, due } = resolveDates(inputs({ fieldStart: '2026-04-01T00:00:00Z' }), { defaultTaskDays: 5 })

    expect(day(start)).toBe('2026-04-01')
    expect(day(due)).toBe('2026-04-06')
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

    expect(day(due)).toBe('2026-01-11')
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

    expect(due.getTime()).toBeGreaterThan(start.getTime())
  })
})

describe('resolveDates — start rung 3 backs off from the resolved due date', () => {
  it('derives the start from an explicit due date rather than the milestone', () => {
    const { start, due, warnings } = resolveDates(
      inputs({ fieldDue: '2026-02-20T00:00:00Z', milestoneDue: '2026-04-20T00:00:00Z' }),
      { defaultTaskDays: 2 },
    )

    expect(day(start)).toBe('2026-02-18')
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
  it('still produces valid dates with no fields, no body dates and no milestone', () => {
    const { start, due, warnings } = resolveDates(inputs(), cfg)

    expect(day(start)).toBe('2026-01-10')
    expect(day(due)).toBe('2026-01-11')
    expect(warnings).toEqual([])
  })
})
