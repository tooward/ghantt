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
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../src/domain/Task'
import TaskDetail, { type DateChanges } from '../src/ui/components/TaskDetail.vue'

const task: Task = {
  id: 'A',
  number: 173,
  title: 'Serialization format',
  url: 'https://github.com/acme/widgets/issues/173',
  start: new Date(2026, 9, 1),
  due: new Date(2026, 11, 15),
  dependsOn: ['B', 'C'],
  blockers: [
    { id: 'B', number: 170, title: 'Schema draft', closed: false, repository: null },
    { id: 'C', number: 9, title: 'Stable API', closed: false, repository: 'acme/api' },
    { id: 'D', number: 150, title: 'Old spike', closed: true, repository: null },
  ],
  blocking: [],
  effort: 'M',
  canSetFields: true,
  warnings: [],
}

/** A loaded neighbour, for the board's task list. */
const other = (id: string, number: number, dependsOn: string[] = []): Task => ({
  ...task,
  id,
  number,
  title: `Issue ${number}`,
  dependsOn,
  blockers: [],
  blocking: [],
})

function mountDetail(overrides: Partial<Task> = {}) {
  return mount(TaskDetail, {
    props: { task: { ...task, ...overrides }, tasks: [task, other('B', 170)] },
    attachTo: document.body,
  })
}

describe('TaskDetail', () => {
  it('shows start, end, duration and effort', () => {
    const wrapper = mountDetail()
    const text = wrapper.text()

    expect(text).toContain('Thu 1 Oct 2026')
    expect(text).toContain('Tue 15 Dec 2026')
    expect(text).toContain('75 days')
    expect(text).toContain('M')
    wrapper.unmount()
  })

  it('shows a dash when there is no effort', () => {
    const wrapper = mountDetail({ effort: null })

    expect(wrapper.find('dl').text()).toContain('—')
    wrapper.unmount()
  })

  it('lists every blocker, and selects the ones on the board', async () => {
    const wrapper = mountDetail()
    const items = wrapper.findAll('li').filter((li) => li.attributes('role') !== 'option')

    expect(items).toHaveLength(3)
    expect(items[1].text()).toContain('acme/api#9')
    expect(items[2].text()).toContain('closed')

    await items[0].get('button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['B']])
    // Not on the board: nothing to select.
    expect(items[1].find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes from the button and from Esc', async () => {
    const wrapper = mountDetail()

    await wrapper.get('button[aria-label="Close details"]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('stops listening for Esc once gone', () => {
    const wrapper = mountDetail()
    wrapper.unmount()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  describe('editing dates', () => {
    const editable = { start: null, due: null }

    function mountEditable(save: (changes: DateChanges) => Promise<string | null>, overrides: Partial<Task> = {}) {
      return mount(TaskDetail, {
        props: { task: { ...task, ...overrides }, tasks: [task], editability: editable, save },
        attachTo: document.body,
      })
    }

    const saveButton = (wrapper: ReturnType<typeof mountEditable>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Save' || b.text() === 'Saving…')!

    it('prefills the inputs with the current dates, and Save starts disabled', () => {
      const wrapper = mountEditable(vi.fn())

      expect((wrapper.get('#detail-start').element as HTMLInputElement).value).toBe('2026-10-01')
      expect((wrapper.get('#detail-due').element as HTMLInputElement).value).toBe('2026-12-15')
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('sends only the date that changed', async () => {
      const save = vi.fn(async () => null)
      const wrapper = mountEditable(save)

      await wrapper.get('#detail-due').setValue('2026-12-31')
      expect(wrapper.text()).toContain('91 days')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(save).toHaveBeenCalledWith({ due: '2026-12-31' })
      wrapper.unmount()
    })

    it('blocks saving an end before the start', async () => {
      const save = vi.fn(async () => null)
      const wrapper = mountEditable(save)

      await wrapper.get('#detail-due').setValue('2026-09-01')

      expect(wrapper.text()).toContain('End is before Start.')
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      expect(save).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('keeps the edits and shows the message when a save fails', async () => {
      const wrapper = mountEditable(async () => 'GitHub refused the change.')

      await wrapper.get('#detail-start').setValue('2026-10-05')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toBe('GitHub refused the change.')
      expect((wrapper.get('#detail-start').element as HTMLInputElement).value).toBe('2026-10-05')
      wrapper.unmount()
    })

    it('shows GitHub’s saved values once the task comes back', async () => {
      const wrapper = mountEditable(async () => null)

      await wrapper.get('#detail-start').setValue('2026-10-05')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await wrapper.setProps({ task: { ...task, start: new Date(2026, 9, 5) } })

      expect(wrapper.text()).toContain('Saved to GitHub.')
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('Revert puts the dates back', async () => {
      const wrapper = mountEditable(vi.fn())

      await wrapper.get('#detail-start').setValue('2026-10-05')
      await wrapper.findAll('button').find((b) => b.text() === 'Revert')!.trigger('click')

      expect((wrapper.get('#detail-start').element as HTMLInputElement).value).toBe('2026-10-01')
      wrapper.unmount()
    })

    it('does not close on Esc while there are unsaved edits', async () => {
      const wrapper = mountEditable(vi.fn())

      await wrapper.get('#detail-start').setValue('2026-10-05')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(wrapper.emitted('close')).toBeUndefined()
      wrapper.unmount()
    })

    it('shows plain dates and the reason when a date cannot be edited', () => {
      const wrapper = mount(TaskDetail, {
        props: {
          task,
          tasks: [task],
          editability: { start: 'This repository has no date field named “Start”.', due: null },
          save: vi.fn(),
        },
      })

      expect(wrapper.find('#detail-start').exists()).toBe(false)
      expect(wrapper.find('#detail-due').exists()).toBe(true)
      expect(wrapper.text()).toContain('no date field named “Start”')
    })

    it('offers no editing when the user cannot set fields on the issue', () => {
      const wrapper = mountEditable(vi.fn(), { canSetFields: false })

      expect(wrapper.find('input[type="date"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('You do not have permission to set fields on this issue.')
      wrapper.unmount()
    })
  })

  describe('blocking links', () => {
    // A (this issue) is blocked by B; C waits on A; D stands alone.
    const self: Task = {
      ...task,
      dependsOn: ['B'],
      blockers: [{ id: 'B', number: 170, title: 'Issue 170', closed: false, repository: null }],
      blocking: [{ id: 'C', number: 171, title: 'Issue 171', closed: false, repository: null }],
    }
    const board = () => [self, other('B', 170), other('C', 171, ['A']), other('D', 172)]

    function mountLinks(link = vi.fn(async () => null), unlink = vi.fn(async () => null)) {
      const wrapper = mount(TaskDetail, { props: { task: self, tasks: board(), link, unlink }, attachTo: document.body })
      return { wrapper, link, unlink }
    }

    const section = (wrapper: ReturnType<typeof mountLinks>['wrapper'], heading: string) =>
      wrapper.findAll('h3').find((h) => h.text() === heading)!.element.closest('div')!.parentElement!

    async function openPicker(wrapper: ReturnType<typeof mountLinks>['wrapper'], label: string) {
      await wrapper.findAll('button').find((b) => b.text() === `+ ${label}`)!.trigger('click')
      return wrapper.get(`input[aria-label="${label}"]`)
    }

    const optionTexts = (wrapper: ReturnType<typeof mountLinks>['wrapper']) =>
      wrapper.findAll('[role="option"]').map((o) => o.text())

    it('shows both directions', () => {
      const { wrapper } = mountLinks()

      expect(section(wrapper, 'Blocked by').textContent).toContain('#170')
      expect(section(wrapper, 'Blocks').textContent).toContain('#171')
      wrapper.unmount()
    })

    it('offers loaded issues, minus itself and existing blockers, and flags a loop', async () => {
      const { wrapper } = mountLinks()
      await openPicker(wrapper, 'Add blocker')

      const texts = optionTexts(wrapper)
      // Not A (itself) or B (already a blocker); C would loop, since C waits on A.
      expect(texts).toHaveLength(2)
      expect(texts[0]).toContain('#171')
      expect(texts[0]).toContain('already waits on this issue')
      expect(texts[1]).toBe('#172 Issue 172')
      wrapper.unmount()
    })

    it('filters by number or title and picks with the keyboard', async () => {
      const { wrapper, link } = mountLinks()
      const input = await openPicker(wrapper, 'Add blocker')

      await input.setValue('#172')
      expect(optionTexts(wrapper)).toEqual(['#172 Issue 172'])
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(link).toHaveBeenCalledWith('A', 'D')
      // The picker closes once the link is made.
      expect(wrapper.find('input[aria-label="Add blocker"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('will not pick an option that would loop', async () => {
      const { wrapper, link } = mountLinks()
      await openPicker(wrapper, 'Add blocker')

      await wrapper.findAll('[role="option"]')[0].trigger('mousedown')

      expect(link).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('adds in the Blocks direction the right way round', async () => {
      const { wrapper, link } = mountLinks()
      await openPicker(wrapper, 'Add blocked issue')

      // B already blocks A, so making A block B would loop.
      const texts = optionTexts(wrapper)
      expect(texts.find((t) => t.startsWith('#170'))).toContain('already blocks this issue')
      await wrapper.findAll('[role="option"]').find((o) => o.text().startsWith('#172'))!.trigger('mousedown')
      await flushPromises()

      // D is blocked by A.
      expect(link).toHaveBeenCalledWith('D', 'A')
      wrapper.unmount()
    })

    it('asks before removing, and removes only on Yes', async () => {
      const { wrapper, unlink } = mountLinks()

      await wrapper.get('button[aria-label="Remove #170"]').trigger('click')
      expect(wrapper.text()).toContain('Remove?')
      await wrapper.findAll('button').find((b) => b.text() === 'No')!.trigger('click')
      expect(unlink).not.toHaveBeenCalled()

      await wrapper.get('button[aria-label="Remove #170"]').trigger('click')
      await wrapper.findAll('button').find((b) => b.text() === 'Yes')!.trigger('click')
      await flushPromises()

      expect(unlink).toHaveBeenCalledWith('A', 'B')
      wrapper.unmount()
    })

    it('shows the error and keeps the picker open when linking fails', async () => {
      const { wrapper } = mountLinks(vi.fn(async () => 'GitHub refused the change.'))
      const input = await openPicker(wrapper, 'Add blocker')

      await input.setValue('172')
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toBe('GitHub refused the change.')
      expect(wrapper.find('input[aria-label="Add blocker"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('Esc in the picker closes the picker, not the panel', async () => {
      const { wrapper } = mountLinks()
      const input = await openPicker(wrapper, 'Add blocker')

      await input.trigger('keydown', { key: 'Escape' })

      expect(wrapper.find('input[aria-label="Add blocker"]').exists()).toBe(false)
      expect(wrapper.emitted('close')).toBeUndefined()
      wrapper.unmount()
    })

    it('offers no add or remove without a writer', () => {
      const wrapper = mount(TaskDetail, { props: { task: self, tasks: board() } })

      expect(wrapper.text()).not.toContain('+ Add blocker')
      expect(wrapper.find('button[aria-label="Remove #170"]').exists()).toBe(false)
    })

    it('keeps unsaved date edits when a link change hands back a new task', async () => {
      const wrapper = mount(TaskDetail, {
        props: { task: self, tasks: board(), editability: { start: null, due: null }, save: vi.fn() },
      })

      await wrapper.get('#detail-due').setValue('2026-12-31')
      await wrapper.setProps({ task: { ...self, blockers: [] } })

      expect((wrapper.get('#detail-due').element as HTMLInputElement).value).toBe('2026-12-31')
    })
  })
})
