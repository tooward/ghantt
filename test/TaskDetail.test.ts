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
  effortDays: null,
  dateSources: { start: 'field', due: 'field' },
  canSetFields: true,
  warnings: [],
  milestone: null,
  isRelease: false,
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
    expect(text).toContain('54 working days')
    expect(text).toContain('M')
    wrapper.unmount()
  })

  it('shows the milestone, and says a release issue is drawn as its diamond', () => {
    const milestone = { id: 'M1', title: 'v1.0', dueOn: new Date(2026, 9, 9) }

    expect(mountDetail({ milestone }).text()).toContain('v1.0 (due Fri 9 Oct 2026)')
    expect(mountDetail({ milestone, isRelease: true }).text()).toContain('Release issue: drawn as the milestone’s diamond.')
    expect(mountDetail().text()).not.toContain('Milestone')
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
      expect(wrapper.text()).toContain('66 working days')
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

  describe('linking an issue that is not loaded', () => {
    const self: Task = { ...task, dependsOn: [], blockers: [], blocking: [] }
    const board = () => [self, other('B', 170)]
    /** Every fetch made, so a test can prove typing alone makes none. */
    let fetches: number[] = []
    // Stands in for the store: "#n" names issue n in this repository.
    const findIssue = (pool: Map<number, Task>) => vi.fn((text: string) => {
      const match = /^#?(\d+)$/.exec(text.trim())
      if (!match) return null
      const number = Number(match[1])
      return {
        label: `#${number}`,
        run: async () => {
          fetches.push(number)
          return pool.get(number) ?? `There is no issue #${number}.`
        },
      }
    })

    function mountLookup(pool: Map<number, Task>, link = vi.fn(async () => null)) {
      fetches = []
      const find = findIssue(pool)
      const wrapper = mount(TaskDetail, {
        props: { task: self, tasks: board(), link, unlink: vi.fn(), findIssue: find },
        attachTo: document.body,
      })
      return { wrapper, link, find }
    }

    async function type(wrapper: ReturnType<typeof mountLookup>['wrapper'], text: string) {
      await wrapper.findAll('button').find((b) => b.text() === '+ Add blocker')!.trigger('click')
      const input = wrapper.get('input[aria-label="Add blocker"]')
      await input.setValue(text)
      return input
    }

    const options = (wrapper: ReturnType<typeof mountLookup>['wrapper']) =>
      wrapper.findAll('[role="option"]').map((o) => o.text())

    it('offers a lookup for a number that is not loaded, and none for one that is', async () => {
      const { wrapper } = mountLookup(new Map())

      const input = await type(wrapper, '#999')
      expect(options(wrapper).at(-1)).toContain('Look up #999')

      await input.setValue('#170')
      expect(options(wrapper)).toEqual(['#170 Issue 170'])
      wrapper.unmount()
    })

    it('fetches on request, shows what it found, and links only when that is picked', async () => {
      const { wrapper, link } = mountLookup(new Map([[999, other('Z', 999)]]))
      const input = await type(wrapper, '#999')

      // Typing alone never fetches; choosing the lookup fetches once.
      expect(fetches).toEqual([])
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(fetches).toEqual([999])

      expect(link).not.toHaveBeenCalled()
      expect(options(wrapper)[0]).toContain('#999 Issue 999')
      expect(options(wrapper)[0]).toContain('not on the chart')

      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(link).toHaveBeenCalledWith('A', 'Z')
      wrapper.unmount()
    })

    it('shows the error when there is no such issue', async () => {
      const { wrapper, link } = mountLookup(new Map())
      const input = await type(wrapper, '#404')

      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toBe('There is no issue #404.')
      expect(link).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('flags a found issue that would loop', async () => {
      // Y is not loaded, and already waits on this issue.
      const { wrapper, link } = mountLookup(new Map([[500, other('Y', 500, ['A'])]]))
      const input = await type(wrapper, '#500')

      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(options(wrapper)[0]).toContain('already waits on this issue')

      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(link).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('Days', () => {
    // Thu 1 Oct – Mon 5 Oct is three working days (independently worked out).
    const shortTask: Task = {
      ...task,
      start: new Date(2026, 9, 1),
      due: new Date(2026, 9, 5),
      effortDays: 2,
      blockers: [],
      blocking: [],
    }
    const editable = { start: null, due: null, effort: null }

    function mountDays(save = vi.fn(async () => null), overrides: Partial<Task> = {}) {
      const wrapper = mount(TaskDetail, {
        props: { task: { ...shortTask, ...overrides }, tasks: [shortTask], editability: editable, save },
        attachTo: document.body,
      })
      return { wrapper, save }
    }

    const saveButton = (wrapper: ReturnType<typeof mountDays>['wrapper']) =>
      wrapper.findAll('button').find((b) => ['Save', 'Save anyway', 'Saving…'].includes(b.text()))!

    it('shows Length in working days, counting both ends, and Days in its box', () => {
      const { wrapper } = mountDays()

      expect(wrapper.text()).toContain('3 working days')
      expect((wrapper.get('#detail-days').element as HTMLInputElement).value).toBe('2')
      wrapper.unmount()
    })

    it('sends only a changed Days, as a number', async () => {
      const { wrapper, save } = mountDays()

      await wrapper.get('#detail-days').setValue('2.5')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(save).toHaveBeenCalledWith({ effort: 2.5 })
      wrapper.unmount()
    })

    it('clears Days when the box is emptied', async () => {
      const { wrapper, save } = mountDays()

      await wrapper.get('#detail-days').setValue('')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(save).toHaveBeenCalledWith({ effort: null })
      wrapper.unmount()
    })

    it('warns, and offers Save anyway, when the dates are shorter than Days', async () => {
      const { wrapper, save } = mountDays()

      await wrapper.get('#detail-days').setValue('5')

      expect(wrapper.get('[role="status"]').text()).toContain('Start–End gives 3 working days; Days is set to 5.')
      expect(saveButton(wrapper).text()).toBe('Save anyway')
      expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()

      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(save).toHaveBeenCalledWith({ effort: 5 })
      wrapper.unmount()
    })

    it('warns when shortening the End below Days', async () => {
      const { wrapper } = mountDays()

      // Thu 1 – Thu 1 is one working day; Days is two.
      await wrapper.get('#detail-due').setValue('2026-10-01')

      expect(wrapper.text()).toContain('Start–End gives 1 working day; Days is set to 2.')
      expect(saveButton(wrapper).text()).toBe('Save anyway')
      wrapper.unmount()
    })

    it('Set End from Days fills the End box from Start + Days, and waits for Save', async () => {
      const { wrapper, save } = mountDays()

      await wrapper.get('#detail-days').setValue('10')
      const button = wrapper.findAll('button').find((b) => b.text().startsWith('Set End from Days'))!
      // Thu 1 Oct plus ten working days ends Wed 14 Oct.
      expect(button.text()).toContain('Wed 14 Oct 2026')
      await button.trigger('click')

      expect((wrapper.get('#detail-due').element as HTMLInputElement).value).toBe('2026-10-14')
      expect(save).not.toHaveBeenCalled()
      expect(saveButton(wrapper).text()).toBe('Save')
      wrapper.unmount()
    })

    it('hides Set End from Days when the End already matches', async () => {
      // Thu 1 Oct plus three working days is Mon 5 Oct: already the End.
      const { wrapper } = mountDays(undefined, { effortDays: 3 })

      expect(wrapper.findAll('button').some((b) => b.text().startsWith('Set End from Days'))).toBe(false)
      wrapper.unmount()
    })

    it('refuses a Days that is not above zero', async () => {
      const { wrapper, save } = mountDays()

      await wrapper.get('#detail-days').setValue('0')

      expect(wrapper.text()).toContain('Days must be a number above zero.')
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      expect(save).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('shows a single-select Days as text, with the reason, and no box', () => {
      const wrapper = mount(TaskDetail, {
        props: {
          task: { ...shortTask, effort: 'M', effortDays: null },
          tasks: [shortTask],
          editability: { start: null, due: null, effort: '“Days” is a single-select field here; editing needs a number field.' },
          save: vi.fn(),
        },
      })

      expect(wrapper.find('#detail-days').exists()).toBe(false)
      expect(wrapper.text()).toContain('M')
      expect(wrapper.text()).toContain('single-select field here')
    })

    it('says where a date came from while it is unchanged', async () => {
      const { wrapper } = mountDays(undefined, { dateSources: { start: 'field', due: 'effort' } })

      expect(wrapper.text()).toContain('(from Days)')
      await wrapper.get('#detail-due').setValue('2026-10-09')
      expect(wrapper.text()).not.toContain('(from Days)')
      wrapper.unmount()
    })

    it('keeps an unsaved Days when a link change hands back a new task', async () => {
      const { wrapper } = mountDays()

      await wrapper.get('#detail-days').setValue('4')
      await wrapper.setProps({ task: { ...shortTask, blockers: [] } })

      expect((wrapper.get('#detail-days').element as HTMLInputElement).value).toBe('4')
      wrapper.unmount()
    })

    const button = (wrapper: ReturnType<typeof mountDays>['wrapper'], label: string) =>
      wrapper.findAll('button').find((b) => b.text().startsWith(label))

    it('warns when the dates are longer than Days, as soon as it opens', () => {
      const { wrapper } = mountDays()

      expect(wrapper.get('[role="status"]').text()).toContain('Start–End gives 3 working days; Days is set to 2.')
      wrapper.unmount()
    })

    it('offers nothing when the dates and Days agree, counting a part day as whole', () => {
      const { wrapper } = mountDays(undefined, { effortDays: 2.5 })

      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      for (const label of ['Set Days', 'Set End', 'Set Start']) expect(button(wrapper, label)).toBeUndefined()
      wrapper.unmount()
    })

    it('offers nothing when a weekend Start still gives the same working days', () => {
      // Sat 3 – Mon 5 Oct is one working day, and Days is one.
      const { wrapper } = mountDays(undefined, { start: new Date(2026, 9, 3), effortDays: 1 })

      for (const label of ['Set Days', 'Set End', 'Set Start']) expect(button(wrapper, label)).toBeUndefined()
      wrapper.unmount()
    })

    it('Set Days from Start–End fills the Days box, and waits for Save', async () => {
      const { wrapper, save } = mountDays()

      await button(wrapper, 'Set Days from Start–End (3)')!.trigger('click')

      expect((wrapper.get('#detail-days').element as HTMLInputElement).value).toBe('3')
      expect(save).not.toHaveBeenCalled()
      expect(saveButton(wrapper).text()).toBe('Save')
      expect(button(wrapper, 'Set Days')).toBeUndefined()
      wrapper.unmount()
    })

    it('Set Start from Days fills the Start box from End − Days, and waits for Save', async () => {
      const { wrapper, save } = mountDays()

      // Two working days ending Mon 5 Oct start Fri 2 Oct.
      const offer = button(wrapper, 'Set Start from Days')!
      expect(offer.text()).toContain('Fri 2 Oct 2026')
      await offer.trigger('click')

      expect((wrapper.get('#detail-start').element as HTMLInputElement).value).toBe('2026-10-02')
      expect(save).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('offers each adjustment again after any of the three changes', async () => {
      const { wrapper } = mountDays(undefined, { effortDays: 3 })
      expect(button(wrapper, 'Set Days')).toBeUndefined()

      await wrapper.get('#detail-start').setValue('2026-10-02')

      expect(button(wrapper, 'Set Days from Start–End (2)')).toBeDefined()
      expect(button(wrapper, 'Set End from Days')).toBeDefined()
      expect(button(wrapper, 'Set Start from Days')).toBeDefined()
      wrapper.unmount()
    })

    describe('filled in on opening', () => {
      const empty: Partial<Task> = { effort: null, effortDays: null }

      it('saves Days from Start–End once, and says so', async () => {
        const { wrapper, save } = mountDays(undefined, empty)
        await flushPromises()

        expect(save).toHaveBeenCalledOnce()
        expect(save).toHaveBeenCalledWith({ effort: 3 })
        expect(wrapper.text()).toContain('Days set to 3 from Start–End and saved to GitHub.')

        // GitHub hands back the issue with Days set; nothing more is written.
        await wrapper.setProps({ task: { ...shortTask, effort: '3', effortDays: 3 } })
        await flushPromises()
        expect(save).toHaveBeenCalledOnce()
        expect((wrapper.get('#detail-days').element as HTMLInputElement).value).toBe('3')
        wrapper.unmount()
      })

      it.each<[string, Partial<Task>]>([
        ['a date not from a field', { dateSources: { start: 'field', due: 'milestone' } }],
        ['Days already set', { effort: '2', effortDays: 2 }],
        ['a stored Days of 0', { effort: '0', effortDays: null }],
        ['no permission to set fields', { canSetFields: false }],
      ])('does not save with %s', async (_, overrides) => {
        const { wrapper, save } = mountDays(undefined, { ...empty, ...overrides })
        await flushPromises()

        expect(save).not.toHaveBeenCalled()
        wrapper.unmount()
      })

      it('does not save when Days cannot be edited', async () => {
        const save = vi.fn(async () => null)
        const wrapper = mount(TaskDetail, {
          props: {
            task: { ...shortTask, ...empty },
            tasks: [shortTask],
            editability: { ...editable, effort: 'This repository has no field named “Days”.' },
            save,
          },
        })
        await flushPromises()

        expect(save).not.toHaveBeenCalled()
        wrapper.unmount()
      })

      it('waits for the field lookup before saving', async () => {
        const save = vi.fn(async () => null)
        const wrapper = mount(TaskDetail, {
          props: { task: { ...shortTask, ...empty }, tasks: [shortTask], editability: { start: null, due: null }, save },
        })
        await flushPromises()
        expect(save).not.toHaveBeenCalled()

        await wrapper.setProps({ editability: editable })
        await flushPromises()
        expect(save).toHaveBeenCalledWith({ effort: 3 })
        wrapper.unmount()
      })

      it('does not refill Days the user has just cleared', async () => {
        const { wrapper, save } = mountDays()

        await wrapper.get('#detail-days').setValue('')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        await wrapper.setProps({ task: { ...shortTask, ...empty } })
        await flushPromises()

        expect(save).toHaveBeenCalledOnce()
        expect(save).toHaveBeenCalledWith({ effort: null })
        wrapper.unmount()
      })

      it('offers Days, rather than writing it, once the user saves a first End', async () => {
        const { wrapper, save } = mountDays(undefined, { ...empty, dateSources: { start: 'field', due: 'milestone' } })

        await wrapper.get('#detail-due').setValue('2026-10-06')
        await wrapper.get('form').trigger('submit')
        await flushPromises()
        await wrapper.setProps({ task: { ...shortTask, ...empty, due: new Date(2026, 9, 6) } })
        await flushPromises()

        expect(save).toHaveBeenCalledOnce()
        expect(save).toHaveBeenCalledWith({ due: '2026-10-06' })
        expect(button(wrapper, 'Set Days from Start–End (4)')).toBeDefined()
        wrapper.unmount()
      })

      it('reports a failed save quietly and does not retry', async () => {
        const save = vi.fn(async () => 'GitHub said no.')
        const { wrapper } = mountDays(save, empty)
        await flushPromises()

        expect(wrapper.text()).toContain('Could not fill in Days from Start–End: GitHub said no.')
        await wrapper.setProps({ task: { ...shortTask, ...empty, title: 'Renamed' } })
        await flushPromises()
        expect(save).toHaveBeenCalledOnce()
        wrapper.unmount()
      })

      it('keeps what the user types while the save is on its way', async () => {
        let finish: (value: null) => void = () => {}
        const save = vi.fn(() => new Promise<null>((resolve) => { finish = resolve }))
        const { wrapper } = mountDays(save, empty)

        await wrapper.get('#detail-days').setValue('4')
        finish(null)
        await wrapper.setProps({ task: { ...shortTask, effort: '3', effortDays: 3 } })

        expect((wrapper.get('#detail-days').element as HTMLInputElement).value).toBe('4')
        wrapper.unmount()
      })
    })
  })
})
