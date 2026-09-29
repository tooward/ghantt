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

import { format, startOfDay } from 'date-fns'
import { isRepoMilestone, type Milestone, type MilestoneRef, type Task, type TaskId } from './Task'

/** Ids of stand-in diamond rows, for milestones with no release issue. */
export const MILESTONE_ROW_PREFIX = 'milestone:'

interface Group {
  milestone: Milestone | MilestoneRef
  members: Task[]
  releases: Task[]
}

/**
 * The rows the chart draws, in order, with milestones as diamonds
 * (ARCHITECTURE.md §5.5). Pure: the tasks passed in are copied, never changed.
 *
 * - Each milestone's issues are grouped together, by start date, and its
 *   diamond row closes the group. Groups run by due date; milestones with
 *   none come after, then issues in no milestone, in the order given — so a
 *   repository with no milestones charts exactly as before.
 * - The diamond is the milestone's release issue (the one with the release
 *   label), keeping its own id so its blocked-by links still leave from it.
 *   A dated milestone with no release issue gets a stand-in row instead —
 *   when none of its issues is loaded, only if it is not yet past.
 * - The diamond sits on the milestone's due date, never moved by its issues.
 *   Issues that end after it are warned about instead, on both sides.
 * - The last issues of a milestone — those no other issue in it waits on —
 *   roll up to the diamond with an arrow. Work that waits on the release is
 *   left out of the roll-up even when it sits in the same milestone, since
 *   that would be a loop.
 *
 * Warnings only use dates somebody chose (a field, or Days), as elsewhere:
 * an End taken from the milestone itself, or a Start from the creation date,
 * says nothing about the plan.
 */
export function buildTimeline(tasks: Task[], milestones: Milestone[], today: Date = startOfDay(new Date())): Task[] {
  const known = new Map<string, Milestone | MilestoneRef>(milestones.map((m) => [m.id, m]))
  for (const task of tasks) {
    if (task.milestone && !known.has(task.milestone.id)) known.set(task.milestone.id, task.milestone)
  }

  const groups = new Map<string, Group>()
  for (const milestone of known.values()) groups.set(milestone.id, { milestone, members: [], releases: [] })
  const ungrouped: Task[] = []
  for (const task of tasks) {
    const group = task.milestone ? groups.get(task.milestone.id) : undefined
    if (!group) ungrouped.push(task)
    else if (task.isRelease) group.releases.push(task)
    else group.members.push(task)
  }

  const downstream = dependents(tasks)
  const extra = new Map<TaskId, string[]>()
  const warn = (id: TaskId, message: string) => extra.set(id, [...(extra.get(id) ?? []), message])
  /** Release rows: id → the diamond's day and name, for the early-start check. */
  const releaseDates = new Map<TaskId, { date: Date; name: string }>()
  const rows: Task[] = []

  const ordered = [...groups.values()].sort(byDueDate)
  for (const group of ordered) {
    const { milestone } = group
    const members = [...group.members].sort((a, b) => a.start.getTime() - b.start.getTime() || a.number - b.number)
    const releases = [...group.releases].sort((a, b) => a.number - b.number)
    const primary = releases[0] ?? null
    const date = milestone.dueOn ?? primary?.due ?? null

    if (releases.length > 1) {
      const numbers = releases.map((r) => `#${r.number}`).join(', ')
      for (const release of releases) {
        warn(release.id, `More than one issue in milestone “${milestone.title}” has the release label (${numbers}).`)
      }
    }

    // Nothing to draw: a milestone with no due date, no release and no issues loaded.
    if (!date && members.length === 0) continue
    // An empty milestone long past its date is usually forgotten, and would
    // stretch the chart's range back to it. Past ones show only with issues.
    if (members.length === 0 && !primary && date && date < today) continue
    rows.push(...members)
    if (!date) continue

    // Work waiting on the release is not part of what the release waits on.
    const afterRelease = primary ? downstream(primary.id) : new Set<TaskId>()
    const rolled = members.filter((member) => !afterRelease.has(member.id))
    const rolledIds = new Set(rolled.map((member) => member.id))
    const waitedOn = new Set(rolled.flatMap((member) => member.dependsOn.filter((id) => rolledIds.has(id))))
    const last = rolled.filter((member) => !waitedOn.has(member.id)).map((member) => member.id)

    const late = rolled.filter((member) => chosen(member.dateSources.due) && member.due > date)
    for (const member of late) {
      warn(member.id, `Ends ${day(member.due)}, after milestone “${milestone.title}” (${day(date)}).`)
    }
    const lateNote = late.length === 0
      ? null
      : `${late.length === 1 ? '1 issue finishes' : `${late.length} issues finish`} after this milestone; the latest, ` +
        `#${latest(late).number}, ends ${day(latest(late).due)}.`

    for (const release of releases) {
      const isPrimary = release === primary
      if (milestone.dueOn && release.dateSources.due === 'field' && release.due.getTime() !== milestone.dueOn.getTime()) {
        warn(release.id, `Its End (${day(release.due)}) is not the milestone’s due date (${day(milestone.dueOn)}); the diamond is drawn on the milestone’s.`)
      }
      if (isPrimary && lateNote) warn(release.id, lateNote)
      releaseDates.set(release.id, { date, name: release.title })
      rows.push({
        ...release,
        start: date,
        due: date,
        dependsOn: isPrimary ? unique([...release.dependsOn, ...last]) : release.dependsOn,
        marker: { milestone, date, synthetic: false },
      })
    }

    if (!primary) {
      rows.push(standIn(milestone, date, last, lateNote ? [lateNote] : []))
    }
  }

  for (const task of ungrouped) {
    if (!task.isRelease) {
      rows.push(task)
      continue
    }
    // A release in no milestone is still a release: a diamond on its own End.
    releaseDates.set(task.id, { date: task.due, name: task.title })
    rows.push({ ...task, start: task.due, marker: { milestone: null, date: task.due, synthetic: false } })
  }

  // Finish-to-start: work waiting on a release should start after its day.
  for (const row of rows) {
    if (row.marker || row.dateSources.start !== 'field') continue
    for (const id of row.dependsOn) {
      const release = releaseDates.get(id)
      if (release && row.start.getTime() <= release.date.getTime()) {
        warn(row.id, `Starts ${day(row.start)}, before the release it waits on, “${release.name}” (${day(release.date)}).`)
      }
    }
  }

  return rows.map((row) => {
    const added = extra.get(row.id)
    return added ? { ...row, warnings: [...row.warnings, ...added] } : row
  })
}

/** A diamond for a milestone that has no release issue. It is no issue, so it cannot be edited or linked. */
function standIn(milestone: Milestone | MilestoneRef, date: Date, dependsOn: TaskId[], warnings: string[]): Task {
  return {
    id: `${MILESTONE_ROW_PREFIX}${milestone.id}`,
    number: 0,
    title: milestone.title,
    url: isRepoMilestone(milestone) ? milestone.url : '',
    start: date,
    due: date,
    dependsOn,
    blockers: [],
    blocking: [],
    effort: null,
    effortDays: null,
    dateSources: { start: 'milestone', due: 'milestone' },
    canSetFields: false,
    warnings,
    milestone,
    isRelease: false,
    marker: { milestone, date, synthetic: true },
  }
}

/** Every task that waits on `id`, directly or through others. */
function dependents(tasks: Task[]): (id: TaskId) => Set<TaskId> {
  const waiters = new Map<TaskId, TaskId[]>()
  for (const task of tasks) {
    for (const blocker of task.dependsOn) waiters.set(blocker, [...(waiters.get(blocker) ?? []), task.id])
  }
  return (id) => {
    const found = new Set<TaskId>()
    const queue = [...(waiters.get(id) ?? [])]
    while (queue.length > 0) {
      const next = queue.shift()!
      if (found.has(next)) continue
      found.add(next)
      queue.push(...(waiters.get(next) ?? []))
    }
    return found
  }
}

function byDueDate(a: Group, b: Group): number {
  const x = a.milestone.dueOn?.getTime() ?? Infinity
  const y = b.milestone.dueOn?.getTime() ?? Infinity
  return x - y || a.milestone.title.localeCompare(b.milestone.title)
}

const chosen = (source: Task['dateSources']['due']) => source === 'field' || source === 'effort'
const latest = (tasks: Task[]) => tasks.reduce((a, b) => (b.due > a.due ? b : a))
const unique = <T>(items: T[]) => [...new Set(items)]
const day = (date: Date) => format(date, 'EEE d MMM yyyy')
