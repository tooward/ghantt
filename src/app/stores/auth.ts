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
import {
  AuthError,
  GitHubClient,
  RateLimitError,
  type RateLimitInfo,
} from '../../adapters/github/GitHubClient'

export type { RateLimitInfo }
import { tokenStore } from '../../adapters/storage/TokenStore'

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
  /** Set when "remember" was asked for but the passkey path could not deliver. */
  const persistenceNotice = ref<string | null>(null)
  /** An encrypted token is stored and can be unlocked with a passkey. */
  const hasRememberedToken = ref(false)
  /** This browser could plausibly encrypt with a passkey.  */
  const canRemember = ref(false)

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

  /**
   * Store the token, then prove it works. A token that fails validation is
   * discarded, and it is only ever encrypted for next time *after* it has
   * proved itself.
   */
  async function connect(token: string, remember = false, label = ''): Promise<boolean> {
    status.value = 'connecting'
    error.value = null
    persistenceNotice.value = null
    tokenStore.set(token.trim(), 'session')

    try {
      await validate()
    } catch (cause) {
      tokenStore.clear()
      user.value = null
      rateLimit.value = null
      status.value = 'error'
      error.value = describe(cause)
      return false
    }

    if (remember) {
      const result = await tokenStore.remember(token.trim(), label || user.value?.login || '')
      if (result.ok) {
        hasRememberedToken.value = true
      } else {
        // Never silently downgrade to plaintext: stay session-only and say so.
        persistenceNotice.value = `${result.message} The token will be forgotten when you close this tab.`
      }
    }

    return true
  }

  /** Decrypt a remembered token with its passkey, then validate it. */
  async function unlock(): Promise<boolean> {
    status.value = 'connecting'
    error.value = null

    let token: string | null
    try {
      token = await tokenStore.unlock()
    } catch (cause) {
      status.value = 'disconnected'
      error.value = cause instanceof Error ? cause.message : 'Unlocking the remembered token failed.'
      return false
    }

    if (!token) {
      hasRememberedToken.value = false
      status.value = 'disconnected'
      return false
    }

    try {
      await validate()
      return true
    } catch (cause) {
      // A stored token that no longer works is worth clearing outright.
      tokenStore.clear()
      hasRememberedToken.value = false
      status.value = 'error'
      error.value = describe(cause)
      return false
    }
  }

  /** Re-establish this tab's session, and report what else is on offer. */
  async function restore(): Promise<boolean> {
    canRemember.value = await tokenStore.canRemember()
    hasRememberedToken.value = await tokenStore.hasEncryptedToken()

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
    persistenceNotice.value = null
    hasRememberedToken.value = false
    status.value = 'disconnected'
  }

  return {
    status,
    user,
    rateLimit,
    error,
    persistenceNotice,
    hasRememberedToken,
    canRemember,
    isConnected,
    connect,
    unlock,
    restore,
    disconnect,
  }
})
