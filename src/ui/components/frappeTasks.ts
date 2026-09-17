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

import { format } from 'date-fns'
import type { FrappeTask } from 'frappe-gantt'
import type { Task } from '../../domain/Task'

/**
 * Map domain tasks onto the shape `frappe-gantt` expects. The field names
 * differ: `title` -> `name`, `due` -> `end`, `dependsOn` -> `dependencies`.
 *
 * Every call builds **fresh plain objects**. `setup_tasks` writes `_start`,
 * `_end` and `_index` onto whatever it is handed, overwrites `dependencies`
 * and rewrites `id`; passing store objects — or Vue reactive proxies of them —
 * would corrupt store state.
 *
 * Dates are formatted in local time. A date-only string parses to local
 * midnight, so `toISOString()` would report the previous day east of UTC.
 */
export const WARNED_BAR_CLASS = 'gh-gantt-warned'

export function toFrappeTasks(tasks: Task[]): FrappeTask[] {
  return tasks.map((task) => ({
    id: task.id,
    name: `#${task.number} ${task.title}`,
    start: format(task.start, 'yyyy-MM-dd'),
    end: format(task.due, 'yyyy-MM-dd'),
    progress: 0,
    dependencies: [...task.dependsOn],
    // Marks the bar so warned tasks can be picked out visually.
    ...(task.warnings.length > 0 ? { custom_class: WARNED_BAR_CLASS } : {}),
  }))
}
