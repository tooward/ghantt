import { describe, expect, it } from 'vitest'
import { DEFAULT_BODY_PREFIXES, parseBodyDates } from '../src/domain/bodyDates'

const cfg = DEFAULT_BODY_PREFIXES

describe('parseBodyDates', () => {
  it('reads both dates from a body', () => {
    const { start, due } = parseBodyDates('GanttStart: 2026-03-01\nGanttDue: 2026-03-10', cfg)

    expect(start?.getFullYear()).toBe(2026)
    expect(start?.getMonth()).toBe(2)
    expect(start?.getDate()).toBe(1)
    expect(due?.getDate()).toBe(10)
  })

  it('ignores leading whitespace on the line', () => {
    expect(parseBodyDates('   GanttStart: 2026-03-01', cfg).start).not.toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(parseBodyDates('ganttstart: 2026-03-01', cfg).start).not.toBeNull()
  })

  it('does not match a prefix mid-sentence', () => {
    expect(parseBodyDates('see GanttStart: 2026-03-01 above', cfg).start).toBeNull()
  })

  it('rejects an unparseable date', () => {
    expect(parseBodyDates('GanttStart: not-a-date', cfg).start).toBeNull()
  })

  it('rejects an empty value', () => {
    expect(parseBodyDates('GanttStart:', cfg).start).toBeNull()
  })

  it('takes the first valid occurrence of each prefix', () => {
    const { start } = parseBodyDates('GanttStart: 2026-03-01\nGanttStart: 2026-04-01', cfg)

    expect(start?.getMonth()).toBe(2)
  })

  it.each([null, undefined, ''])('handles a body of %p', (body) => {
    expect(parseBodyDates(body, cfg)).toEqual({ start: null, due: null })
  })

  it('honours configured prefixes', () => {
    const custom = { startPrefix: 'Begin:', duePrefix: 'End:' }
    const { start, due } = parseBodyDates('Begin: 2026-01-02\nEnd: 2026-01-09', custom)

    expect(start?.getDate()).toBe(2)
    expect(due?.getDate()).toBe(9)
  })

  it('accepts a full ISO timestamp', () => {
    expect(parseBodyDates('GanttDue: 2026-03-10T12:00:00Z', cfg).due).not.toBeNull()
  })
})
