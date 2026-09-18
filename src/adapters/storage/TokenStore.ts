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
 * Token persistence and its security policy (ARCHITECTURE.md §6).
 *
 * The rules this file exists to enforce:
 *   - Local storage (the persistent, origin-wide kind) is never used for the
 *     token. Only session storage, which dies with the tab; that is the
 *     default and the safe case.
 *   - `'persistent'` is opt-in and **never stores a bare token**. The token is
 *     encrypted with a key derived from a passkey (see `PasskeyCipher`) and
 *     only the ciphertext reaches IndexedDB. If a passkey cannot do it, the
 *     app stays session-only rather than falling back to plaintext.
 *   - Every storage call is wrapped: `sessionStorage` and `indexedDB` both
 *     throw outright in some private-browsing modes, and a storage failure
 *     must never take the app down.
 */

export type Persistence = 'session' | 'persistent'

import {
  decryptWithPasskey,
  encryptWithNewPasskey,
  isPasskeyEncryptionAvailable,
  PasskeyError,
  type EncryptedToken,
  type PasskeyFailure,
} from './PasskeyCipher'

const SESSION_KEY = 'gh-gantt:token'
const DB_NAME = 'gh-gantt'
const DB_VERSION = 1
const STORE_NAME = 'auth'
/** Ciphertext record. A bare token is never written under any key. */
const DB_KEY = 'encrypted-token'
/** Key used by builds before encryption existed; cleared on sight. */
const LEGACY_DB_KEY = 'token'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  try {
    return await new Promise<T | null>((resolve) => {
      let request: IDBRequest
      try {
        request = work(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      } catch {
        resolve(null)
        return
      }
      request.onsuccess = () => resolve((request.result ?? null) as T | null)
      request.onerror = () => resolve(null)
    })
  } finally {
    db.close()
  }
}

export class TokenStore {
  private token: string | null = null
  private persistence: Persistence = 'session'

  /** Synchronous read. Reflects memory, hydrated from session storage on first use. */
  get(): string | null {
    if (this.token !== null) return this.token
    try {
      this.token = sessionStorage.getItem(SESSION_KEY)
    } catch {
      this.token = null
    }
    return this.token
  }

  /** Hold the token for this tab. Persistence is a separate, explicit step. */
  set(token: string, persistence: Persistence = 'session'): void {
    this.token = token
    this.persistence = persistence

    try {
      sessionStorage.setItem(SESSION_KEY, token)
    } catch {
      // Private mode or a full quota: memory still holds it for this session.
    }

    if (persistence === 'session') void this.forgetEncrypted()
  }

  /**
   * Encrypt the token with a new passkey and store only the ciphertext.
   * Prompts the user twice — once to create the passkey, once to derive its
   * key. Returns the reason on failure so the UI can say what happened; the
   * session copy is untouched either way.
   */
  async remember(token: string, label: string): Promise<{ ok: true } | { ok: false; reason: PasskeyFailure; message: string }> {
    try {
      const record = await encryptWithNewPasskey(token, label)
      const written = await withStore('readwrite', (store) => store.put(toStored(record), DB_KEY))
      if (written === null) {
        return { ok: false, reason: 'failed', message: 'This browser would not store the encrypted token.' }
      }
      this.persistence = 'persistent'
      return { ok: true }
    } catch (cause) {
      const error = cause instanceof PasskeyError ? cause : null
      return {
        ok: false,
        reason: error?.reason ?? 'failed',
        message: error?.message ?? 'Encrypting the token with a passkey failed.',
      }
    }
  }

  /** Whether an encrypted token is waiting to be unlocked. */
  async hasEncryptedToken(): Promise<boolean> {
    const stored = await withStore<StoredRecord>('readonly', (store) => store.get(DB_KEY))
    return stored !== null && typeof stored === 'object'
  }

  /**
   * Decrypt the remembered token, prompting for the passkey. Deliberately
   * *not* called on page load: it needs a user gesture, and a prompt nobody
   * asked for is exactly the pattern this design is trying to avoid.
   */
  async unlock(): Promise<string | null> {
    const stored = await withStore<StoredRecord>('readonly', (store) => store.get(DB_KEY))
    if (!stored || typeof stored !== 'object') return null

    const token = await decryptWithPasskey(fromStored(stored))
    this.set(token, 'persistent')
    this.persistence = 'persistent'
    return token
  }

  /**
   * Hydrate the session copy at start-up. Reads session storage only — an
   * encrypted token is left for `unlock()`, behind a deliberate gesture.
   */
  async restore(): Promise<string | null> {
    // Clear any plaintext token left by a build that predates encryption.
    void withStore('readwrite', (store) => store.delete(LEGACY_DB_KEY))
    return this.get()
  }

  /** Whether this browser could offer passkey encryption at all. */
  async canRemember(): Promise<boolean> {
    return isPasskeyEncryptionAvailable()
  }

  private async forgetEncrypted(): Promise<void> {
    await withStore('readwrite', (store) => store.delete(DB_KEY))
  }

  /** Whether the current token was stored to survive the tab closing. */
  get currentPersistence(): Persistence {
    return this.persistence
  }

  /** Clears memory, session storage and IndexedDB. The "disconnect" path. */
  clear(): void {
    this.token = null
    this.persistence = 'session'
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Nothing to do: there was nothing readable to clear.
    }
    void withStore('readwrite', (store) => store.delete(DB_KEY))
    void withStore('readwrite', (store) => store.delete(LEGACY_DB_KEY))
  }
}

/**
 * IndexedDB stores structured clones, and a `Uint8Array` view survives one, but
 * plain arrays are cheaper to reason about across browser versions.
 */
interface StoredRecord {
  credentialId: number[]
  salt: number[]
  iv: number[]
  ciphertext: number[]
}

function toStored(record: EncryptedToken): StoredRecord {
  return {
    credentialId: [...record.credentialId],
    salt: [...record.salt],
    iv: [...record.iv],
    ciphertext: [...record.ciphertext],
  }
}

function fromStored(stored: StoredRecord): EncryptedToken {
  return {
    credentialId: new Uint8Array(stored.credentialId),
    salt: new Uint8Array(stored.salt),
    iv: new Uint8Array(stored.iv),
    ciphertext: new Uint8Array(stored.ciphertext),
  }
}

/** The app has exactly one token; sharing the instance keeps memory state coherent. */
export const tokenStore = new TokenStore()
