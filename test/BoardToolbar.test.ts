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

// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBoardStore } from '../src/app/stores/board'
import type { IssuePage, IssueSource, RepoRef } from '../src/ports/IssueSource'
import BoardToolbar from '../src/ui/components/BoardToolbar.vue'

const KEY = 'gh-gantt:settings'

/** Answers every load with an empty page, or fails for a repo named "nope". */
class FakeSource implements IssueSource {
  calls: RepoRef[] = []

  async fetchPage(repo: RepoRef): Promise<IssuePage> {
    this.calls.push(repo)
    if (repo.name === 'nope') throw new Error('Repository acme/nope was not found, or the token cannot see it.')
    return { tasks: [], endCursor: null, hasNextPage: false, totalCount: 0, issueTypes: ['Feature', 'Task'] }
  }
}

let source: FakeSource

function mountToolbar() {
  const board = useBoardStore()
  board.useSource(source)
  return { wrapper: mount(BoardToolbar, { attachTo: document.body }), board }
}

const panel = (wrapper: ReturnType<typeof mountToolbar>['wrapper']) => wrapper.get('#board-source-panel')
const isOpen = (wrapper: ReturnType<typeof mountToolbar>['wrapper']) =>
  wrapper.get('button[aria-controls="board-source-panel"]').attributes('aria-expanded') === 'true'

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  source = new FakeSource()
})

describe('BoardToolbar', () => {
  it('starts open, asking for a repository, when none has been chosen', () => {
    const { wrapper } = mountToolbar()

    expect(isOpen(wrapper)).toBe(true)
    expect(wrapper.get('button[aria-controls="board-source-panel"]').text()).toContain('Choose repository')
    expect(panel(wrapper).attributes('inert')).toBeUndefined()
    wrapper.unmount()
  })

  it('loads the saved repository on mount, starts closed, and shows what is charted', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ lastOwner: 'acme', lastRepo: 'widgets', issueType: 'Feature' }))
    const { wrapper } = mountToolbar()
    await flushPromises()

    expect(source.calls).toEqual([{ owner: 'acme', name: 'widgets', issueType: 'Feature' }])
    expect(isOpen(wrapper)).toBe(false)
    expect(wrapper.get('button[aria-controls="board-source-panel"]').text()).toMatch(/acme\/widgets\s*·\s*Feature/)
    // Closed means unreachable by Tab.
    expect(panel(wrapper).attributes('inert')).toBeDefined()
    wrapper.unmount()
  })

  it('refreshes what is charted, not what is typed in the form', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ lastOwner: 'acme', lastRepo: 'widgets', issueType: 'Feature' }))
    const { wrapper } = mountToolbar()
    await flushPromises()

    await wrapper.get('#repo').setValue('other')
    await wrapper.get('button[aria-label="Refresh"]').trigger('click')
    await flushPromises()

    expect(source.calls).toEqual([
      { owner: 'acme', name: 'widgets', issueType: 'Feature' },
      { owner: 'acme', name: 'widgets', issueType: 'Feature' },
    ])
    wrapper.unmount()
  })

  it('shows no refresh button until something is charted', () => {
    const { wrapper } = mountToolbar()

    expect(wrapper.find('button[aria-label="Refresh"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('toggles from the button', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ lastOwner: 'acme', lastRepo: 'widgets' }))
    const { wrapper } = mountToolbar()
    await flushPromises()

    await wrapper.get('button[aria-controls="board-source-panel"]').trigger('click')
    expect(isOpen(wrapper)).toBe(true)
    await wrapper.get('button[aria-controls="board-source-panel"]').trigger('click')
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('loads from the form, saves the choice, and closes', async () => {
    const { wrapper } = mountToolbar()

    await wrapper.get('#owner').setValue('acme')
    await wrapper.get('#repo').setValue('widgets')
    await wrapper.get('#issue-type').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(source.calls).toEqual([{ owner: 'acme', name: 'widgets', issueType: null }])
    expect(isOpen(wrapper)).toBe(false)
    expect(wrapper.get('button[aria-controls="board-source-panel"]').text()).toMatch(/acme\/widgets\s*·\s*All types/)
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toMatchObject({ lastOwner: 'acme', lastRepo: 'widgets', issueType: '' })
    wrapper.unmount()
  })

  it('stays open when the load fails, so the fields can be fixed', async () => {
    const { wrapper, board } = mountToolbar()

    await wrapper.get('#owner').setValue('acme')
    await wrapper.get('#repo').setValue('nope')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(board.error).toContain('not found')
    expect(isOpen(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('closes on Esc from inside the panel', async () => {
    const { wrapper } = mountToolbar()

    await wrapper.get('#owner').trigger('keydown', { key: 'Escape' })

    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })
})
