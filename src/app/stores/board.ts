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
import type { Task, TaskId } from '../../domain/Task'
import { detectAndBreakCycles, pruneDanglingEdges, wouldCreateCycle } from '../../domain/TaskGraph'
import type { IssueSource, RepoRef } from '../../ports/IssueSource'
import type { DateField, DateFieldValue, IssueWriter } from '../../ports/IssueWriter'
import { githubClient } from './auth'
import { useSettingsStore } from './settings'

export interface BoardGraph {
  /** Ready to render: every edge points at a task in this same array. */
  tasks: Task[]
  /** Edges pointing outside the loaded set — closed, elsewhere, or not yet paged in. */
  droppedEdges: number
  brokenCycles: number
}

/** New dates for one task, `YYYY-MM-DD`. Only what the user changed. */
export interface DateChanges {
  start?: string
  due?: string
}

/** Why a date cannot be edited, or null when it can. For the detail panel. */
export interface DateEditability {
  start: string | null
  due: string | null
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
  /** The repository's date fields, with the ids a save needs. */
  const dateFields = ref<DateField[]>([])
  /** Set when the field lookup failed: editing is off, the chart is not. */
  const dateFieldsError = ref<string | null>(null)
  const rateLimit = shallowRef<RateLimitInfo | null>(null)

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

  function fieldNamed(name: string): DateField | null {
    const wanted = name.trim().toLowerCase()
    return dateFields.value.find((field) => field.name.trim().toLowerCase() === wanted) ?? null
  }

  const startField = computed(() => fieldNamed(settings.startFieldName))
  const dueField = computed(() => fieldNamed(settings.dueFieldName))

  const dateEditability = computed<DateEditability>(() => {
    const why = (field: DateField | null, name: string): string | null => {
      if (!writer.value) return 'Editing is not available.'
      if (dateFieldsError.value) return `Could not look up this repository’s date fields: ${dateFieldsError.value}`
      if (!field) return `This repository has no date field named “${name}”.`
      return null
    }
    return {
      start: why(startField.value, settings.startFieldName),
      due: why(dueField.value, settings.dueFieldName),
    }
  })

  const isEmpty = computed(() => !loading.value && tasks.value.length === 0)

  async function fetchPage(cursorValue: string | null): Promise<void> {
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
      if (cursorValue === null) tasks.value = []
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
    dateFields.value = []
    dateFieldsError.value = null
    void loadDateFields(repo.value)
    await fetchPage(null)
  }

  /** Runs beside the first page, never in front of it: a failure here only turns editing off. */
  async function loadDateFields(target: RepoRef): Promise<void> {
    if (!writer.value) return
    try {
      const fields = await writer.value.dateFields(target)
      if (repo.value === target) dateFields.value = fields
    } catch (cause) {
      if (repo.value === target) dateFieldsError.value = cause instanceof Error ? cause.message : 'unknown error'
    }
  }

  /**
   * Write new dates to GitHub and swap in the issue as GitHub returns it.
   * Resolves to an error message for the panel, or null on success. Never
   * touches the connection: a read-only token is a failed save, not a logout.
   */
  async function saveDates(taskId: TaskId, changes: DateChanges): Promise<string | null> {
    const target = writer.value
    if (!target) return 'Editing is not available.'

    const values: DateFieldValue[] = []
    for (const [key, field] of [['start', startField.value], ['due', dueField.value]] as const) {
      const date = changes[key]
      if (date === undefined) continue
      const reason = dateEditability.value[key]
      if (!field || reason) return reason ?? 'That date cannot be edited.'
      values.push({ fieldId: field.id, date })
    }
    if (values.length === 0) return null

    try {
      replaceTasks([await target.setDates(taskId, values)])
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
    if (wouldCreateCycle(tasks.value, blockedId, blockerId)) {
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

  /**
   * Swap in issues as GitHub returned them, in place, so bars keep their rows
   * and the selection stays put. Issues not on the board (another type, say)
   * are ignored: the board shows what it loaded.
   */
  function replaceTasks(updated: Task[]): void {
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
    dateFields.value = []
    dateFieldsError.value = null
    error.value = null
  }

  /** Test seam: swap in a fake IssueSource without touching the network. */
  function useSource(replacement: IssueSource): void {
    source.value = replacement
    // The writer follows: a fake reader must not leave the real GitHub writer behind.
    writer.value = 'setDates' in replacement ? (replacement as IssueSource & IssueWriter) : null
  }

  /** Test seam: swap the writer, or pass null for a read-only board. */
  function useWriter(replacement: IssueWriter | null): void {
    writer.value = replacement
  }

  return {
    repo,
    tasks,
    graph,
    loading,
    error,
    cursor,
    hasNextPage,
    totalCount,
    issueTypes,
    dateFields,
    dateFieldsError,
    dateEditability,
    rateLimit,
    isEmpty,
    loadRepo,
    loadMore,
    saveDates,
    linkBlocker,
    unlinkBlocker,
    clear,
    useSource,
    useWriter,
  }
})
