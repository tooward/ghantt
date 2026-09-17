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
import type { Task, TaskId } from '../src/domain/Task'
import { detectAndBreakCycles, pruneDanglingEdges } from '../src/domain/TaskGraph'

function task(id: TaskId, dependsOn: TaskId[] = []): Task {
  return {
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id}`,
    start: new Date('2026-01-01T00:00:00Z'),
    due: new Date('2026-01-02T00:00:00Z'),
    dependsOn,
    warnings: [],
  }
}

const edgesOf = (tasks: Task[]) =>
  Object.fromEntries(tasks.map((t) => [t.id, [...t.dependsOn].sort()]))

describe('pruneDanglingEdges', () => {
  it('keeps edges whose target is present', () => {
    const { tasks, dropped } = pruneDanglingEdges([task('a'), task('b', ['a'])])

    expect(dropped).toBe(0)
    expect(edgesOf(tasks)).toEqual({ a: [], b: ['a'] })
  })

  it('drops an edge to an id that is not in the set, and counts it', () => {
    const { tasks, dropped } = pruneDanglingEdges([task('a', ['closed-issue']), task('b', ['a', 'other-repo'])])

    expect(dropped).toBe(2)
    expect(edgesOf(tasks)).toEqual({ a: [], b: ['a'] })
  })

  it('drops a self-referencing dependency', () => {
    const { tasks, dropped } = pruneDanglingEdges([task('a', ['a'])])

    expect(dropped).toBe(1)
    expect(edgesOf(tasks)).toEqual({ a: [] })
  })

  it('does not mutate the input', () => {
    const input = [task('a', ['missing'])]
    pruneDanglingEdges(input)

    expect(input[0].dependsOn).toEqual(['missing'])
  })

  it('handles an empty task set', () => {
    expect(pruneDanglingEdges([])).toEqual({ tasks: [], dropped: 0 })
  })
})

describe('detectAndBreakCycles', () => {
  it('leaves an acyclic graph alone', () => {
    const { tasks, brokenEdges } = detectAndBreakCycles([task('a'), task('b', ['a']), task('c', ['b'])])

    expect(brokenEdges).toEqual([])
    expect(edgesOf(tasks)).toEqual({ a: [], b: ['a'], c: ['b'] })
  })

  it('terminates on a two-node cycle and breaks exactly one edge', () => {
    const { tasks, brokenEdges } = detectAndBreakCycles([task('a', ['b']), task('b', ['a'])])

    expect(brokenEdges).toHaveLength(1)
    const remaining = tasks.flatMap((t) => t.dependsOn)
    expect(remaining).toHaveLength(1)
  })

  it('terminates on a three-node cycle', () => {
    const { tasks, brokenEdges } = detectAndBreakCycles([
      task('a', ['c']),
      task('b', ['a']),
      task('c', ['b']),
    ])

    expect(brokenEdges).toHaveLength(1)
    expect(tasks.flatMap((t) => t.dependsOn)).toHaveLength(2)
  })

  it('breaks a self-loop', () => {
    const { tasks, brokenEdges } = detectAndBreakCycles([task('a', ['a'])])

    expect(brokenEdges).toEqual([['a', 'a']])
    expect(edgesOf(tasks)).toEqual({ a: [] })
  })

  it('records a warning on the task whose edge was broken', () => {
    const { tasks } = detectAndBreakCycles([task('a', ['b']), task('b', ['a'])])

    expect(tasks.some((t) => t.warnings.some((w) => w.includes('Circular dependency')))).toBe(true)
  })

  it('handles two independent cycles', () => {
    const { brokenEdges } = detectAndBreakCycles([
      task('a', ['b']),
      task('b', ['a']),
      task('c', ['d']),
      task('d', ['c']),
    ])

    expect(brokenEdges).toHaveLength(2)
  })

  it('ignores edges to ids outside the set instead of following them', () => {
    const { tasks, brokenEdges } = detectAndBreakCycles([task('a', ['ghost'])])

    expect(brokenEdges).toEqual([])
    expect(edgesOf(tasks)).toEqual({ a: ['ghost'] })
  })

  it('completes on a long chain without blowing the stack', () => {
    const chain = Array.from({ length: 500 }, (_, index) =>
      task(`n${index}`, index === 0 ? [] : [`n${index - 1}`]),
    )
    // Close the chain into one big cycle.
    chain[0].dependsOn = ['n499']

    const { brokenEdges } = detectAndBreakCycles(chain)

    expect(brokenEdges).toHaveLength(1)
  })

  it('does not mutate the input', () => {
    const input = [task('a', ['b']), task('b', ['a'])]
    detectAndBreakCycles(input)

    expect(input.map((t) => t.dependsOn)).toEqual([['b'], ['a']])
  })

  it('handles an empty task set', () => {
    expect(detectAndBreakCycles([])).toEqual({ tasks: [], brokenEdges: [] })
  })
})
