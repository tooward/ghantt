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

import { describe, expect, it } from 'vitest'
import { filterByLabels, labelsOf } from '../src/domain/labelFilter'
import type { Task, TaskId } from '../src/domain/Task'

function task(id: TaskId, labels: string[], extra: Partial<Task> = {}): Task {
  return {
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id}`,
    start: new Date('2026-01-01T00:00:00Z'),
    due: new Date('2026-01-02T00:00:00Z'),
    dependsOn: [],
    blockers: [],
    blocking: [],
    effort: null,
    effortDays: null,
    dateSources: { start: 'field', due: 'field' },
    canSetFields: true,
    warnings: [],
    milestone: null,
    labels,
    isRelease: false,
    ...extra,
  }
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id)

describe('filterByLabels', () => {
  const tasks = [task('a', ['bug']), task('b', ['UI', 'bug']), task('c', []), task('d', ['docs'])]

  it('hides nothing when no label is chosen', () => {
    expect(filterByLabels(tasks, [])).toBe(tasks)
    expect(filterByLabels(tasks, ['  '])).toBe(tasks)
  })

  it('keeps issues with any chosen label, ignoring case and spaces', () => {
    expect(ids(filterByLabels(tasks, ['ui']))).toEqual(['b'])
    expect(ids(filterByLabels(tasks, [' Bug ', 'docs']))).toEqual(['a', 'b', 'd'])
  })

  it('always keeps release issues, which are milestone diamonds', () => {
    const release = task('r', ['release'], { isRelease: true })
    expect(ids(filterByLabels([...tasks, release], ['docs']))).toEqual(['d', 'r'])
  })

  it('drops edges into hidden issues, leaving the originals untouched', () => {
    const blocked = task('b', ['ui'], { dependsOn: ['a', 'x'] })
    const shown = filterByLabels([task('a', ['bug']), blocked, task('x', ['ui'])], ['ui'])

    expect(shown.find((t) => t.id === 'b')?.dependsOn).toEqual(['x'])
    expect(blocked.dependsOn).toEqual(['a', 'x'])
  })
})

describe('labelsOf', () => {
  it('lists each label once, A–Z, in the first spelling seen', () => {
    const tasks = [task('a', ['bug', 'UI']), task('b', ['ui', 'Docs ']), task('c', [])]
    expect(labelsOf(tasks)).toEqual(['bug', 'Docs', 'UI'])
  })
})
