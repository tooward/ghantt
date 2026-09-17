import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  AuthError,
  GitHubClient,
  RateLimitError,
  type RateLimitInfo,
} from '../../adapters/github/GitHubClient'
import { tokenStore, type Persistence } from '../../adapters/storage/TokenStore'

export type AuthStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface Viewer {
  login: string
  avatarUrl: string
}

const VIEWER_QUERY = `query { viewer { login avatarUrl } rateLimit { remaining resetAt } }`

interface ViewerResponse {
  viewer: Viewer
  rateLimit: RateLimitInfo
}

/** Shared by every store that talks to GitHub; reads the token lazily, never holds it. */
export const githubClient = new GitHubClient(() => tokenStore.get())

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('disconnected')
  const user = shallowRef<Viewer | null>(null)
  const rateLimit = shallowRef<RateLimitInfo | null>(null)
  const error = ref<string | null>(null)

  const isConnected = computed(() => status.value === 'connected')

  async function validate(): Promise<void> {
    const result = await githubClient.query<ViewerResponse>(VIEWER_QUERY)
    user.value = result.data.viewer
    rateLimit.value = result.data.rateLimit ?? result.rateLimit ?? null
    status.value = 'connected'
    error.value = null
  }

  function describe(cause: unknown): string {
    if (cause instanceof RateLimitError) {
      const when = cause.resetAt ? ` Resets at ${new Date(cause.resetAt).toLocaleTimeString()}.` : ''
      return `GitHub rate limit reached.${when}`
    }
    if (cause instanceof AuthError) return cause.message
    if (cause instanceof Error) return cause.message
    return 'Connecting to GitHub failed.'
  }

  /** Store the token, then prove it works. A token that fails validation is discarded. */
  async function connect(token: string, persistence: Persistence = 'session'): Promise<boolean> {
    status.value = 'connecting'
    error.value = null
    tokenStore.set(token.trim(), persistence)

    try {
      await validate()
      return true
    } catch (cause) {
      tokenStore.clear()
      user.value = null
      rateLimit.value = null
      status.value = 'error'
      error.value = describe(cause)
      return false
    }
  }

  /** Re-establish a session from a remembered token, if there is one. Silent on failure. */
  async function restore(): Promise<boolean> {
    const stored = await tokenStore.restore()
    if (!stored) return false

    status.value = 'connecting'
    try {
      await validate()
      return true
    } catch {
      tokenStore.clear()
      status.value = 'disconnected'
      return false
    }
  }

  function disconnect(): void {
    tokenStore.clear()
    user.value = null
    rateLimit.value = null
    error.value = null
    status.value = 'disconnected'
  }

  return { status, user, rateLimit, error, isConnected, connect, restore, disconnect }
})
