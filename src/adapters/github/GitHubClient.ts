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

const ENDPOINT = 'https://api.github.com/graphql'

/** Anything that looks like a GitHub token, so redaction works even on strings we did not build. */
const TOKEN_SHAPED = /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g

export interface RateLimitInfo {
  cost: number
  remaining: number
  resetAt: string
}

export interface GraphQLResult<T> {
  data: T
  rateLimit?: RateLimitInfo
}

/** Base class for every failure this client raises. Never carries a token. */
export class GitHubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubError'
  }
}

/** The token is missing, invalid, expired, or lacks the required scopes. Reconnect. */
export class AuthError extends GitHubError {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** The API rate limit is exhausted. `resetAt` is an ISO timestamp when known. */
export class RateLimitError extends GitHubError {
  readonly resetAt: string | null

  constructor(message: string, resetAt: string | null) {
    super(message)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

/**
 * Strip the live token and anything token-shaped out of a string before it
 * reaches an error message, a log line, or the UI.
 */
export function redact(text: string, token?: string | null): string {
  const withoutLive = token ? text.split(token).join('[redacted]') : text
  return withoutLive.replace(TOKEN_SHAPED, '[redacted]')
}

interface GraphQLErrorEntry {
  type?: string
  message?: string
}

interface GraphQLBody {
  data?: unknown
  errors?: GraphQLErrorEntry[]
}

function messagesOf(errors: GraphQLErrorEntry[], token: string): string {
  const joined = errors
    .map((e) => e.message ?? e.type ?? 'unknown error')
    .join('; ')
  return redact(joined, token) || 'GitHub returned an error with no message.'
}

function rateLimitOf(data: unknown): RateLimitInfo | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const candidate = (data as { rateLimit?: unknown }).rateLimit
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const { cost, remaining, resetAt } = candidate as Partial<RateLimitInfo>
  if (typeof remaining !== 'number' || typeof resetAt !== 'string') return undefined
  return { cost: typeof cost === 'number' ? cost : 0, remaining, resetAt }
}

/**
 * The single point of contact with GitHub. One POST to the GraphQL endpoint,
 * with the error handling that a GraphQL API demands (see ARCHITECTURE.md §6).
 */
export class GitHubClient {
  constructor(private readonly getToken: () => string | null) {}

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<GraphQLResult<T>> {
    const token = this.getToken()
    if (!token) throw new AuthError('Not connected to GitHub — no token available.')

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          // GraphQL wants `Bearer`. GitHub's REST examples use `token`; that is a different API.
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new GitHubError(`Could not reach GitHub: ${redact(detail, token)}`)
    }

    if (response.status === 401) {
      throw new AuthError('GitHub rejected the token (401). It may be invalid, expired, or revoked.')
    }
    if (response.status === 403 || response.status === 429) {
      // A 403 here is either a secondary rate limit or a scope problem; the
      // remaining-requests header is what tells them apart.
      const remaining = response.headers.get('x-ratelimit-remaining')
      if (remaining === '0' || response.status === 429) {
        throw new RateLimitError(
          'GitHub rate limit exceeded.',
          isoFromEpochHeader(response.headers.get('x-ratelimit-reset')),
        )
      }
      throw new AuthError('GitHub refused the request (403). The token may lack the required scopes.')
    }

    let body: GraphQLBody
    try {
      body = (await response.json()) as GraphQLBody
    } catch {
      throw new GitHubError(`GitHub returned a non-JSON response (HTTP ${response.status}).`)
    }

    // Query-level failures arrive as HTTP 200 with an `errors` array. Checking
    // `response.ok` alone would hand `null` data downstream as if it succeeded.
    if (body.errors?.length) {
      const types = new Set(body.errors.map((e) => e.type))
      const detail = messagesOf(body.errors, token)

      if (types.has('RATE_LIMITED')) {
        throw new RateLimitError(detail, rateLimitOf(body.data)?.resetAt ?? null)
      }
      if (types.has('UNAUTHORIZED') || types.has('FORBIDDEN')) {
        throw new AuthError(detail)
      }
      throw new GitHubError(detail)
    }

    if (!response.ok) {
      throw new GitHubError(`GitHub returned HTTP ${response.status}.`)
    }
    if (body.data === undefined || body.data === null) {
      throw new GitHubError('GitHub returned a response with no data.')
    }

    return { data: body.data as T, rateLimit: rateLimitOf(body.data) }
  }
}

function isoFromEpochHeader(value: string | null): string | null {
  if (!value) return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}
