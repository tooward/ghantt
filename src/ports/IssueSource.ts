import type { Task } from '../domain/Task'

export interface IssuePage {
  tasks: Task[]
  /** Cursor to pass as `cursor` for the next page; null when there is none. */
  endCursor: string | null
  hasNextPage: boolean
  /** Total open issues in the repository, for a "43 of 210" indicator. */
  totalCount: number
}

export interface RepoRef {
  owner: string
  name: string
}

/**
 * Where tasks come from. The one seam the domain and app layers depend on, so
 * tests can supply pages without a network and a second forge could be added
 * without touching anything above it.
 */
export interface IssueSource {
  fetchPage(repo: RepoRef, cursor: string | null, pageSize: number): Promise<IssuePage>
}
