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

/**
 * Raw shapes of the GitHub GraphQL response.
 *
 * These types must never leave `src/adapters/github/` — a lint rule enforces
 * it. Everything outside this folder speaks the domain `Task` type.
 */

export interface GitHubIssueFieldValueNode {
  /** The union discriminator. Text and multi-select values carry nothing we read. */
  __typename: string
  /** `IssueFieldDateValue` only. A String, even on a date field. */
  value?: string | null
  /**
   * `IssueFieldNumberValue` only, aliased from `value`: GraphQL rejects one
   * response key with different types (String vs Float) across fragments.
   */
  numberValue?: number | null
  /** `IssueFieldSingleSelectValue` only, aliased from `name`: the chosen option. */
  optionName?: string | null
  /** Each fragment spreads only its own field type, so a mismatch yields no `name`. */
  field?: { name?: string | null } | null
}

export interface GitHubMilestone {
  title: string | null
  dueOn: string | null
}

export interface GitHubIssueRef {
  id: string
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  repository: { nameWithOwner: string } | null
}

export interface GitHubIssueNode {
  id: string
  number: number
  title: string
  url: string
  createdAt: string
  repository: { nameWithOwner: string } | null
  /**
   * Whether the *user* may set issue fields here. It says nothing about the
   * token: a read-only token still reports true, then fails on save.
   */
  viewerCanSetFields?: boolean | null
  milestone: GitHubMilestone | null
  /** Empty on personal-account repositories: issue fields are organisation-level. */
  issueFieldValues: { nodes: GitHubIssueFieldValueNode[] | null } | null
  blockedBy: { nodes: GitHubIssueRef[] | null } | null
  blocking?: { nodes: GitHubIssueRef[] | null } | null
}

export interface GitHubPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export interface BoardIssuesResponse {
  repository: {
    issues: {
      pageInfo: GitHubPageInfo
      totalCount: number
      nodes: (GitHubIssueNode | null)[] | null
    }
    /** Null where issue types are unavailable, e.g. some personal repositories. */
    issueTypes?: { nodes: ({ name: string } | null)[] | null } | null
  } | null
}

export interface RepoFieldsResponse {
  repository: {
    issueFields: {
      /** Every known field type carries `id` and `name`; an unknown one is just `{ __typename }`. */
      nodes: ({ __typename: string; id?: string; name?: string } | null)[] | null
    } | null
  } | null
}

export interface SetIssueFieldsResponse {
  setIssueFieldValue: { issue: GitHubIssueNode | null } | null
}

/** Both mutations answer alike: the blocked issue and its blocker, as GitHub now holds them. */
export interface BlockedByResponse {
  addBlockedBy?: { issue: GitHubIssueNode | null; blockingIssue: GitHubIssueNode | null } | null
  removeBlockedBy?: { issue: GitHubIssueNode | null; blockingIssue: GitHubIssueNode | null } | null
}

export interface RepoIssueResponse {
  repository: { issue: GitHubIssueNode | null } | null
}
