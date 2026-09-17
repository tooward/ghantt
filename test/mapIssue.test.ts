import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_CONFIG, mapIssue } from '../src/adapters/github/mapIssue'
import type { BoardIssuesResponse, GitHubIssueNode } from '../src/adapters/github/types'
import live from './fixtures/boardIssues.frappe-gantt.json'
import synthetic from './fixtures/boardIssues.synthetic.json'

const day = (date: Date) => format(date, 'yyyy-MM-dd')
const cfg = DEFAULT_MAP_CONFIG

function nodesOf(fixture: { data: BoardIssuesResponse }): GitHubIssueNode[] {
  return (fixture.data.repository?.issues.nodes ?? []).filter((n): n is GitHubIssueNode => n !== null)
}

const syntheticNodes = nodesOf(synthetic as unknown as { data: BoardIssuesResponse })
const liveNodes = nodesOf(live as unknown as { data: BoardIssuesResponse })

describe('mapIssue — captured live response (frappe/gantt)', () => {
  it('maps every node without throwing', () => {
    expect(liveNodes.length).toBeGreaterThan(0)
    expect(() => liveNodes.map((node) => mapIssue(node, cfg))).not.toThrow()
  })

  it('maps identity fields straight through', () => {
    const task = mapIssue(liveNodes[0], cfg)

    expect(task).toMatchObject({
      id: 'MDU6SXNzdWUyMjY3MTA2OTU=',
      number: 18,
      title: 'Dynamic dependency',
      url: 'https://github.com/frappe/gantt/issues/18',
      dependsOn: [],
      warnings: [],
    })
  })

  // Issue fields are organisation-level, so a personal repo returns none.
  it('still produces valid dates when issueFieldValues is empty', () => {
    const task = mapIssue(liveNodes[0], cfg)

    expect(day(task.start)).toBe('2017-05-05')
    expect(day(task.due)).toBe('2017-05-06')
    expect(Number.isNaN(task.start.getTime())).toBe(false)
    expect(Number.isNaN(task.due.getTime())).toBe(false)
  })

  it('never returns a due date before the start date', () => {
    for (const task of liveNodes.map((node) => mapIssue(node, cfg))) {
      expect(task.due.getTime()).toBeGreaterThanOrEqual(task.start.getTime())
    }
  })
})

describe('mapIssue — issue date fields', () => {
  it('reads date fields and matches the field name case-insensitively', () => {
    const task = mapIssue(syntheticNodes[0], cfg)

    expect(day(task.start)).toBe('2026-03-02')
    expect(day(task.due)).toBe('2026-03-09')
  })

  it('ignores union members that are not IssueFieldDateValue', () => {
    // The fixture's first node carries a select value and a text value, neither
    // of which has a `field` or `value` key at all.
    expect(() => mapIssue(syntheticNodes[0], cfg)).not.toThrow()
    expect(mapIssue(syntheticNodes[0], cfg).warnings).toEqual([])
  })

  it('tolerates a date value whose field object has no name', () => {
    // The query spreads `... on IssueFieldDate { name }` only, so a date value
    // backed by another field type arrives as `field: {}`.
    const task = mapIssue(syntheticNodes[1], cfg)

    expect(() => mapIssue(syntheticNodes[1], cfg)).not.toThrow()
    // It must not be mistaken for the start field: the body date wins instead.
    expect(day(task.start)).toBe('2026-03-10')
  })
})

describe('mapIssue — fallback chain', () => {
  it('falls back to body dates when there is no matching field', () => {
    const task = mapIssue(syntheticNodes[1], cfg)

    expect(day(task.start)).toBe('2026-03-10')
    expect(day(task.due)).toBe('2026-03-20')
  })

  it('falls back to the milestone when there is no field and no body date', () => {
    const task = mapIssue(syntheticNodes[2], cfg)

    expect(day(task.due)).toBe('2026-04-30')
    expect(day(task.start)).toBe('2026-04-29')
  })
})

describe('mapIssue — dependencies', () => {
  // blockedBy on A returns B => B must finish first => A.dependsOn = [B.id].
  // Reversed, this renders plausibly and wrongly, so pin the direction here.
  it('maps blockedBy node ids into dependsOn, in that direction', () => {
    const build = mapIssue(syntheticNodes[1], cfg)
    const ship = mapIssue(syntheticNodes[2], cfg)

    expect(build.dependsOn).toEqual(['I_kwDOSYNTH001', 'I_kwDOELSEWHERE'])
    expect(ship.dependsOn).toEqual(['I_kwDOSYNTH002'])
    // The blocker itself depends on nothing.
    expect(mapIssue(syntheticNodes[0], cfg).dependsOn).toEqual([])
  })

  it('keeps edges pointing outside the loaded set, leaving pruning to the graph layer', () => {
    expect(mapIssue(syntheticNodes[1], cfg).dependsOn).toContain('I_kwDOELSEWHERE')
  })
})

describe('mapIssue — malformed input', () => {
  const base = syntheticNodes[0]

  it('survives a null body, null milestone and null connections', () => {
    const node = {
      ...base,
      body: null,
      milestone: null,
      issueFieldValues: null,
      blockedBy: null,
    } as GitHubIssueNode

    const task = mapIssue(node, cfg)

    expect(task.dependsOn).toEqual([])
    expect(day(task.start)).toBe('2026-02-01')
  })

  it('warns rather than throwing on an unparseable field value', () => {
    const node = {
      ...base,
      issueFieldValues: {
        nodes: [{ __typename: 'IssueFieldDateValue', value: 'whenever', field: { name: 'Start date' } }],
      },
    } as GitHubIssueNode

    const task = mapIssue(node, cfg)

    expect(task.warnings.join(' ')).toContain('not a valid date')
    expect(Number.isNaN(task.start.getTime())).toBe(false)
  })
})
