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
import type { RateLimitInfo } from '../../adapters/github/GitHubClient'
import type { Task } from '../../domain/Task'
import { detectAndBreakCycles, pruneDanglingEdges } from '../../domain/TaskGraph'
import type { IssueSource, RepoRef } from '../../ports/IssueSource'
import { githubClient } from './auth'
import { useSettingsStore } from './settings'

export interface BoardGraph {
  /** Ready to render: every edge points at a task in this same array. */
  tasks: Task[]
  /** Edges pointing outside the loaded set — closed, elsewhere, or not yet paged in. */
  droppedEdges: number
  brokenCycles: number
}

export const useBoardStore = defineStore('board', () => {
  const settings = useSettingsStore()
  const source = shallowRef<IssueSource>(
    new GitHubIssueSource(githubClient, () => settings.mapConfig()),
  )

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
      if (source.value instanceof GitHubIssueSource) rateLimit.value = source.value.lastRateLimit
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Loading issues failed.'
      if (cursorValue === null) tasks.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadRepo(owner: string, name: string): Promise<void> {
    repo.value = { owner: owner.trim(), name: name.trim() }
    tasks.value = []
    cursor.value = null
    hasNextPage.value = false
    totalCount.value = 0
    await fetchPage(null)
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
    error.value = null
  }

  /** Test seam: swap in a fake IssueSource without touching the network. */
  function useSource(replacement: IssueSource): void {
    source.value = replacement
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
    rateLimit,
    isEmpty,
    loadRepo,
    loadMore,
    clear,
    useSource,
  }
})
