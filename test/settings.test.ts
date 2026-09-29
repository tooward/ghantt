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
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from '../src/app/stores/settings'

const KEY = 'gh-gantt:settings'

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

describe('settings persistence', () => {
  it('starts from defaults when nothing is stored', () => {
    const settings = useSettingsStore()

    expect(settings.startFieldName).toBe('Start')
    expect(settings.viewMode).toBe('Week')
    expect(settings.issueType).toBe('Feature')
  })

  it('restores stored preferences', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ viewMode: 'Day', lastOwner: 'acme', pageSize: 25 }))

    const settings = useSettingsStore()

    expect(settings.viewMode).toBe('Day')
    expect(settings.lastOwner).toBe('acme')
    expect(settings.pageSize).toBe(25)
  })

  it('reads the Days field by default, even where the old Effort setting was stored', () => {
    // The field was renamed; "Effort" is now a different, single-select field.
    window.localStorage.setItem(KEY, JSON.stringify({ effortFieldName: 'Effort' }))

    const settings = useSettingsStore()

    expect(settings.daysFieldName).toBe('Days')
    expect(settings.mapConfig()).not.toHaveProperty('effortFieldName')
  })

  it('uses the release label “release” by default, and keeps a stored one', () => {
    expect(useSettingsStore().releaseLabel).toBe('release')

    window.localStorage.setItem(KEY, JSON.stringify({ releaseLabel: 'ship-it' }))
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect(settings.releaseLabel).toBe('ship-it')
    expect(settings.mapConfig().releaseLabel).toBe('ship-it')
  })

  it('ignores stored values of the wrong shape', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ viewMode: 'Decade', pageSize: -5, defaultTaskDays: 'lots', startFieldName: 42 }),
    )

    const settings = useSettingsStore()

    expect(settings.viewMode).toBe('Week')
    expect(settings.pageSize).toBe(50)
    expect(settings.defaultTaskDays).toBe(1)
    expect(settings.startFieldName).toBe('Start')
  })

  it('caps a page size above what GitHub accepts', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ pageSize: 5000 }))

    expect(useSettingsStore().pageSize).toBe(100)
  })

  it('survives unparseable stored JSON', () => {
    window.localStorage.setItem(KEY, 'not json {{{')

    expect(() => useSettingsStore()).not.toThrow()
    expect(useSettingsStore().viewMode).toBe('Week')
  })

  it('never writes a token to local storage', async () => {
    const settings = useSettingsStore()
    settings.lastOwner = 'acme'
    await new Promise((resolve) => setTimeout(resolve, 0))

    const stored = window.localStorage.getItem(KEY) ?? ''
    expect(stored).toContain('acme')
    expect(stored.toLowerCase()).not.toContain('token')
  })

  it('reset restores defaults and drops what was persisted', async () => {
    const settings = useSettingsStore()
    settings.viewMode = 'Month'
    settings.lastOwner = 'acme'
    await new Promise((resolve) => setTimeout(resolve, 0))

    settings.reset()
    // Let the persistence watcher settle before reading storage back.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(settings.viewMode).toBe('Week')
    const stored = window.localStorage.getItem(KEY)
    expect(stored === null || !stored.includes('acme')).toBe(true)
  })
})
