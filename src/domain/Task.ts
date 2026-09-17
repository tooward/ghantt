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
