import type { IssuePage, IssueSource, RepoRef } from '../../ports/IssueSource'
import boardIssuesQuery from './queries/boardIssues.graphql?raw'
import { GitHubClient, GitHubError, type RateLimitInfo } from './GitHubClient'
import { mapIssue, type MapConfig } from './mapIssue'
import type { BoardIssuesResponse } from './types'

export class GitHubIssueSource implements IssueSource {
  /** Rate limit reported by the most recent page fetch, for the UI to surface. */
  lastRateLimit: RateLimitInfo | null = null

  constructor(
    private readonly client: GitHubClient,
    private readonly config: () => MapConfig,
  ) {}

  async fetchPage(repo: RepoRef, cursor: string | null, pageSize: number): Promise<IssuePage> {
    const result = await this.client.query<BoardIssuesResponse>(boardIssuesQuery, {
      owner: repo.owner,
      repo: repo.name,
      first: pageSize,
      after: cursor,
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
    }
  }
}
