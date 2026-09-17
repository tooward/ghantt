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

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  GitHubClient,
  GitHubError,
  RateLimitError,
  redact,
} from '../src/adapters/github/GitHubClient'

// Assembled at runtime so no token-shaped literal is ever committed — the
// repo-wide secret scan in the implementation plan must come back empty.
const TOKEN = ['gh', 'p_', '0123456789abcdef'.repeat(2), '0123'].join('')
const PAT_SHAPED = ['github', '_pat_', '11ABCDEFG0abcdefghijklmnop'].join('')

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

function client(token: string | null = TOKEN) {
  return new GitHubClient(() => token)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GitHubClient.query', () => {
  it('returns data and rate limit on success', async () => {
    mockResponse({
      data: { viewer: { login: 'octocat' }, rateLimit: { cost: 1, remaining: 4999, resetAt: '2026-09-17T23:00:00Z' } },
    })

    const result = await client().query<{ viewer: { login: string } }>('query { viewer { login } }')

    expect(result.data.viewer.login).toBe('octocat')
    expect(result.rateLimit).toEqual({ cost: 1, remaining: 4999, resetAt: '2026-09-17T23:00:00Z' })
  })

  it('sends a Bearer token to the GraphQL endpoint', async () => {
    mockResponse({ data: { viewer: { login: 'octocat' } } })

    await client().query('query { viewer { login } }', { a: 1 })

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/graphql')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body as string).variables).toEqual({ a: 1 })
  })

  // The highest-risk bug in the client: GraphQL reports failure as HTTP 200.
  it('throws RateLimitError for a 200 response carrying RATE_LIMITED', async () => {
    mockResponse({
      data: { rateLimit: { cost: 0, remaining: 0, resetAt: '2026-09-17T23:30:00Z' } },
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('carries resetAt on a rate limit error', async () => {
    mockResponse({
      data: { rateLimit: { cost: 0, remaining: 0, resetAt: '2026-09-17T23:30:00Z' } },
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    })

    await expect(client().query('query { viewer { login } }')).rejects.toMatchObject({
      resetAt: '2026-09-17T23:30:00Z',
    })
  })

  it('throws AuthError for a 200 response carrying UNAUTHORIZED', async () => {
    mockResponse({ data: null, errors: [{ type: 'UNAUTHORIZED', message: 'Bad credentials' }] })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(AuthError)
  })

  it('throws GitHubError for any other 200-with-errors response', async () => {
    mockResponse({ data: null, errors: [{ message: "Field 'nope' doesn't exist" }] })

    await expect(client().query('query { nope }')).rejects.toThrowError(/Field 'nope'/)
  })

  it('never returns null data as if it succeeded', async () => {
    mockResponse({ data: null })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(GitHubError)
  })

  it('throws AuthError on HTTP 401', async () => {
    mockResponse({ message: 'Bad credentials' }, { status: 401 })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(AuthError)
  })

  it('treats a 403 with no remaining requests as a rate limit', async () => {
    mockResponse({}, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1789000000' } })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('treats a 403 with requests remaining as a scope problem', async () => {
    mockResponse({}, { status: 403, headers: { 'x-ratelimit-remaining': '4000' } })

    await expect(client().query('query { viewer { login } }')).rejects.toBeInstanceOf(AuthError)
  })

  it('throws AuthError when there is no token at all', async () => {
    await expect(client(null).query('query { viewer { login } }')).rejects.toBeInstanceOf(AuthError)
  })

  it('keeps the token out of network-failure messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`failed with ${TOKEN}`)))

    await expect(client().query('query { viewer { login } }')).rejects.toThrowError(/\[redacted\]/)
    await expect(client().query('query { viewer { login } }')).rejects.not.toThrowError(
      new RegExp(TOKEN),
    )
  })

  it('keeps the token out of GraphQL error messages', async () => {
    mockResponse({ data: null, errors: [{ message: `token ${TOKEN} is bad` }] })

    const error = await client()
      .query('query { viewer { login } }')
      .catch((e: Error) => e)

    expect(error.message).not.toContain(TOKEN)
    expect(error.message).toContain('[redacted]')
  })
})

describe('redact', () => {
  it('removes the live token', () => {
    expect(redact(`prefix ${TOKEN} suffix`, TOKEN)).toBe('prefix [redacted] suffix')
  })

  it('removes token-shaped strings even without the live token', () => {
    expect(redact(`leaked ${PAT_SHAPED} here`)).toContain('[redacted]')
  })

  it('leaves ordinary text alone', () => {
    expect(redact('nothing secret here', TOKEN)).toBe('nothing secret here')
  })
})
