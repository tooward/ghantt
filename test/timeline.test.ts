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

import { describe, expect, it } from 'vitest'
import type { Milestone, MilestoneRef, Task, TaskId } from '../src/domain/Task'
import { detectAndBreakCycles } from '../src/domain/TaskGraph'
import { buildTimeline, MILESTONE_ROW_PREFIX } from '../src/domain/timeline'

const d = (day: number) => new Date(2026, 9, day) // October 2026

const v1: Milestone = {
  id: 'M1',
  title: 'v1.0',
  dueOn: d(9), // Fri 9 Oct
  url: 'https://github.com/o/r/milestone/1',
  openIssueCount: 3,
  closedIssueCount: 1,
}
const ref = (m: Milestone): MilestoneRef => ({ id: m.id, title: m.title, dueOn: m.dueOn })

function task(id: TaskId, start: number, due: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id}`,
    start: d(start),
    due: d(due),
    dependsOn: [],
    blockers: [],
    blocking: [],
    effort: null,
    effortDays: null,
    dateSources: { start: 'field', due: 'field' },
    canSetFields: true,
    warnings: [],
    milestone: null,
    isRelease: false,
    ...extra,
  }
}

const inV1 = { milestone: ref(v1) }
const ids = (rows: Task[]) => rows.map((row) => row.id)
const row = (rows: Task[], id: TaskId) => rows.find((r) => r.id === id)!

describe('buildTimeline', () => {
  it('leaves a chart with no milestones exactly as it was', () => {
    const tasks = [task('#3', 5, 6), task('#1', 1, 2), task('#2', 7, 8)]

    const rows = buildTimeline(tasks, [])

    expect(rows).toEqual(tasks)
  })

  it('groups a milestone’s issues by start, closes the group with a stand-in diamond, then the rest', () => {
    const rows = buildTimeline(
      [task('#9', 1, 2), task('#2', 6, 7, inV1), task('#1', 5, 8, inV1)],
      [v1],
    )

    expect(ids(rows)).toEqual(['#1', '#2', `${MILESTONE_ROW_PREFIX}M1`, '#9'])
    const diamond = row(rows, `${MILESTONE_ROW_PREFIX}M1`)
    expect(diamond.marker).toEqual({ milestone: v1, date: d(9), synthetic: true })
    expect(diamond.start).toEqual(d(9))
    expect(diamond.due).toEqual(d(9))
    expect(diamond.url).toBe(v1.url)
  })

  it('orders milestones by due date, undated ones after', () => {
    const v2: Milestone = { ...v1, id: 'M2', title: 'v2.0', dueOn: d(30) }
    const later: Milestone = { ...v1, id: 'M3', title: 'Someday', dueOn: null }
    const rows = buildTimeline(
      [task('#1', 1, 2, { milestone: ref(later) }), task('#2', 1, 2, { milestone: ref(v2) }), task('#3', 1, 2, inV1)],
      [v2, later, v1],
    )

    expect(ids(rows)).toEqual(['#3', 'milestone:M1', '#2', 'milestone:M2', '#1'])
  })

  it('shows an empty open milestone only while its date is not past', () => {
    expect(ids(buildTimeline([], [v1], d(9)))).toEqual(['milestone:M1'])
    expect(ids(buildTimeline([], [v1], d(10)))).toEqual([])
    // With an issue loaded, a past milestone still shows: that issue is late.
    expect(ids(buildTimeline([task('#1', 1, 2, inV1)], [v1], d(10)))).toEqual(['#1', 'milestone:M1'])
  })

  it('draws the release issue as the diamond, keeping its id and links', () => {
    const release = task('#5', 1, 1, { ...inV1, isRelease: true, dependsOn: ['#8'] })
    const after = task('#6', 12, 14, { dependsOn: ['#5'] })
    const rows = buildTimeline([task('#8', 1, 2), release, after], [v1])

    const diamond = row(rows, '#5')
    expect(diamond.marker).toEqual({ milestone: v1, date: d(9), synthetic: false })
    expect(diamond.start).toEqual(d(9))
    expect(diamond.dependsOn).toEqual(['#8'])
    expect(ids(rows)).not.toContain('milestone:M1')
    expect(row(rows, '#6').dependsOn).toEqual(['#5'])
  })

  it('rolls up only the last issues of the milestone', () => {
    // #1 → #2 inside the milestone; #3 stands alone. #2 and #3 are last.
    const rows = buildTimeline(
      [task('#1', 1, 2, inV1), task('#2', 5, 6, { ...inV1, dependsOn: ['#1'] }), task('#3', 5, 7, inV1)],
      [v1],
    )

    expect(row(rows, 'milestone:M1').dependsOn).toEqual(['#2', '#3'])
  })

  it('does not roll up work that waits on the release, even inside the milestone', () => {
    const release = task('#5', 9, 9, { ...inV1, isRelease: true })
    const followUp = task('#6', 12, 13, { ...inV1, dependsOn: ['#5'] })
    const rows = buildTimeline([task('#1', 1, 2, inV1), release, followUp], [v1])

    // Rolling #6 up to #5 would make a loop: #5 → #6 → #5.
    expect(row(rows, '#5').dependsOn).toEqual(['#1'])
    expect(row(rows, '#6').warnings).toEqual([])
  })

  it('warns on the issue and the diamond when an issue ends after the milestone', () => {
    const rows = buildTimeline([task('#1', 1, 2, inV1), task('#2', 5, 13, inV1)], [v1])

    expect(row(rows, '#2').warnings).toEqual(['Ends Tue 13 Oct 2026, after milestone “v1.0” (Fri 9 Oct 2026).'])
    expect(row(rows, 'milestone:M1').warnings).toEqual([
      '1 issue finishes after this milestone; the latest, #2, ends Tue 13 Oct 2026.',
    ])
  })

  it('does not warn about an End that was not chosen', () => {
    const rows = buildTimeline(
      [task('#2', 5, 13, { ...inV1, dateSources: { start: 'field', due: 'default' } })],
      [v1],
    )

    expect(row(rows, '#2').warnings).toEqual([])
    expect(row(rows, 'milestone:M1').warnings).toEqual([])
  })

  it('flags more than one release issue in a milestone, rather than guessing', () => {
    const rows = buildTimeline(
      [task('#5', 9, 9, { ...inV1, isRelease: true }), task('#4', 9, 9, { ...inV1, isRelease: true })],
      [v1],
    )

    for (const id of ['#4', '#5']) {
      expect(row(rows, id).warnings).toEqual(['More than one issue in milestone “v1.0” has the release label (#4, #5).'])
      expect(row(rows, id).marker).toBeDefined()
    }
  })

  it('flags a release whose End field is not the milestone’s due date, and draws it on the milestone’s', () => {
    const rows = buildTimeline([task('#5', 12, 12, { ...inV1, isRelease: true })], [v1])

    expect(row(rows, '#5').due).toEqual(d(9))
    expect(row(rows, '#5').warnings).toEqual([
      'Its End (Mon 12 Oct 2026) is not the milestone’s due date (Fri 9 Oct 2026); the diamond is drawn on the milestone’s.',
    ])
  })

  it('warns when work waiting on a release starts on or before its day, only for a Start field', () => {
    const release = task('#5', 9, 9, { ...inV1, isRelease: true })
    const rows = buildTimeline(
      [
        release,
        task('#6', 9, 12, { dependsOn: ['#5'] }),
        task('#7', 8, 12, { dependsOn: ['#5'], dateSources: { start: 'created', due: 'field' } }),
        task('#8', 12, 13, { dependsOn: ['#5'] }),
      ],
      [v1],
    )

    expect(row(rows, '#6').warnings).toEqual([
      'Starts Fri 9 Oct 2026, before the release it waits on, “Issue #5” (Fri 9 Oct 2026).',
    ])
    expect(row(rows, '#7').warnings).toEqual([])
    expect(row(rows, '#8').warnings).toEqual([])
  })

  it('draws a release in no milestone as a diamond on its own End', () => {
    const rows = buildTimeline([task('#5', 3, 7, { isRelease: true })], [])

    expect(row(rows, '#5').marker).toEqual({ milestone: null, date: d(7), synthetic: false })
    expect(row(rows, '#5').start).toEqual(d(7))
  })

  it('groups an undated milestone’s issues without a diamond, unless it has a release', () => {
    const someday: MilestoneRef = { id: 'M9', title: 'Someday', dueOn: null }
    expect(ids(buildTimeline([task('#1', 1, 2, { milestone: someday })], []))).toEqual(['#1'])

    const rows = buildTimeline([task('#1', 1, 2, { milestone: someday }), task('#5', 4, 6, { milestone: someday, isRelease: true })], [])
    expect(ids(rows)).toEqual(['#1', '#5'])
    expect(row(rows, '#5').marker?.date).toEqual(d(6))
  })

  it('never changes the tasks it is given', () => {
    const tasks = [task('#2', 5, 13, inV1)]
    const copy = structuredClone(tasks)

    buildTimeline(tasks, [v1])

    expect(tasks).toEqual(copy)
  })

  it('can close a loop across two milestones’ roll-ups, which the cycle check then breaks', () => {
    const v2: Milestone = { ...v1, id: 'M2', title: 'v2.0', dueOn: d(23) }
    const inV2 = { milestone: ref(v2) }
    // X (in v1) waits on release B; Y (in v2) waits on release A. Each is the
    // last issue of its milestone, so A rolls up X and B rolls up Y:
    // B → Y → A → X → B, a loop made only of roll-ups and plain links.
    const tasks = [
      task('#10', 9, 9, { ...inV1, isRelease: true }),
      task('#11', 23, 23, { ...inV2, isRelease: true }),
      task('#12', 5, 6, { ...inV1, dependsOn: ['#11'] }),
      task('#13', 12, 14, { ...inV2, dependsOn: ['#10'] }),
    ]

    const rows = buildTimeline(tasks, [v1, v2])
    const checked = detectAndBreakCycles(rows)

    expect(checked.brokenEdges.length).toBeGreaterThan(0)
    expect(detectAndBreakCycles(checked.tasks).brokenEdges).toEqual([])
  })
})
