/**
 * Token persistence and its security policy (ARCHITECTURE.md §6).
 *
 * The rules this file exists to enforce:
 *   - Local storage (the persistent, origin-wide kind) is never used for the
 *     token. Only session storage, which dies with the tab; that is the
 *     default and the safe case.
 *   - `'persistent'` writes the token to IndexedDB and is opt-in only. It is
 *     plaintext at rest today; Phase 6 replaces it with WebAuthn-PRF
 *     encryption, which is why every persistent path is funnelled through
 *     this one class.
 *   - Every storage call is wrapped: `sessionStorage` and `indexedDB` both
 *     throw outright in some private-browsing modes, and a storage failure
 *     must never take the app down.
 */

export type Persistence = 'session' | 'persistent'

const SESSION_KEY = 'gh-gantt:token'
const DB_NAME = 'gh-gantt'
const DB_VERSION = 1
const STORE_NAME = 'auth'
const DB_KEY = 'token'

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

  set(token: string, persistence: Persistence = 'session'): void {
    this.token = token
    this.persistence = persistence

    try {
      sessionStorage.setItem(SESSION_KEY, token)
    } catch {
      // Private mode or a full quota: memory still holds it for this session.
    }

    if (persistence === 'persistent') {
      void withStore('readwrite', (store) => store.put(token, DB_KEY))
    } else {
      void withStore('readwrite', (store) => store.delete(DB_KEY))
    }
  }

  /**
   * Hydrate from IndexedDB at start-up. Call once before deciding whether the
   * user needs to reconnect; `get()` cannot do this because IndexedDB is async.
   */
  async restore(): Promise<string | null> {
    const current = this.get()
    if (current) return current

    const stored = await withStore<string>('readonly', (store) => store.get(DB_KEY))
    if (typeof stored === 'string' && stored.length > 0) {
      this.set(stored, 'persistent')
      return stored
    }
    return null
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
  }
}

/** The app has exactly one token; sharing the instance keeps memory state coherent. */
export const tokenStore = new TokenStore()
