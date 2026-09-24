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

    // Created Fri 5 May 2017; a one-day default ends that same day.
    expect(day(task.start)).toBe('2017-05-05')
    expect(day(task.due)).toBe('2017-05-05')
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
    // It must not be mistaken for the start field: the milestone rung wins
    // instead, and a one-day task on Thu 30 Apr starts that day.
    expect(day(task.start)).toBe('2026-04-30')
  })
})

describe('mapIssue — permissions', () => {
  it('reads viewerCanSetFields, treating an absent value as no', () => {
    expect(mapIssue(syntheticNodes[0], cfg).canSetFields).toBe(true)
    expect(mapIssue(syntheticNodes[2], cfg).canSetFields).toBe(false)
    expect(mapIssue(liveNodes[0], cfg).canSetFields).toBe(false)
  })
})

describe('mapIssue — effort', () => {
  it('reads a number field, matching the name case-insensitively', () => {
    expect(mapIssue(syntheticNodes[0], cfg).effort).toBe('6')
  })

  it('reads a single-select field as its option name', () => {
    expect(mapIssue(syntheticNodes[1], cfg).effort).toBe('M')
  })

  it('is null when the issue has no effort, or the name is configured away', () => {
    expect(mapIssue(syntheticNodes[2], cfg).effort).toBeNull()
    expect(mapIssue(syntheticNodes[0], { ...cfg, daysFieldName: 'Size' }).effort).toBeNull()
  })

  it('calculates only with a Number Days above zero', () => {
    expect(mapIssue(syntheticNodes[0], cfg).effortDays).toBe(6)
    // A single-select Days is shown, but never calculated with.
    expect(mapIssue(syntheticNodes[1], cfg).effort).toBe('M')
    expect(mapIssue(syntheticNodes[1], cfg).effortDays).toBeNull()
  })

  it('fits node 0’s dates to its Days, so it carries no warning', () => {
    // Mon 2 – Mon 9 Mar is six working days, and Days is six.
    expect(mapIssue(syntheticNodes[0], cfg).warnings).toEqual([])
  })

  it('warns when the dates are shorter than a Number Days', () => {
    const node = {
      ...syntheticNodes[0],
      issueFieldValues: {
        nodes: [
          { __typename: 'IssueFieldDateValue', value: '2026-10-01', field: { name: 'Start' } },
          { __typename: 'IssueFieldDateValue', value: '2026-10-05', field: { name: 'End' } },
          { __typename: 'IssueFieldNumberValue', numberValue: 5, field: { name: 'Days' } },
        ],
      },
    } as GitHubIssueNode

    expect(mapIssue(node, cfg).warnings).toEqual(['Start–End gives 3 working days; Days is set to 5.'])
  })

  it('reads Days, not a single-select Effort field alongside it', () => {
    const node = {
      ...syntheticNodes[0],
      issueFieldValues: {
        nodes: [
          { __typename: 'IssueFieldSingleSelectValue', optionName: 'L', field: { name: 'Effort' } },
          { __typename: 'IssueFieldNumberValue', numberValue: 3, field: { name: 'Days' } },
        ],
      },
    } as GitHubIssueNode

    expect(mapIssue(node, cfg).effort).toBe('3')
    expect(mapIssue(node, cfg).effortDays).toBe(3)
  })

  it('does not take another select field for effort', () => {
    // Node 0 also has a Priority select; only the Days field counts.
    expect(mapIssue(syntheticNodes[0], { ...cfg, daysFieldName: 'Priority' }).effort).toBe('High')
    expect(mapIssue(syntheticNodes[0], cfg).effort).not.toBe('High')
  })
})

describe('mapIssue — fallback chain', () => {
  it('falls back to the milestone when there is no matching field', () => {
    const task = mapIssue(syntheticNodes[2], cfg)

    expect(day(task.due)).toBe('2026-04-30')
    expect(day(task.start)).toBe('2026-04-30')
  })
})

describe('mapIssue — dependencies', () => {
  // blockedBy on A returns B => B must finish first => A.dependsOn = [B.id].
  // Reversed, this renders plausibly and wrongly, so pin the direction here.
  it('maps blockedBy node ids into dependsOn, in that direction', () => {
    const build = mapIssue(syntheticNodes[1], cfg)
    const ship = mapIssue(syntheticNodes[2], cfg)

    expect(build.dependsOn).toEqual(['I_kwDOSYNTH001', 'I_kwDOELSEWHERE'])
    expect(ship.dependsOn).toEqual(['I_kwDOSYNTH002', 'I_kwDOSYNTH000'])
    // The blocker itself depends on nothing.
    expect(mapIssue(syntheticNodes[0], cfg).dependsOn).toEqual([])
  })

  it('keeps edges pointing outside the loaded set, leaving pruning to the graph layer', () => {
    expect(mapIssue(syntheticNodes[1], cfg).dependsOn).toContain('I_kwDOELSEWHERE')
  })

  it('keeps every blocker for display, naming the repository only when it differs', () => {
    expect(mapIssue(syntheticNodes[1], cfg).blockers).toEqual([
      { id: 'I_kwDOSYNTH001', number: 101, title: 'Design the thing', closed: false, repository: null },
      { id: 'I_kwDOELSEWHERE', number: 7, title: 'Stable API', closed: false, repository: 'acme/api' },
    ])
    expect(mapIssue(syntheticNodes[2], cfg).blockers[1]).toMatchObject({ number: 100, closed: true })
  })

  it('maps the reverse direction into blocking', () => {
    expect(mapIssue(syntheticNodes[0], cfg).blocking).toEqual([
      { id: 'I_kwDOSYNTH002', number: 102, title: 'Build the thing', closed: false, repository: null },
    ])
    expect(mapIssue(syntheticNodes[2], cfg).blocking).toEqual([])
  })
})

describe('mapIssue — malformed input', () => {
  const base = syntheticNodes[0]

  it('survives a null milestone and null connections', () => {
    const node = {
      ...base,
      milestone: null,
      issueFieldValues: null,
      blockedBy: null,
      blocking: null,
    } as GitHubIssueNode

    const task = mapIssue(node, cfg)

    expect(task.dependsOn).toEqual([])
    expect(task.blockers).toEqual([])
    expect(task.blocking).toEqual([])
    expect(task.effort).toBeNull()
    expect(day(task.start)).toBe('2026-02-01')
  })

  it('warns rather than throwing on an unparseable field value', () => {
    const node = {
      ...base,
      issueFieldValues: {
        nodes: [{ __typename: 'IssueFieldDateValue', value: 'whenever', field: { name: 'Start' } }],
      },
    } as GitHubIssueNode

    const task = mapIssue(node, cfg)

    expect(task.warnings.join(' ')).toContain('not a valid date')
    expect(Number.isNaN(task.start.getTime())).toBe(false)
  })
})
