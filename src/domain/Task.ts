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

import type { DateSource } from './dateResolution'

export type TaskId = string

/**
 * The other end of a blocking relationship, as GitHub reports it. Unlike
 * `dependsOn`, which the graph layer prunes, these keep every link — closed,
 * cross-repository or not yet loaded — so the detail panel can list them all.
 */
export interface LinkedIssue {
  id: TaskId
  number: number
  title: string
  /** Closed issues no longer hold anything up, but are still shown. */
  closed: boolean
  /** Set only when the blocker lives in another repository, e.g. `acme/api`. */
  repository: string | null
}

/** The milestone an issue belongs to, as the issue reports it. */
export interface MilestoneRef {
  id: string
  title: string
  /** The due day, local midnight; null when the milestone has no due date. */
  dueOn: Date | null
}

/** A repository milestone, with what the chart shows about it. */
export interface Milestone extends MilestoneRef {
  url: string
  /** Counts over every issue in the milestone, of every type, not only what is charted. */
  openIssueCount: number
  closedIssueCount: number
}

/** A milestone from the repository's list, with its link and counts, rather than an issue's reference to one. */
export function isRepoMilestone(milestone: Milestone | MilestoneRef | null | undefined): milestone is Milestone {
  return !!milestone && 'openIssueCount' in milestone
}

/**
 * Set only on chart rows that are drawn as a milestone diamond: either the
 * release issue of a milestone, or a stand-in for a milestone that has none.
 */
export interface Marker {
  /** The milestone this diamond stands for; null for a release issue in none. */
  milestone: Milestone | MilestoneRef | null
  /** The diamond's day. */
  date: Date
  /** True for a stand-in row, which is no issue and has no panel of its own. */
  synthetic: boolean
}

/**
 * A single bar on the chart. Dates are always valid — `resolveDates` guarantees
 * it — so nothing downstream has to defend against `Invalid Date`.
 */
export interface Task {
  id: TaskId
  number: number
  title: string
  url: string
  start: Date
  due: Date
  /** Ids of tasks that must finish before this one can start. */
  dependsOn: TaskId[]
  /** Issues that block this one ("blocked by"). */
  blockers: LinkedIssue[]
  /** Issues this one blocks. The reverse of other tasks' `blockers`. */
  blocking: LinkedIssue[]
  /** The Days field's value as displayed — a number or a select option name. */
  effort: string | null
  /**
   * Days in working days, from a Number field only and only when above zero.
   * A single-select Days field is shown via `effort` but never calculated with.
   */
  effortDays: number | null
  /** Where each date came from: a field, Days, the milestone, a default or the creation date. */
  dateSources: { start: DateSource; due: DateSource }
  /**
   * The user may set this issue's fields. Not proof the token can: a
   * read-only token only finds out on save.
   */
  canSetFields: boolean
  /** Non-fatal problems found while building this task, shown in the UI. */
  warnings: string[]
  milestone: MilestoneRef | null
  /** Carries the release label: drawn as its milestone's diamond. */
  isRelease: boolean
  /** Only on rows built for the chart by `buildTimeline`; see `Marker`. */
  marker?: Marker
}
