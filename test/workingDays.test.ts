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
import {
  countWorkingDays,
  endAfterWorkingDays,
  startBeforeWorkingDays,
  type WorkingCalendar,
} from '../src/domain/workingDays'

// Expected values were worked out independently (a weekday calendar in
// Python), not copied from this code's output. 2026-10-01 is a Thursday.
const day = (iso: string) => new Date(`${iso}T00:00:00`)
const iso = (date: Date) => format(date, 'yyyy-MM-dd')

describe('countWorkingDays', () => {
  it('counts both ends', () => {
    expect(countWorkingDays(day('2026-10-01'), day('2026-10-01'))).toBe(1)
    expect(countWorkingDays(day('2026-10-01'), day('2026-12-15'))).toBe(54)
  })

  it('skips the weekend in a Friday-to-Monday span', () => {
    expect(countWorkingDays(day('2026-10-02'), day('2026-10-05'))).toBe(2)
  })

  it('is zero for a span that is all weekend, and for an End before the Start', () => {
    expect(countWorkingDays(day('2026-10-03'), day('2026-10-04'))).toBe(0)
    expect(countWorkingDays(day('2026-10-05'), day('2026-10-01'))).toBe(0)
  })

  it('reads a UTC timestamp as its local day', () => {
    // Local midnight either way; the time of day never shifts the count.
    expect(countWorkingDays(new Date('2026-10-01T23:30:00'), new Date('2026-10-02T00:15:00'))).toBe(2)
  })
})

describe('endAfterWorkingDays', () => {
  it('ends on the Start for a one-day task', () => {
    expect(iso(endAfterWorkingDays(day('2026-10-01'), 1))).toBe('2026-10-01')
  })

  it('carries over the weekend', () => {
    expect(iso(endAfterWorkingDays(day('2026-10-02'), 2))).toBe('2026-10-05')
    expect(iso(endAfterWorkingDays(day('2026-10-01'), 10))).toBe('2026-10-14')
  })

  it('counts from the next working day when the Start is on a weekend', () => {
    expect(iso(endAfterWorkingDays(day('2026-10-03'), 1))).toBe('2026-10-05')
  })

  it('rounds a fraction up to a whole day', () => {
    expect(iso(endAfterWorkingDays(day('2026-10-01'), 2.5))).toBe('2026-10-05')
    expect(iso(endAfterWorkingDays(day('2026-10-01'), 0.5))).toBe('2026-10-01')
  })

  it('treats zero, negative or non-numbers as one day', () => {
    for (const bad of [0, -3, Number.NaN]) {
      expect(iso(endAfterWorkingDays(day('2026-10-01'), bad))).toBe('2026-10-01')
    }
  })

  it('agrees with countWorkingDays', () => {
    for (let n = 1; n <= 30; n += 1) {
      const end = endAfterWorkingDays(day('2026-10-01'), n)
      expect(countWorkingDays(day('2026-10-01'), end)).toBe(n)
    }
  })
})

describe('startBeforeWorkingDays', () => {
  it('mirrors endAfterWorkingDays', () => {
    expect(iso(startBeforeWorkingDays(day('2026-04-10'), 3))).toBe('2026-04-08')
    expect(iso(startBeforeWorkingDays(day('2026-10-05'), 2))).toBe('2026-10-02')
    expect(iso(startBeforeWorkingDays(day('2026-10-01'), 1))).toBe('2026-10-01')
  })
})

describe('with a calendar that has no working days', () => {
  const never: WorkingCalendar = { isWorkingDay: () => false }

  it('stops instead of looping forever, falling back to calendar days', () => {
    expect(iso(endAfterWorkingDays(day('2026-10-01'), 3, never))).toBe('2026-10-03')
    expect(countWorkingDays(day('2026-10-01'), day('2026-10-31'), never)).toBe(0)
  })
})
