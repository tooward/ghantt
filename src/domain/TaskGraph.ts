import type { Task, TaskId } from './Task'

export interface PruneResult {
  tasks: Task[]
  /** How many edges pointed at something not in this task set. */
  dropped: number
}

export interface CycleResult {
  tasks: Task[]
  /** Each broken edge as [dependent, dependency] — the one that closed the loop. */
  brokenEdges: Array<[TaskId, TaskId]>
}

/**
 * Drop dependency edges whose target is not in this task set.
 *
 * `blockedBy` routinely references issues that are closed, in another
 * repository, or on a page not yet loaded. Handing such an id to the chart
 * library misrenders or throws, so this must run before every render — and
 * again over the whole accumulated set after each page, because a later page
 * can supply the target of an edge that dangled earlier.
 */
export function pruneDanglingEdges(tasks: Task[]): PruneResult {
  const known = new Set(tasks.map((task) => task.id))
  let dropped = 0

  const pruned = tasks.map((task) => {
    const kept = task.dependsOn.filter((id) => known.has(id) && id !== task.id)
    dropped += task.dependsOn.length - kept.length
    return kept.length === task.dependsOn.length ? { ...task } : { ...task, dependsOn: kept }
  })

  return { tasks: pruned, dropped }
}

/**
 * Break dependency cycles so the graph can be drawn.
 *
 * GitHub does not guarantee an acyclic graph. Depth-first search with
 * three-colour marking (white = unvisited, grey = on the current path,
 * black = finished); an edge into a grey node is a back edge and gets removed.
 * The colour map is what stops a cycle from recursing forever.
 */
export function detectAndBreakCycles(tasks: Task[]): CycleResult {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const colour = new Map<TaskId, 'grey' | 'black'>()
  const removed = new Map<TaskId, Set<TaskId>>()
  const brokenEdges: Array<[TaskId, TaskId]> = []

  const visit = (id: TaskId): void => {
    colour.set(id, 'grey')

    for (const dependencyId of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dependencyId)) continue

      const state = colour.get(dependencyId)
      if (state === 'grey') {
        // Back edge: following it would close the loop we are standing in.
        const set = removed.get(id) ?? new Set<TaskId>()
        set.add(dependencyId)
        removed.set(id, set)
        brokenEdges.push([id, dependencyId])
      } else if (state === undefined) {
        visit(dependencyId)
      }
    }

    colour.set(id, 'black')
  }

  for (const task of tasks) {
    if (!colour.has(task.id)) visit(task.id)
  }

  if (brokenEdges.length === 0) {
    return { tasks: tasks.map((task) => ({ ...task })), brokenEdges }
  }

  const withCyclesBroken = tasks.map((task) => {
    const drop = removed.get(task.id)
    if (!drop) return { ...task }
    return {
      ...task,
      dependsOn: task.dependsOn.filter((id) => !drop.has(id)),
      warnings: [
        ...task.warnings,
        `Circular dependency: ignoring that this is blocked by ${[...drop].join(', ')}.`,
      ],
    }
  })

  return { tasks: withCyclesBroken, brokenEdges }
}
