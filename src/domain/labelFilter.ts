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

import type { Task } from './Task'
import { pruneDanglingEdges } from './TaskGraph'

const normalise = (label: string) => label.trim().toLowerCase()

/**
 * The tasks to chart under a label filter: those carrying any of `selected`,
 * matched case-insensitively. An empty selection hides nothing.
 *
 * Release issues always stay: they are their milestone's diamond, and hiding
 * one would turn it into a stand-in that no longer blocks anything.
 *
 * Edges into hidden tasks are dropped here, since the chart library misrenders
 * an edge to a task it was not given. They are hidden by choice rather than
 * missing, so they are not counted with the graph's dangling edges.
 */
export function filterByLabels(tasks: Task[], selected: string[]): Task[] {
  const wanted = new Set(selected.map(normalise).filter(Boolean))
  if (wanted.size === 0) return tasks
  const shown = tasks.filter((task) => task.isRelease || task.labels.some((label) => wanted.has(normalise(label))))
  return pruneDanglingEdges(shown).tasks
}

/** Every label on these tasks, once each and A–Z, ignoring case; the first spelling seen wins. */
export function labelsOf(tasks: Task[]): string[] {
  const byKey = new Map<string, string>()
  for (const task of tasks) {
    for (const label of task.labels) {
      const key = normalise(label)
      if (key && !byKey.has(key)) byKey.set(key, label.trim())
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
