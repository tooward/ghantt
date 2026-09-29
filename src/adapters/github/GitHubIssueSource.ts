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

import { milestoneDay } from '../../domain/dateResolution'
import type { Milestone, Task, TaskId } from '../../domain/Task'
import type { IssuePage, IssueSource, RepoRef } from '../../ports/IssueSource'
import type { FieldKind, FieldValue, IssueFieldRef, IssueWriter } from '../../ports/IssueWriter'
import addBlockedByDocument from './queries/addBlockedBy.graphql?raw'
import boardIssueFragment from './queries/boardIssue.fragment.graphql?raw'
import boardIssuesDocument from './queries/boardIssues.graphql?raw'
import removeBlockedByDocument from './queries/removeBlockedBy.graphql?raw'
import repoFieldsQuery from './queries/repoFields.graphql?raw'
import repoIssueDocument from './queries/repoIssue.graphql?raw'
import repoMilestonesQuery from './queries/repoMilestones.graphql?raw'
import setIssueFieldsDocument from './queries/setIssueFields.graphql?raw'
import { GitHubClient, GitHubError, type RateLimitInfo } from './GitHubClient'
import { mapIssue, type MapConfig } from './mapIssue'
import type {
  BlockedByResponse,
  BoardIssuesResponse,
  RepoFieldsResponse,
  RepoIssueResponse,
  RepoMilestonesResponse,
  SetIssueFieldsResponse,
} from './types'

// GraphQL wants a fragment's definition in the same document that spreads it.
const boardIssuesQuery = `${boardIssuesDocument}\n${boardIssueFragment}`
const repoIssueQuery = `${repoIssueDocument}\n${boardIssueFragment}`
const setIssueFieldsMutation = `${setIssueFieldsDocument}\n${boardIssueFragment}`

const FIELD_KINDS: Record<string, FieldKind> = {
  IssueFieldDate: 'date',
  IssueFieldNumber: 'number',
  IssueFieldSingleSelect: 'single-select',
  IssueFieldMultiSelect: 'multi-select',
  IssueFieldText: 'text',
}
const addBlockedByMutation = `${addBlockedByDocument}\n${boardIssueFragment}`
const removeBlockedByMutation = `${removeBlockedByDocument}\n${boardIssueFragment}`

export class GitHubIssueSource implements IssueSource, IssueWriter {
  /** Rate limit reported by the most recent page fetch, for the UI to surface. */
  lastRateLimit: RateLimitInfo | null = null

  private readonly client: GitHubClient
  private readonly config: () => MapConfig

  // Plain fields, not constructor parameter properties: `erasableSyntaxOnly`
  // (tsconfig.app.json) forbids syntax that would need compiling away.
  constructor(client: GitHubClient, config: () => MapConfig) {
    this.client = client
    this.config = config
  }

  async fetchPage(repo: RepoRef, cursor: string | null, pageSize: number): Promise<IssuePage> {
    const result = await this.client.query<BoardIssuesResponse>(boardIssuesQuery, {
      owner: repo.owner,
      repo: repo.name,
      first: pageSize,
      after: cursor,
      type: repo.issueType?.trim() || null,
    })

    this.lastRateLimit = result.rateLimit ?? null

    const issues = result.data.repository?.issues
    if (!issues) {
      // GitHub answers a missing repository with data.repository = null and no
      // error entry, so this is a normal response that means "no such repo".
      throw new GitHubError(`Repository ${repo.owner}/${repo.name} was not found, or the token cannot see it.`)
    }

    const cfg = this.config()
    const tasks = (issues.nodes ?? [])
      .filter((node) => node !== null)
      .map((node) => mapIssue(node, cfg))

    return {
      tasks,
      endCursor: issues.pageInfo.endCursor,
      hasNextPage: issues.pageInfo.hasNextPage,
      totalCount: issues.totalCount,
      issueTypes: (result.data.repository?.issueTypes?.nodes ?? []).flatMap((node) => (node?.name ? [node.name] : [])),
    }
  }

  async fetchIssue(repo: RepoRef, number: number): Promise<Task> {
    const result = await this.client.query<RepoIssueResponse>(repoIssueQuery, {
      owner: repo.owner,
      repo: repo.name,
      number,
    })
    this.lastRateLimit = result.rateLimit ?? this.lastRateLimit
    const issue = result.data.repository?.issue
    // GitHub normally answers a missing issue with a NOT_FOUND error, which
    // the client has already thrown; this covers a bare null.
    if (!issue) throw new GitHubError(`Could not resolve to an Issue with the number of ${number}.`)
    return mapIssue(issue, this.config())
  }

  async fetchMilestones(repo: RepoRef): Promise<Milestone[]> {
    const result = await this.client.query<RepoMilestonesResponse>(repoMilestonesQuery, {
      owner: repo.owner,
      repo: repo.name,
    })
    this.lastRateLimit = result.rateLimit ?? this.lastRateLimit
    return (result.data.repository?.milestones?.nodes ?? []).flatMap((node) =>
      node
        ? [{
            id: node.id,
            title: node.title,
            dueOn: milestoneDay(node.dueOn),
            url: node.url,
            openIssueCount: node.openIssueCount,
            closedIssueCount: node.closedIssueCount,
          }]
        : [],
    )
  }

  async fields(repo: RepoRef): Promise<IssueFieldRef[]> {
    const result = await this.client.query<RepoFieldsResponse>(repoFieldsQuery, {
      owner: repo.owner,
      repo: repo.name,
    })
    this.lastRateLimit = result.rateLimit ?? this.lastRateLimit
    return (result.data.repository?.issueFields?.nodes ?? []).flatMap((node) => {
      const kind = node ? FIELD_KINDS[node.__typename] : undefined
      return node && kind && node.id && node.name ? [{ id: node.id, name: node.name, kind }] : []
    })
  }

  async setFields(issueId: TaskId, values: FieldValue[]): Promise<Task> {
    const result = await this.client.query<SetIssueFieldsResponse>(setIssueFieldsMutation, {
      issueId,
      fields: values.map((value) => {
        if ('clear' in value) return { fieldId: value.fieldId, delete: true }
        if ('number' in value) return { fieldId: value.fieldId, numberValue: value.number }
        return { fieldId: value.fieldId, dateValue: value.date }
      }),
    })
    // No rateLimit here: a mutation cannot select it, so keep the last one seen.
    const issue = result.data.setIssueFieldValue?.issue
    if (!issue) throw new GitHubError('GitHub accepted the change but returned no issue. Reload to see it.')
    return mapIssue(issue, this.config())
  }

  addBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]> {
    return this.link(addBlockedByMutation, 'addBlockedBy', issueId, blockerId)
  }

  removeBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]> {
    return this.link(removeBlockedByMutation, 'removeBlockedBy', issueId, blockerId)
  }

  private async link(
    mutation: string,
    key: keyof BlockedByResponse,
    issueId: TaskId,
    blockerId: TaskId,
  ): Promise<Task[]> {
    const result = await this.client.query<BlockedByResponse>(mutation, { issueId, blockingIssueId: blockerId })
    const payload = result.data[key]
    if (!payload?.issue) throw new GitHubError('GitHub accepted the change but returned no issue. Reload to see it.')
    const cfg = this.config()
    return [payload.issue, payload.blockingIssue].flatMap((node) => (node ? [mapIssue(node, cfg)] : []))
  }
}
