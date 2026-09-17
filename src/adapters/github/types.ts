/**
 * Raw shapes of the GitHub GraphQL response.
 *
 * These types must never leave `src/adapters/github/` — a lint rule enforces
 * it. Everything outside this folder speaks the domain `Task` type.
 */

export interface GitHubIssueFieldValueNode {
  /** The union discriminator. Only `IssueFieldDateValue` carries dates. */
  __typename: string
  /** A String, even on a date field. Present only on the date variant. */
  value?: string | null
  /**
   * The query spreads `... on IssueFieldDate { name }` only, so a date value
   * backed by some other field type yields an object with no `name`.
   */
  field?: { name?: string | null } | null
}

export interface GitHubMilestone {
  title: string | null
  dueOn: string | null
}

export interface GitHubIssueRef {
  id: string
  number: number
}

export interface GitHubIssueNode {
  id: string
  number: number
  title: string
  url: string
  createdAt: string
  body: string | null
  milestone: GitHubMilestone | null
  /** Empty on personal-account repositories: issue fields are organisation-level. */
  issueFieldValues: { nodes: GitHubIssueFieldValueNode[] | null } | null
  blockedBy: { nodes: GitHubIssueRef[] | null } | null
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
  } | null
}
