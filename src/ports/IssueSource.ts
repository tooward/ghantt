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

import type { Milestone, Task } from '../domain/Task'

export interface IssuePage {
  tasks: Task[]
  /** Cursor to pass as `cursor` for the next page; null when there is none. */
  endCursor: string | null
  hasNextPage: boolean
  /** Total open issues matching the filter, for a "43 of 210" indicator. */
  totalCount: number
  /** The issue types the repository offers, for suggesting a filter. */
  issueTypes: string[]
}

export interface RepoRef {
  owner: string
  name: string
  /** Only issues of this type (e.g. "Feature"), matched case-insensitively. Absent or null: every type. */
  issueType?: string | null
}

/**
 * Where tasks come from. The one seam the domain and app layers depend on, so
 * tests can supply pages without a network and a second forge could be added
 * without touching anything above it.
 */
export interface IssueSource {
  fetchPage(repo: RepoRef, cursor: string | null, pageSize: number): Promise<IssuePage>
  /**
   * One issue by number, for linking an issue that is not on the board.
   * Optional: a source without it simply cannot offer that.
   */
  fetchIssue?(repo: RepoRef, number: number): Promise<Task>
  /** The repository's open milestones. Optional: without it, the chart has no diamonds. */
  fetchMilestones?(repo: RepoRef): Promise<Milestone[]>
}
