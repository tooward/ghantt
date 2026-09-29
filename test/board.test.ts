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
import { AuthError } from '../src/adapters/github/GitHubClient'
import { useBoardStore } from '../src/app/stores/board'
import type { Milestone, Task, TaskId } from '../src/domain/Task'
import type { IssuePage, IssueSource, RepoRef } from '../src/ports/IssueSource'
import type { FieldValue, IssueFieldRef, IssueWriter } from '../src/ports/IssueWriter'

function task(id: TaskId, dependsOn: TaskId[] = []): Task {
  return {
    id,
    number: Number(id.slice(1)),
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id.slice(1)}`,
    start: new Date('2026-01-01T00:00:00Z'),
    due: new Date('2026-01-02T00:00:00Z'),
    dependsOn,
    blockers: [],
    blocking: [],
    effort: null,
    effortDays: null,
    dateSources: { start: 'field', due: 'field' },
    canSetFields: true,
    warnings: [],
    milestone: null,
    isRelease: false,
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

/** Records writes and answers with the task as the forge would return it. */
class FakeWriter implements IssueWriter {
  writes: Array<{ issueId: TaskId; values: FieldValue[] }> = []
  failWith: Error | null = null

  private readonly repoFields: IssueFieldRef[]

  constructor(repoFields: IssueFieldRef[] = [
    { id: 'F_start', name: 'Start', kind: 'date' },
    { id: 'F_end', name: 'End', kind: 'date' },
    { id: 'F_effort', name: 'Days', kind: 'number' },
  ]) {
    this.repoFields = repoFields
  }

  async fields(): Promise<IssueFieldRef[]> {
    return this.repoFields
  }

  links: Array<{ op: 'add' | 'remove'; issueId: TaskId; blockerId: TaskId }> = []

  async addBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]> {
    return this.link('add', issueId, blockerId)
  }

  async removeBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]> {
    return this.link('remove', issueId, blockerId)
  }

  /** Answers like GitHub: both issues, with the link applied to each side. */
  private link(op: 'add' | 'remove', issueId: TaskId, blockerId: TaskId): Task[] {
    this.links.push({ op, issueId, blockerId })
    if (this.failWith) throw this.failWith
    const blocked = task(issueId, op === 'add' ? [blockerId] : [])
    const blocker = task(blockerId)
    const ref = (t: Task) => ({ id: t.id, number: t.number, title: t.title, closed: false, repository: null })
    if (op === 'add') {
      blocked.blockers = [ref(blocker)]
      blocker.blocking = [ref(blocked)]
    }
    return [blocked, blocker]
  }

  async setFields(issueId: TaskId, values: FieldValue[]): Promise<Task> {
    this.writes.push({ issueId, values })
    if (this.failWith) throw this.failWith
    const updated = task(issueId)
    for (const value of values) {
      if ('date' in value && value.fieldId === 'F_start') updated.start = new Date(`${value.date}T00:00:00`)
      if ('date' in value && value.fieldId === 'F_end') updated.due = new Date(`${value.date}T00:00:00`)
      if (value.fieldId === 'F_effort') updated.effortDays = 'number' in value ? value.number : null
    }
    return updated
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
  issueTypes: ['Task', 'Bug', 'Feature'],
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('board store', () => {
  it('passes the issue type filter to the source, and keeps it when paging', async () => {
    const board = useBoardStore()
    const source = new FakeSource([pageOf([task('a')], '1', 2), pageOf([task('b')], null, 2)])
    board.useSource(source)

    await board.loadRepo('acme', 'widgets', ' Feature ')
    await board.loadMore()

    expect(source.calls.map((call) => call.repo.issueType)).toEqual(['Feature', 'Feature'])
    expect(board.issueTypes).toEqual(['Task', 'Bug', 'Feature'])
  })

  it('treats a blank issue type as no filter', async () => {
    const board = useBoardStore()
    const source = new FakeSource([pageOf([task('a')], null, 1)])
    board.useSource(source)

    await board.loadRepo('acme', 'widgets', '  ')

    expect(source.calls[0].repo.issueType).toBeNull()
  })

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
    expect(board.repo).toEqual({ owner: 'acme', name: 'gadgets', issueType: null })
  })

  it('refreshes from the first page, keeping the chart up until the new issues arrive', async () => {
    const board = useBoardStore()
    const source = new FakeSource([pageOf([task('#1')], null, 1)])
    board.useSource(source)
    await board.loadRepo('o', 'r', 'Feature')

    const pending = board.refresh()
    expect(board.loading).toBe(true)
    expect(board.tasks.map((t) => t.id)).toEqual(['#1'])
    await pending

    expect(source.calls).toEqual([
      { repo: { owner: 'o', name: 'r', issueType: 'Feature' }, cursor: null },
      { repo: { owner: 'o', name: 'r', issueType: 'Feature' }, cursor: null },
    ])
  })

  it('shows what GitHub now has after a refresh', async () => {
    const board = useBoardStore()
    const pages = [pageOf([task('#1')], null, 1)]
    board.useSource(new FakeSource(pages))
    await board.loadRepo('o', 'r')

    pages[0] = pageOf([task('#1'), task('#2')], null, 2)
    await board.refresh()

    expect(board.tasks.map((t) => t.id)).toEqual(['#1', '#2'])
    expect(board.totalCount).toBe(2)
  })

  it('keeps the chart and reports the error when a refresh fails', async () => {
    const board = useBoardStore()
    const pages = [pageOf([task('#1')], null, 1)]
    board.useSource(new FakeSource(pages))
    await board.loadRepo('o', 'r')

    pages.length = 0
    await board.refresh()

    expect(board.tasks.map((t) => t.id)).toEqual(['#1'])
    expect(board.error).toContain('no page')
  })

  it('does nothing on refresh before a repository is loaded', async () => {
    const board = useBoardStore()
    const source = new FakeSource([])
    board.useSource(source)

    await board.refresh()

    expect(source.calls).toEqual([])
  })

  describe('milestones', () => {
    const v1: Milestone = {
      id: 'M1', title: 'v1', dueOn: new Date(2026, 0, 9), url: 'https://github.com/o/r/milestone/1',
      openIssueCount: 1, closedIssueCount: 0,
    }

    class MilestoneSource extends FakeSource {
      milestoneCalls = 0
      failMilestones = false
      async fetchMilestones(): Promise<Milestone[]> {
        this.milestoneCalls += 1
        if (this.failMilestones) throw new Error('milestones unavailable')
        return [v1]
      }
    }

    const member = { ...task('#1'), milestone: { id: 'M1', title: 'v1', dueOn: v1.dueOn } }

    it('loads milestones beside the first page and charts them as diamonds', async () => {
      const board = useBoardStore()
      const source = new MilestoneSource([pageOf([member, task('#2')], null, 2)])
      board.useSource(source)
      await board.loadRepo('o', 'r')

      expect(source.milestoneCalls).toBe(1)
      expect(board.timeline.map((row) => row.id)).toEqual(['#1', 'milestone:M1', '#2'])
      // The issue list itself is untouched: no stand-in rows in it.
      expect(board.tasks.map((t) => t.id)).toEqual(['#1', '#2'])
    })

    it('still charts the issues when the milestone lookup fails', async () => {
      const board = useBoardStore()
      const source = new MilestoneSource([pageOf([member], null, 1)])
      source.failMilestones = true
      board.useSource(source)
      await board.loadRepo('o', 'r')

      expect(board.error).toBeNull()
      expect(board.milestones).toEqual([])
      // Its own milestone reference still groups it; with a due date, it still gets a diamond.
      expect(board.timeline.map((row) => row.id)).toEqual(['#1', 'milestone:M1'])
    })

    it('looks the milestones up again on refresh, and forgets them on clear', async () => {
      const board = useBoardStore()
      const source = new MilestoneSource([pageOf([member], null, 1)])
      board.useSource(source)
      await board.loadRepo('o', 'r')
      await board.refresh()
      await Promise.resolve()

      expect(source.milestoneCalls).toBe(2)
      board.clear()
      expect(board.milestones).toEqual([])
    })
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

  describe('saving dates', () => {
    async function boardWith(writer: FakeWriter) {
      const board = useBoardStore()
      board.useSource(new FakeSource([pageOf([task('a'), task('b', ['a']), task('c')], null, 3)]))
      board.useWriter(writer)
      await board.loadRepo('acme', 'widgets')
      await Promise.resolve()
      return board
    }

    it('looks up the date fields beside the board and makes both dates editable', async () => {
      const board = await boardWith(new FakeWriter())

      expect(board.fields.map((field) => field.name)).toEqual(['Start', 'End', 'Days'])
      expect(board.fieldEditability).toEqual({ start: null, due: null, effort: null })
    })

    it('says which date cannot be edited when a field is missing', async () => {
      const board = await boardWith(new FakeWriter([{ id: 'F_start', name: 'start', kind: 'date' }]))

      expect(board.fieldEditability.start).toBeNull()
      expect(board.fieldEditability.due).toBe('This repository has no date field named “End”.')
    })

    it('writes only the changed field, by its id, and replaces the task in place', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      expect(await board.saveFields('b', { due: '2026-03-01' })).toBeNull()

      expect(writer.writes).toEqual([{ issueId: 'b', values: [{ fieldId: 'F_end', date: '2026-03-01' }] }])
      expect(board.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
      expect(board.tasks[1].due.getMonth()).toBe(2)
    })

    it('sends both fields in one write when both changed', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      await board.saveFields('a', { start: '2026-02-01', due: '2026-02-10' })

      expect(writer.writes).toHaveLength(1)
      expect(writer.writes[0].values.map((v) => v.fieldId)).toEqual(['F_start', 'F_end'])
    })

    it('turns a permission error into a write-access message without disconnecting', async () => {
      const writer = new FakeWriter()
      writer.failWith = new AuthError('Resource not accessible by personal access token')
      const board = await boardWith(writer)

      const message = await board.saveFields('a', { start: '2026-02-01' })

      expect(message).toContain('Issues: Read and write')
      expect(message).toContain('Resource not accessible by personal access token')
      expect(board.tasks).toHaveLength(3)
      expect(board.error).toBeNull()
    })

    it('refuses to write a date whose field does not exist', async () => {
      const writer = new FakeWriter([{ id: 'F_start', name: 'Start', kind: 'date' }])
      const board = await boardWith(writer)

      expect(await board.saveFields('a', { due: '2026-02-10' })).toContain('no date field named “End”')
      expect(writer.writes).toEqual([])
    })

    it('writes Days as a number, and clears it with null', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      expect(await board.saveFields('a', { effort: 2.5 })).toBeNull()
      expect(await board.saveFields('a', { effort: null })).toBeNull()

      expect(writer.writes.map((w) => w.values)).toEqual([
        [{ fieldId: 'F_effort', number: 2.5 }],
        [{ fieldId: 'F_effort', clear: true }],
      ])
    })

    it('sends dates and Days together in one write', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      await board.saveFields('a', { due: '2026-02-10', effort: 3 })

      expect(writer.writes).toHaveLength(1)
      expect(writer.writes[0].values.map((v) => v.fieldId)).toEqual(['F_end', 'F_effort'])
    })

    it('refuses an Days that is not above zero', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      expect(await board.saveFields('a', { effort: 0 })).toBe('Days must be a number above zero.')
      expect(writer.writes).toEqual([])
    })

    it('says so when Days is a single-select field, which cannot be calculated with', async () => {
      const writer = new FakeWriter([
        { id: 'F_start', name: 'Start', kind: 'date' },
        { id: 'F_end', name: 'End', kind: 'date' },
        { id: 'F_effort', name: 'Days', kind: 'single-select' },
      ])
      const board = await boardWith(writer)

      expect(board.fieldEditability.start).toBeNull()
      expect(board.fieldEditability.effort).toBe('“Days” is a single-select field here; editing needs a number field.')
      expect(await board.saveFields('a', { effort: 3 })).toContain('single-select')
      expect(writer.writes).toEqual([])
    })

    it('says which Days field is missing', async () => {
      const board = await boardWith(new FakeWriter([{ id: 'F_start', name: 'Start', kind: 'date' }]))

      expect(board.fieldEditability.effort).toBe('This repository has no field named “Days”.')
    })

    it('is read-only when the source cannot write', async () => {
      const board = useBoardStore()
      board.useSource(new FakeSource([pageOf([task('a')], null, 1)]))
      await board.loadRepo('acme', 'widgets')

      expect(board.fieldEditability).toEqual({
        start: 'Editing is not available.',
        due: 'Editing is not available.',
        effort: 'Editing is not available.',
      })
      expect(await board.saveFields('a', { start: '2026-02-01' })).toBe('Editing is not available.')
    })
  })

  describe('blocking links', () => {
    async function boardWith(writer: FakeWriter) {
      const board = useBoardStore()
      // c is blocked by b; a stands alone.
      board.useSource(new FakeSource([pageOf([task('a'), task('b'), task('c', ['b'])], null, 3)]))
      board.useWriter(writer)
      await board.loadRepo('acme', 'widgets')
      return board
    }

    it('links a blocker and updates both issues in place', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      expect(await board.linkBlocker('a', 'b')).toBeNull()

      expect(writer.links).toEqual([{ op: 'add', issueId: 'a', blockerId: 'b' }])
      expect(board.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
      expect(board.tasks[0].dependsOn).toEqual(['b'])
      expect(board.tasks[1].blocking.map((l) => l.id)).toEqual(['a'])
      // The arrow appears straight away.
      expect(board.graph.tasks[0].dependsOn).toEqual(['b'])
    })

    it('refuses a link that would loop, without asking GitHub', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      const message = await board.linkBlocker('b', 'c')

      expect(message).toContain('loop')
      expect(writer.links).toEqual([])
    })

    it('unlinks', async () => {
      const writer = new FakeWriter()
      const board = await boardWith(writer)

      expect(await board.unlinkBlocker('c', 'b')).toBeNull()

      expect(writer.links).toEqual([{ op: 'remove', issueId: 'c', blockerId: 'b' }])
      expect(board.tasks[2].dependsOn).toEqual([])
    })

    it('explains a read-only token rather than disconnecting', async () => {
      const writer = new FakeWriter()
      writer.failWith = new AuthError('Resource not accessible by personal access token')
      const board = await boardWith(writer)

      expect(await board.linkBlocker('a', 'b')).toContain('Issues: Read and write')
      expect(board.tasks[0].dependsOn).toEqual([])
      expect(board.error).toBeNull()
    })

    it('ignores a returned issue that is not on the board', async () => {
      const board = await boardWith(new FakeWriter())

      // "z" is, say, a Task while the board shows Features.
      expect(await board.linkBlocker('a', 'z')).toBeNull()

      expect(board.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
      expect(board.tasks[0].dependsOn).toEqual(['z'])
    })
  })

  describe('looking up an issue that is not loaded', () => {
    /** Serves pages, plus single issues by number from a second pool. */
    class LookupSource extends FakeSource {
      lookups: Array<{ repo: RepoRef; number: number }> = []

      constructor(pages: IssuePage[], private readonly others: Map<number, Task>) {
        super(pages)
      }

      async fetchIssue(repo: RepoRef, number: number): Promise<Task> {
        this.lookups.push({ repo, number })
        const found = this.others.get(number)
        if (!found) throw new Error(`Could not resolve to an Issue with the number of ${number}.`)
        return found
      }
    }

    async function boardWith(others: Map<number, Task>) {
      const board = useBoardStore()
      const source = new LookupSource([pageOf([task('a'), task('b')], null, 2)], others)
      board.useSource(source)
      board.useWriter(new FakeWriter())
      await board.loadRepo('acme', 'widgets')
      return { board, source }
    }

    it('offers a lookup for a reference, labelled for the current repository', async () => {
      const { board } = await boardWith(new Map())

      expect(board.issueRefFor('#42')?.label).toBe('#42')
      expect(board.issueRefFor('acme/api#9')?.label).toBe('acme/api#9')
      expect(board.issueRefFor('Build the thing')).toBeNull()
    })

    it('fetches the issue in the named repository, once', async () => {
      const { board, source } = await boardWith(new Map([[42, task('x42')]]))

      const result = await board.lookupIssue(board.issueRefFor('#42')!.ref)

      expect(result).toMatchObject({ id: 'x42' })
      expect(source.lookups).toEqual([{ repo: { owner: 'acme', name: 'widgets' }, number: 42 }])
      // Looked up, not loaded: the board is unchanged.
      expect(board.tasks.map((t) => t.id)).toEqual(['a', 'b'])
    })

    it('explains a missing issue, or a pull request number', async () => {
      const { board } = await boardWith(new Map())

      expect(await board.lookupIssue(board.issueRefFor('#7')!.ref)).toBe('There is no issue #7. (Pull requests cannot block.)')
    })

    it('counts a looked-up issue’s own links when checking a new link for loops', async () => {
      // x waits on a. Making a wait on x would close a loop the board cannot see.
      const { board } = await boardWith(new Map([[9, task('x', ['a'])]]))
      await board.lookupIssue(board.issueRefFor('#9')!.ref)

      expect(await board.linkBlocker('a', 'x')).toContain('loop')
    })

    it('offers no lookup when the source cannot fetch single issues', async () => {
      const board = useBoardStore()
      board.useSource(new FakeSource([pageOf([task('a')], null, 1)]))
      await board.loadRepo('acme', 'widgets')

      expect(board.issueRefFor('#42')).toBeNull()
    })
  })
})
