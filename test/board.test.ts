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

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBoardStore } from '../src/app/stores/board'
import type { Task, TaskId } from '../src/domain/Task'
import type { IssuePage, IssueSource, RepoRef } from '../src/ports/IssueSource'

function task(id: TaskId, dependsOn: TaskId[] = []): Task {
  return {
    id,
    number: Number(id.slice(1)),
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id.slice(1)}`,
    start: new Date('2026-01-01T00:00:00Z'),
    due: new Date('2026-01-02T00:00:00Z'),
    dependsOn,
    warnings: [],
  }
}

/** Serves prepared pages, so nothing here touches the network. */
class FakeSource implements IssueSource {
  calls: Array<{ repo: RepoRef; cursor: string | null }> = []

  constructor(private readonly pages: IssuePage[]) {}

  async fetchPage(repo: RepoRef, cursor: string | null): Promise<IssuePage> {
    this.calls.push({ repo, cursor })
    const index = cursor === null ? 0 : Number(cursor)
    const page = this.pages[index]
    if (!page) throw new Error(`no page at cursor ${cursor}`)
    return page
  }
}

class FailingSource implements IssueSource {
  async fetchPage(): Promise<IssuePage> {
    throw new Error('Repository acme/nope was not found, or the token cannot see it.')
  }
}

const pageOf = (tasks: Task[], next: string | null, totalCount: number): IssuePage => ({
  tasks,
  endCursor: next,
  hasNextPage: next !== null,
  totalCount,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('board store', () => {
  it('loads a repository and exposes a renderable graph', async () => {
    const board = useBoardStore()
    board.useSource(new FakeSource([pageOf([task('a'), task('b', ['a'])], null, 2)]))

    await board.loadRepo('acme', 'widgets')

    expect(board.tasks).toHaveLength(2)
    expect(board.totalCount).toBe(2)
    expect(board.hasNextPage).toBe(false)
    expect(board.graph.droppedEdges).toBe(0)
    expect(board.graph.tasks.find((t) => t.id === 'b')?.dependsOn).toEqual(['a'])
  })

  // The bug this guards against: pruning in place would delete the edge on page
  // one, so page two could never heal it.
  it('heals a dangling edge when a later page supplies its target', async () => {
    const board = useBoardStore()
    board.useSource(
      new FakeSource([
        pageOf([task('b', ['a'])], '1', 2),
        pageOf([task('a')], null, 2),
      ]),
    )

    await board.loadRepo('acme', 'widgets')
    expect(board.graph.droppedEdges).toBe(1)
    expect(board.graph.tasks[0].dependsOn).toEqual([])

    await board.loadMore()

    expect(board.graph.droppedEdges).toBe(0)
    expect(board.graph.tasks.find((t) => t.id === 'b')?.dependsOn).toEqual(['a'])
    expect(board.tasks).toHaveLength(2)
  })

  it('keeps raw dependsOn intact regardless of what the graph prunes', async () => {
    const board = useBoardStore()
    board.useSource(new FakeSource([pageOf([task('b', ['ghost'])], null, 1)]))

    await board.loadRepo('acme', 'widgets')

    expect(board.tasks[0].dependsOn).toEqual(['ghost'])
    expect(board.graph.tasks[0].dependsOn).toEqual([])
    expect(board.graph.droppedEdges).toBe(1)
  })

  it('does not accumulate cycle warnings across page loads', async () => {
    const board = useBoardStore()
    board.useSource(
      new FakeSource([
        pageOf([task('a', ['b']), task('b', ['a'])], '1', 3),
        pageOf([task('c')], null, 3),
      ]),
    )

    await board.loadRepo('acme', 'widgets')
    await board.loadMore()

    const warnings = board.graph.tasks.flatMap((t) => t.warnings)
    expect(warnings.filter((w) => w.includes('Circular dependency'))).toHaveLength(1)
    expect(board.graph.brokenCycles).toBe(1)
  })

  it('reports an error instead of throwing when the repository is missing', async () => {
    const board = useBoardStore()
    board.useSource(new FailingSource())

    await board.loadRepo('acme', 'nope')

    expect(board.error).toContain('was not found')
    expect(board.tasks).toEqual([])
    expect(board.loading).toBe(false)
  })

  it('handles a repository with no issues', async () => {
    const board = useBoardStore()
    board.useSource(new FakeSource([pageOf([], null, 0)]))

    await board.loadRepo('acme', 'empty')

    expect(board.isEmpty).toBe(true)
    expect(board.graph.tasks).toEqual([])
    expect(board.error).toBeNull()
  })

  it('replaces the previous repository rather than appending to it', async () => {
    const board = useBoardStore()
    board.useSource(new FakeSource([pageOf([task('a')], null, 1)]))
    await board.loadRepo('acme', 'widgets')
    await board.loadRepo('acme', 'gadgets')

    expect(board.tasks).toHaveLength(1)
    expect(board.repo).toEqual({ owner: 'acme', name: 'gadgets' })
  })

  it('does not page past the end', async () => {
    const board = useBoardStore()
    const source = new FakeSource([pageOf([task('a')], null, 1)])
    board.useSource(source)

    await board.loadRepo('acme', 'widgets')
    await board.loadMore()

    expect(source.calls).toHaveLength(1)
  })
})

describe('board store at board scale', () => {
  it('pages a 250-issue chain in and heals every edge across page boundaries', async () => {
    const pageSize = 50
    const all = Array.from({ length: 250 }, (_, index) =>
      task(`n${index}`, index === 0 ? [] : [`n${index - 1}`]),
    )
    const pages = Array.from({ length: 5 }, (_, page) =>
      pageOf(
        all.slice(page * pageSize, (page + 1) * pageSize),
        page === 4 ? null : String(page + 1),
        all.length,
      ),
    )

    const board = useBoardStore()
    board.useSource(new FakeSource(pages))

    await board.loadRepo('acme', 'big')
    while (board.hasNextPage) await board.loadMore()

    expect(board.tasks).toHaveLength(250)
    // Every edge but the first task's resolves once the whole chain is loaded.
    expect(board.graph.tasks.flatMap((t) => t.dependsOn)).toHaveLength(249)
    expect(board.graph.droppedEdges).toBe(0)
    expect(board.graph.brokenCycles).toBe(0)
  })

  it('breaks a cycle spanning two pages without hanging', async () => {
    const board = useBoardStore()
    board.useSource(
      new FakeSource([
        pageOf([task('a', ['d'])], '1', 4),
        pageOf([task('d', ['a'])], null, 4),
      ]),
    )

    await board.loadRepo('acme', 'big')
    await board.loadMore()

    expect(board.graph.brokenCycles).toBe(1)
    expect(board.graph.tasks.flatMap((t) => t.dependsOn)).toHaveLength(1)
  })
})
