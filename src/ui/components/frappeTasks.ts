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
export function toFrappeTasks(tasks: Task[]): FrappeTask[] {
  return tasks.map((task) => ({
    id: task.id,
    name: `#${task.number} ${task.title}`,
    start: format(task.start, 'yyyy-MM-dd'),
    end: format(task.due, 'yyyy-MM-dd'),
    progress: 0,
    dependencies: [...task.dependsOn],
  }))
}
