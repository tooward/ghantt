export type TaskId = string

/**
 * A single bar on the chart. Dates are always valid — `resolveDates` guarantees
 * it — so nothing downstream has to defend against `Invalid Date`.
 */
export interface Task {
  id: TaskId
  number: number
  title: string
  url: string
  start: Date
  due: Date
  /** Ids of tasks that must finish before this one can start. */
  dependsOn: TaskId[]
  /** Non-fatal problems found while building this task, shown in the UI. */
  warnings: string[]
}
