import { defineStore } from 'pinia'
import { reactive, toRefs } from 'vue'
import { DEFAULT_MAP_CONFIG, type MapConfig } from '../../adapters/github/mapIssue'

export type ViewMode = 'Day' | 'Week' | 'Month'

export interface Settings extends MapConfig {
  viewMode: ViewMode
  pageSize: number
}

const DEFAULTS: Settings = {
  ...DEFAULT_MAP_CONFIG,
  viewMode: 'Week',
  pageSize: 50,
}

/**
 * User preferences. Persisted to local storage in Phase 6 — settings only,
 * never the token.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULTS })

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
  }

  return { ...toRefs(settings), mapConfig, reset }
})
