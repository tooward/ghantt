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
 * Persistence for user preferences — and only preferences.
 *
 * This is the one place the app is allowed to touch `window.localStorage`, and
 * the token must never reach it (ARCHITECTURE.md §6). Storage throws outright
 * in some private-browsing modes, so every call is wrapped and a failure
 * simply means the app runs with defaults.
 */

const KEY = 'gh-gantt:settings'

export function loadSettings<T extends object>(): Partial<T> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<T>) : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings: object): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Quota, private mode, or storage disabled: preferences just will not persist.
  }
}

export function clearSettings(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing readable to clear.
  }
}
