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
import { reactive, toRefs, watch } from 'vue'
import { DEFAULT_MAP_CONFIG, type MapConfig } from '../../adapters/github/mapIssue'
import { clearSettings, loadSettings, saveSettings } from '../../adapters/storage/SettingsStore'

export type ViewMode = 'Day' | 'Week' | 'Month'

export interface Settings extends MapConfig {
  viewMode: ViewMode
  pageSize: number
  /** Last repository loaded, so a reload lands where the user left off. */
  lastOwner: string
  lastRepo: string
}

const DEFAULTS: Settings = {
  ...DEFAULT_MAP_CONFIG,
  viewMode: 'Week',
  pageSize: 50,
  lastOwner: '',
  lastRepo: '',
}

const VIEW_MODES: ViewMode[] = ['Day', 'Week', 'Month']

/** Stored settings are user-editable text; take only what is the right shape. */
function sanitise(stored: Partial<Settings>): Partial<Settings> {
  const clean: Partial<Settings> = {}
  for (const key of ['startFieldName', 'dueFieldName', 'startPrefix', 'duePrefix', 'lastOwner', 'lastRepo'] as const) {
    if (typeof stored[key] === 'string') clean[key] = stored[key]
  }
  if (typeof stored.defaultTaskDays === 'number' && stored.defaultTaskDays > 0) {
    clean.defaultTaskDays = Math.min(Math.round(stored.defaultTaskDays), 365)
  }
  if (typeof stored.pageSize === 'number' && stored.pageSize > 0) {
    // GitHub's connection page size limit.
    clean.pageSize = Math.min(Math.round(stored.pageSize), 100)
  }
  if (stored.viewMode && VIEW_MODES.includes(stored.viewMode)) clean.viewMode = stored.viewMode
  return clean
}

/**
 * User preferences. Persisted to local storage in Phase 6 — settings only,
 * never the token.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULTS, ...sanitise(loadSettings<Settings>()) })

  // Preferences only. The token is never written here — see TokenStore.
  watch(settings, () => saveSettings({ ...settings }), { deep: true })

  function mapConfig(): MapConfig {
    return {
      startFieldName: settings.startFieldName,
      dueFieldName: settings.dueFieldName,
      startPrefix: settings.startPrefix,
      duePrefix: settings.duePrefix,
      defaultTaskDays: settings.defaultTaskDays,
    }
  }

  function reset(): void {
    Object.assign(settings, DEFAULTS)
    clearSettings()
  }

  return { ...toRefs(settings), viewModes: VIEW_MODES, mapConfig, reset }
})
