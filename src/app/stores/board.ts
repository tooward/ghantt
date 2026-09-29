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

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { GitHubIssueSource } from '../../adapters/github/GitHubIssueSource'
import { AuthError, type RateLimitInfo } from '../../adapters/github/GitHubClient'
import type { Milestone, Task, TaskId } from '../../domain/Task'
import { detectAndBreakCycles, pruneDanglingEdges, wouldCreateCycle } from '../../domain/TaskGraph'
import { buildTimeline } from '../../domain/timeline'
import type { IssueSource, RepoRef } from '../../ports/IssueSource'
import type { FieldKind, FieldValue, IssueFieldRef, IssueWriter } from '../../ports/IssueWriter'
import { formatIssueRef, parseIssueRef, type IssueRef } from '../issueRef'
import { githubClient } from './auth'
import { useSettingsStore } from './settings'

export interface BoardGraph {
  /** Ready to render: every edge points at a task in this same array. */
  tasks: Task[]
  /** Edges pointing outside the loaded set — closed, elsewhere, or not yet paged in. */
  droppedEdges: number
  brokenCycles: number
}

/**
 * New values for one task: dates as `YYYY-MM-DD`, Days in working days or
 * null to clear it. Only what the user changed.
 */
export interface FieldChanges {
  start?: string
  due?: string
  effort?: number | null
}

/** Why each field cannot be edited, or null when it can. For the detail panel. */
export interface FieldEditability {
  start: string | null
  due: string | null
  effort: string | null
}

const KIND_NAMES: Record<FieldKind, string> = {
  date: 'a date',
  number: 'a number',
  'single-select': 'a single-select',
  'multi-select': 'a multi-select',
  text: 'a text',
}

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore()
  const github = new GitHubIssueSource(githubClient, () => settings.mapConfig())
  const source = shallowRef<IssueSource>(github)
  const writer = shallowRef<IssueWriter | null>(github)

  const repo = ref<RepoRef | null>(null)
  /**
   * Tasks exactly as mapped, with `dependsOn` untouched. Pruning happens in
   * the derived graph below, never here: an edge dropped now because its
   * target has not loaded yet must come back when a later page supplies it.
   */
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const cursor = ref<string | null>(null)
  const hasNextPage = ref(false)
  const totalCount = ref(0)
  const issueTypes = ref<string[]>([])
  /** The repository's issue fields, with the ids a save needs and their kinds. */
  const fields = ref<IssueFieldRef[]>([])
  /** Set when the field lookup failed: editing is off, the chart is not. */
  const fieldsError = ref<string | null>(null)
  /** Open milestones, for the diamonds. Empty when the lookup failed: the chart still works. */
  const milestones = shallowRef<Milestone[]>([])
  const rateLimit = shallowRef<RateLimitInfo | null>(null)
  /**
   * Issues fetched one at a time for linking, keyed by id. Not on the board,
   * but their own links still count when checking a new link for loops.
   */
  const lookups = new Map<TaskId, Task>()

  /** Recomputed over the whole accumulated set, so paging in issues heals edges. */
  const graph = computed<BoardGraph>(() => {
    const pruned = pruneDanglingEdges(tasks.value)
    const broken = detectAndBreakCycles(pruned.tasks)
    return {
      tasks: broken.tasks,
      droppedEdges: pruned.dropped,
      brokenCycles: broken.brokenEdges.length,
    }
  })

  function fieldNamed(name: string): IssueFieldRef | null {
    const wanted = name.trim().toLowerCase()
    return fields.value.find((field) => field.name.trim().toLowerCase() === wanted) ?? null
  }

  const startField = computed(() => fieldNamed(settings.startFieldName))
  const dueField = computed(() => fieldNamed(settings.dueFieldName))
  const effortField = computed(() => fieldNamed(settings.daysFieldName))

  const fieldEditability = computed<FieldEditability>(() => {
    const why = (field: IssueFieldRef | null, name: string, kind: FieldKind): string | null => {
      if (!writer.value) return 'Editing is not available.'
      if (fieldsError.value) return `Could not look up this repository’s issue fields: ${fieldsError.value}`
      if (!field) return `This repository has no ${kind === 'date' ? 'date ' : ''}field named “${name}”.`
      // Say what it is: "Days is a single-select field here" rather than
      // just "no Days field", so a wrongly typed field is easy to spot.
      if (field.kind !== kind) {
        return `“${field.name}” is ${KIND_NAMES[field.kind]} field here; editing needs ${KIND_NAMES[kind]} field.`
      }
      return null
    }
    return {
      start: why(startField.value, settings.startFieldName, 'date'),
      due: why(dueField.value, settings.dueFieldName, 'date'),
      effort: why(effortField.value, settings.daysFieldName, 'number'),
    }
  })

  /** What the chart draws: the graph's tasks grouped by milestone, with diamond rows. */
  // Cycle-checked again: roll-ups in two milestones can close a loop between their releases.
  const timeline = computed<Task[]>(() => detectAndBreakCycles(buildTimeline(graph.value.tasks, milestones.value)).tasks)

  const isEmpty = computed(() => !loading.value && tasks.value.length === 0)

  /** `keepOnError`: a failed refresh leaves the chart that was already there. */
  async function fetchPage(cursorValue: string | null, keepOnError = false): Promise<void> {
    const target = repo.value
    if (!target) return

    loading.value = true
    error.value = null
    try {
      const page = await source.value.fetchPage(target, cursorValue, settings.pageSize)
      tasks.value = cursorValue === null ? page.tasks : [...tasks.value, ...page.tasks]
      cursor.value = page.endCursor
      hasNextPage.value = page.hasNextPage
      totalCount.value = page.totalCount
      issueTypes.value = page.issueTypes
      if (source.value instanceof GitHubIssueSource) rateLimit.value = source.value.lastRateLimit
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Loading issues failed.'
      if (cursorValue === null && !keepOnError) tasks.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadRepo(owner: string, name: string, issueType: string | null = null): Promise<void> {
    repo.value = { owner: owner.trim(), name: name.trim(), issueType: issueType?.trim() || null }
    tasks.value = []
    cursor.value = null
    hasNextPage.value = false
    totalCount.value = 0
    fields.value = []
    fieldsError.value = null
    milestones.value = []
    lookups.clear()
    void loadFields(repo.value)
    void loadMilestones(repo.value)
    await fetchPage(null)
  }

  /** Beside the first page too: a failure here only leaves the diamonds out. */
  async function loadMilestones(target: RepoRef): Promise<void> {
    const fetch = source.value.fetchMilestones
    if (!fetch) return
    try {
      const found = await fetch.call(source.value, target)
      if (repo.value === target) milestones.value = found
    } catch {
      // Deliberately quiet: the issues, and editing, are unaffected.
    }
  }

  /** Runs beside the first page, never in front of it: a failure here only turns editing off. */
  async function loadFields(target: RepoRef): Promise<void> {
    if (!writer.value) return
    try {
      const found = await writer.value.fields(target)
      if (repo.value === target) fields.value = found
    } catch (cause) {
      if (repo.value === target) fieldsError.value = cause instanceof Error ? cause.message : 'unknown error'
    }
  }

  /**
   * Write new Start / End / Days values to GitHub in one call and swap in the
   * issue as GitHub returns it. Resolves to an error message for the panel, or
   * null on success. Never touches the connection: a read-only token is a
   * failed save, not a logout.
   */
  async function saveFields(taskId: TaskId, changes: FieldChanges): Promise<string | null> {
    const target = writer.value
    if (!target) return 'Editing is not available.'

    const values: FieldValue[] = []
    for (const [key, field] of [['start', startField.value], ['due', dueField.value]] as const) {
      const date = changes[key]
      if (date === undefined) continue
      const reason = fieldEditability.value[key]
      if (!field || reason) return reason ?? 'That date cannot be edited.'
      values.push({ fieldId: field.id, date })
    }
    if (changes.effort !== undefined) {
      const field = effortField.value
      const reason = fieldEditability.value.effort
      if (!field || reason) return reason ?? 'Days cannot be edited.'
      if (changes.effort === null) values.push({ fieldId: field.id, clear: true })
      else if (Number.isFinite(changes.effort) && changes.effort > 0) values.push({ fieldId: field.id, number: changes.effort })
      else return 'Days must be a number above zero.'
    }
    if (values.length === 0) return null

    try {
      replaceTasks([await target.setFields(taskId, values)])
      return null
    } catch (cause) {
      return writeFailure(cause)
    }
  }

  /**
   * Record "`blockedId` is blocked by `blockerId`" in GitHub. Refused here,
   * before any request, when the loaded tasks show it would close a loop.
   * Resolves to an error message, or null on success.
   */
  async function linkBlocker(blockedId: TaskId, blockerId: TaskId): Promise<string | null> {
    const target = writer.value
    if (!target) return 'Editing is not available.'
    if (wouldCreateCycle(knownTasks(), blockedId, blockerId)) {
      return 'That would make a loop: the blocker already waits on this issue, directly or through others.'
    }
    try {
      replaceTasks(await target.addBlockedBy(blockedId, blockerId))
      return null
    } catch (cause) {
      return writeFailure(cause)
    }
  }

  async function unlinkBlocker(blockedId: TaskId, blockerId: TaskId): Promise<string | null> {
    const target = writer.value
    if (!target) return 'Editing is not available.'
    try {
      replaceTasks(await target.removeBlockedBy(blockedId, blockerId))
      return null
    } catch (cause) {
      return writeFailure(cause)
    }
  }

  /** Loaded tasks plus looked-up ones: everything the loop check can see. */
  function knownTasks(): Task[] {
    if (lookups.size === 0) return tasks.value
    const loaded = new Set(tasks.value.map((task) => task.id))
    return [...tasks.value, ...[...lookups.values()].filter((task) => !loaded.has(task.id))]
  }

  /**
   * What the picker can offer to look up for this text — "#123", a pasted
   * issue URL, "owner/repo#123" — or null when the text is not a reference.
   */
  function issueRefFor(text: string): { ref: IssueRef; label: string } | null {
    if (!source.value.fetchIssue) return null
    const ref = parseIssueRef(text, repo.value)
    return ref ? { ref, label: formatIssueRef(ref, repo.value) } : null
  }

  /**
   * Fetch one issue that is not on the board, so it can be linked. One
   * request, made when the user chooses to, never per keystroke. Resolves to
   * the task, or to an error message.
   */
  async function lookupIssue(ref: IssueRef): Promise<Task | string> {
    const fetchIssue = source.value.fetchIssue?.bind(source.value)
    if (!fetchIssue) return 'Looking up issues is not available.'
    const label = formatIssueRef(ref, repo.value)
    try {
      const task = await fetchIssue({ owner: ref.owner, name: ref.name }, ref.number)
      lookups.set(task.id, task)
      if (source.value instanceof GitHubIssueSource) rateLimit.value = source.value.lastRateLimit
      return task
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      if (message.includes('resolve to an Issue')) return `There is no issue ${label}. (Pull requests cannot block.)`
      if (message.includes('resolve to a Repository')) {
        return `There is no repository ${ref.owner}/${ref.name}, or your token cannot see it.`
      }
      return message || `Looking up ${label} failed.`
    }
  }

  /**
   * Swap in issues as GitHub returned them, in place, so bars keep their rows
   * and the selection stays put. Issues not on the board (another type, say)
   * are ignored: the board shows what it loaded.
   */
  function replaceTasks(updated: Task[]): void {
    // A looked-up issue comes back with its new links too; keep the loop check current.
    for (const task of updated) if (lookups.has(task.id)) lookups.set(task.id, task)
    const byId = new Map(updated.map((task) => [task.id, task]))
    if (!tasks.value.some((task) => byId.has(task.id))) return
    tasks.value = tasks.value.map((task) => byId.get(task.id) ?? task)
  }

  /** A read-only token is a failed write, not a dead connection: explain, never disconnect. */
  function writeFailure(cause: unknown): string {
    if (cause instanceof AuthError) {
      return `GitHub refused the change. Your token can read this repository but probably not write to it: changes need Issues: Read and write. (${cause.message})`
    }
    return cause instanceof Error ? cause.message : 'Saving failed.'
  }

  /**
   * Download the charted repository again, from the first page. No diffing:
   * the new page simply replaces what was there. The old chart stays up until
   * it arrives, so the view does not blank out, and stays if the request fails.
   */
  async function refresh(): Promise<void> {
    const target = repo.value
    if (!target || loading.value) return
    lookups.clear()
    fieldsError.value = null
    void loadFields(target)
    void loadMilestones(target)
    await fetchPage(null, true)
  }

  async function loadMore(): Promise<void> {
    if (!hasNextPage.value || loading.value) return
    await fetchPage(cursor.value)
  }

  function clear(): void {
    repo.value = null
    tasks.value = []
    cursor.value = null
    hasNextPage.value = false
    totalCount.value = 0
    issueTypes.value = []
    fields.value = []
    fieldsError.value = null
    milestones.value = []
    lookups.clear()
    error.value = null
  }

  /** Test seam: swap in a fake IssueSource without touching the network. */
  function useSource(replacement: IssueSource): void {
    source.value = replacement
    // The writer follows: a fake reader must not leave the real GitHub writer behind.
    writer.value = 'setFields' in replacement ? (replacement as unknown as IssueWriter) : null
  }

  /** Test seam: swap the writer, or pass null for a read-only board. */
  function useWriter(replacement: IssueWriter | null): void {
    writer.value = replacement
  }

  return {
    repo,
    tasks,
    graph,
    timeline,
    milestones,
    loading,
    error,
    cursor,
    hasNextPage,
    totalCount,
    issueTypes,
    fields,
    fieldsError,
    fieldEditability,
    rateLimit,
    isEmpty,
    loadRepo,
    refresh,
    loadMore,
    saveFields,
    linkBlocker,
    unlinkBlocker,
    issueRefFor,
    lookupIssue,
    clear,
    useSource,
    useWriter,
  }
})
