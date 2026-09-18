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

// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptWithPasskey,
  encryptWithNewPasskey,
  isPasskeyEncryptionAvailable,
  PasskeyError,
} from '../src/adapters/storage/PasskeyCipher'
import { TokenStore } from '../src/adapters/storage/TokenStore'

const TOKEN = ['gh', 'p_', 'abcdef0123456789'.repeat(2), 'beef'].join('')

/**
 * A stand-in authenticator. The PRF secret is fixed per credential and salt,
 * which is exactly the property the real extension guarantees — so the real
 * HKDF and AES-GCM code paths run unchanged.
 */
class FakeAuthenticator {
  createCalls = 0
  getCalls = 0
  prfEnabled = true
  prfResultOnAssertion = true

  constructor(private readonly secret = 'authenticator-secret') {}

  install(): void {
    vi.stubGlobal('PublicKeyCredential', class {})
    vi.stubGlobal('navigator', {
      ...window.navigator,
      credentials: {
        create: this.create.bind(this),
        get: this.get.bind(this),
      },
    })
  }

  private async create(): Promise<unknown> {
    this.createCalls += 1
    return {
      rawId: new TextEncoder().encode('credential-1').buffer,
      getClientExtensionResults: () => ({ prf: { enabled: this.prfEnabled } }),
    }
  }

  private async get(options: CredentialRequestOptions): Promise<unknown> {
    this.getCalls += 1
    const salt = options.publicKey?.extensions?.prf?.eval?.first as Uint8Array
    // Deterministic in the salt, like a real PRF.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new Uint8Array([...new TextEncoder().encode(this.secret), ...new Uint8Array(salt)]),
    )
    return {
      rawId: new TextEncoder().encode('credential-1').buffer,
      getClientExtensionResults: () =>
        this.prfResultOnAssertion ? { prf: { results: { first: digest } } } : { prf: {} },
    }
  }
}

let authenticator: FakeAuthenticator

beforeEach(() => {
  authenticator = new FakeAuthenticator()
  authenticator.install()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isPasskeyEncryptionAvailable', () => {
  it('is false without a credentials API', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, credentials: undefined })

    expect(await isPasskeyEncryptionAvailable()).toBe(false)
  })

  it('is false when the client reports PRF unsupported', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      getClientCapabilities: async () => ({ 'extension:prf': false }),
    })

    expect(await isPasskeyEncryptionAvailable()).toBe(false)
  })

  it('is true when the client reports PRF supported', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      getClientCapabilities: async () => ({ 'extension:prf': true }),
    })

    expect(await isPasskeyEncryptionAvailable()).toBe(true)
  })
})

describe('passkey encryption round trip', () => {
  it('encrypts and decrypts the token', async () => {
    const record = await encryptWithNewPasskey(TOKEN, 'octocat')

    expect(await decryptWithPasskey(record)).toBe(TOKEN)
  })

  it('stores no plaintext in the record', async () => {
    const record = await encryptWithNewPasskey(TOKEN, 'octocat')

    const asText = new TextDecoder().decode(record.ciphertext)
    expect(asText).not.toContain(TOKEN)
    expect(JSON.stringify([...record.ciphertext])).not.toContain(TOKEN)
  })

  it('cannot be decrypted by a different authenticator', async () => {
    const record = await encryptWithNewPasskey(TOKEN, 'octocat')

    new FakeAuthenticator('a-different-authenticator').install()

    await expect(decryptWithPasskey(record)).rejects.toBeInstanceOf(PasskeyError)
  })

  it('reports no-prf when the authenticator returns no PRF result', async () => {
    authenticator.prfResultOnAssertion = false

    const error = await encryptWithNewPasskey(TOKEN, 'octocat').catch((e: PasskeyError) => e)

    expect(error).toBeInstanceOf(PasskeyError)
    expect((error as PasskeyError).reason).toBe('no-prf')
  })

  it('reports declined when the user dismisses the prompt', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      credentials: {
        create: () => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })),
        get: () => Promise.reject(new Error('unused')),
      },
    })

    const error = await encryptWithNewPasskey(TOKEN, 'octocat').catch((e: PasskeyError) => e)

    expect((error as PasskeyError).reason).toBe('declined')
  })

  it('keeps the token out of the failure message', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      credentials: {
        create: () => Promise.reject(new Error('internal failure')),
        get: () => Promise.reject(new Error('unused')),
      },
    })

    const error = await encryptWithNewPasskey(TOKEN, 'octocat').catch((e: PasskeyError) => e)

    expect((error as PasskeyError).message).not.toContain(TOKEN)
  })
})

describe('TokenStore with passkey persistence', () => {
  // fake-indexeddb is process-wide, so wipe it between cases or a record from
  // one test answers another test's question.
  beforeEach(async () => {
    window.sessionStorage.clear()
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('gh-gantt')
      request.onsuccess = () => resolve(null)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  })

  it('remembers and unlocks a token', async () => {
    const store = new TokenStore()

    const result = await store.remember(TOKEN, 'octocat')
    expect(result.ok).toBe(true)
    expect(await store.hasEncryptedToken()).toBe(true)

    const fresh = new TokenStore()
    expect(await fresh.unlock()).toBe(TOKEN)
  })

  it('writes no plaintext token to session storage when only remembering', async () => {
    const store = new TokenStore()
    await store.remember(TOKEN, 'octocat')

    expect(window.sessionStorage.getItem('gh-gantt:token')).toBeNull()
  })

  it('does not prompt on restore — an encrypted token waits for a gesture', async () => {
    const store = new TokenStore()
    await store.remember(TOKEN, 'octocat')

    const before = authenticator.getCalls
    const fresh = new TokenStore()

    expect(await fresh.restore()).toBeNull()
    expect(authenticator.getCalls).toBe(before)
    expect(await fresh.hasEncryptedToken()).toBe(true)
  })

  it('reports failure instead of falling back to plaintext', async () => {
    authenticator.prfEnabled = false
    const store = new TokenStore()

    const result = await store.remember(TOKEN, 'octocat')

    expect(result.ok).toBe(false)
    expect(await store.hasEncryptedToken()).toBe(false)
  })

  it('session persistence removes any remembered token', async () => {
    const store = new TokenStore()
    await store.remember(TOKEN, 'octocat')

    store.set(TOKEN, 'session')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(await store.hasEncryptedToken()).toBe(false)
  })

  it('clear wipes memory, session storage and the encrypted record', async () => {
    const store = new TokenStore()
    store.set(TOKEN, 'session')
    await store.remember(TOKEN, 'octocat')

    store.clear()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(store.get()).toBeNull()
    expect(window.sessionStorage.getItem('gh-gantt:token')).toBeNull()
    expect(await store.hasEncryptedToken()).toBe(false)
  })
})
