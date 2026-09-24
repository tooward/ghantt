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
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task, TaskId } from '../src/domain/Task'
import GanttChart from '../src/ui/components/GanttChart.vue'

function task(id: TaskId, dependsOn: TaskId[] = []): Task {
  return {
    id,
    number: Number(id.slice(1)) || 1,
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id}`,
    start: new Date(2026, 0, 5),
    due: new Date(2026, 0, 9),
    dependsOn,
    blockers: [],
    blocking: [],
    effort: null,
    effortDays: null,
    dateSources: { start: 'field', due: 'field' },
    canSetFields: true,
    warnings: [],
  }
}

async function mountChart(tasks: Task[]) {
  const wrapper = mount(GanttChart, { props: { tasks, viewMode: 'Week' as const } })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('GanttChart', () => {
  it('renders a bar per task', async () => {
    const wrapper = await mountChart([task('a'), task('b', ['a'])])

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(2)
  })

  it('draws blank rows beneath the last bar, and keeps them as tasks are added', async () => {
    // frappe's row loop also draws a sliver of one more row; three whole ones are the point.
    const rows = (wrapper: Awaited<ReturnType<typeof mountChart>>) =>
      wrapper.element.querySelectorAll('.grid-row').length

    const wrapper = await mountChart([task('a'), task('b')])
    expect(rows(wrapper)).toBeGreaterThanOrEqual(2 + 3)

    await wrapper.setProps({ tasks: [task('a'), task('b'), task('c'), task('d')] })
    expect(rows(wrapper)).toBeGreaterThanOrEqual(4 + 3)
    expect(rows(wrapper)).toBeLessThanOrEqual(4 + 4)
  })

  describe('labels', () => {
    const proto = SVGElement.prototype as SVGElement & { getComputedTextLength: () => number }
    const original = proto.getComputedTextLength
    afterEach(() => {
      proto.getComputedTextLength = original
    })

    const labelOf = (wrapper: Awaited<ReturnType<typeof mountChart>>, id: string) =>
      wrapper.element.querySelector(`.bar-wrapper[data-id="${id}"] .bar-label`)!.textContent
    const tooltipOf = (wrapper: Awaited<ReturnType<typeof mountChart>>, id: string) =>
      wrapper.element.querySelector(`.bar-wrapper[data-id="${id}"] > title`)?.textContent

    it('cuts a label that is wider than its bar, and puts the full name in the tooltip', async () => {
      // Far wider than any bar, so every label must be cut.
      proto.getComputedTextLength = function (this: SVGElement) {
        return (this.textContent ?? '').length * 1000
      }
      const wrapper = await mountChart([{ ...task('a'), title: 'A rather long issue title' }])

      expect(labelOf(wrapper, 'a')).toBe('')
      expect(tooltipOf(wrapper, 'a')).toBe('#1 A rather long issue title')
    })

    it('ends a cut label in an ellipsis inside the bar', async () => {
      proto.getComputedTextLength = function (this: SVGElement) {
        return (this.textContent ?? '').length * 7
      }
      const wrapper = await mountChart([{ ...task('a'), title: 'A rather long issue title that will not fit in a week' }])
      const width = Number(wrapper.element.querySelector('.bar-wrapper[data-id="a"] .bar')!.getAttribute('width'))

      const label = labelOf(wrapper, 'a')!
      expect(label.endsWith('…')).toBe(true)
      expect(label.length * 7).toBeLessThanOrEqual(width)
    })

    it('adds warnings to the tooltip after the name', async () => {
      const wrapper = await mountChart([{ ...task('a'), warnings: ['No usable date at all; the bar starts today.'] }])

      expect(tooltipOf(wrapper, 'a')).toBe('#1 Issue a\nNo usable date at all; the bar starts today.')
    })

    it('draws a title containing markup as plain text', async () => {
      const wrapper = await mountChart([{ ...task('a'), title: '<img src=x onerror="window.pwned=1">' }])

      expect(wrapper.element.querySelector('.bar-label img, .bar-label image')).toBeNull()
      expect(tooltipOf(wrapper, 'a')).toBe('#1 <img src=x onerror="window.pwned=1">')
    })
  })

  it('draws an arrow for a dependency', async () => {
    const wrapper = await mountChart([task('a'), task('b', ['a'])])

    expect(wrapper.element.querySelectorAll('.arrow path').length).toBeGreaterThan(0)
  })

  // The trap from ARCHITECTURE.md §8: the library writes _start, _end, _index
  // onto the objects it is given, and rewrites their id and dependencies.
  it('never mutates the tasks it was given', async () => {
    const tasks = [task('a'), task('b', ['a'])]
    const before = structuredClone(tasks)

    await mountChart(tasks)

    expect(tasks).toEqual(before)
    for (const t of tasks) {
      expect(t).not.toHaveProperty('_start')
      expect(t).not.toHaveProperty('_end')
      expect(t).not.toHaveProperty('_index')
    }
  })

  it('shows an empty state and constructs nothing for zero tasks', async () => {
    const wrapper = await mountChart([])

    expect(wrapper.text()).toContain('Nothing to chart yet')
    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(0)
  })

  it('replaces the previous repository rather than leaving old bars behind', async () => {
    const wrapper = await mountChart([task('a'), task('b'), task('c')])
    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(3)

    await wrapper.setProps({ tasks: [task('z')] })
    await wrapper.vm.$nextTick()

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(1)
  })

  it('draws arrows from the blocker’s end to the blocked bar’s start', async () => {
    const wrapper = await mountChart([task('a'), task('b', ['a'])])
    const el = wrapper.element

    const barBox = (id: string) => {
      const bar = el.querySelector(`.bar-wrapper[data-id="${id}"] .bar`)!
      const n = (name: string) => Number(bar.getAttribute(name))
      return { x: n('x'), y: n('y'), width: n('width'), height: n('height') }
    }
    const from = barBox('a')
    const to = barBox('b')
    const d = el.querySelector('.arrow path[data-from="a"][data-to="b"]')!.getAttribute('d')!
    const [startX, startY] = d.match(/^M (-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number)

    expect(startX).toBeCloseTo(from.x + from.width, 0)
    expect(startY).toBeCloseTo(from.y + from.height / 2, 0)
    // The last point before the head sits just left of the blocked bar's start.
    const body = d.split(' m ')[0].trim().split(' ')
    expect(Number(body.at(-2))).toBeCloseTo(to.x - 2, 0)
    expect(Number(body.at(-1))).toBeCloseTo(to.y + to.height / 2, 0)
  })

  it('selects a task on click, and clears it on a second click, without opening GitHub', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)

    const wrapper = await mountChart([task('a')])
    const bar = () => wrapper.element.querySelector('.bar-wrapper')!
    bar().dispatchEvent(new Event('click', { bubbles: true }))

    expect(wrapper.emitted('select')).toEqual([['a']])
    expect(open).not.toHaveBeenCalled()

    await wrapper.setProps({ selectedId: 'a' })
    expect(bar().classList.contains('gh-gantt-selected')).toBe(true)

    bar().dispatchEvent(new Event('click', { bubbles: true }))
    expect(wrapper.emitted('select')?.[1]).toEqual([null])
    vi.unstubAllGlobals()
  })

  it('keeps the selected bar highlighted across a re-render', async () => {
    const wrapper = mount(GanttChart, { props: { tasks: [task('a'), task('b')], viewMode: 'Week' as const, selectedId: 'b' } })
    await wrapper.vm.$nextTick()

    await wrapper.setProps({ tasks: [task('a'), task('b'), task('c')] })

    const selected = wrapper.element.querySelectorAll('.gh-gantt-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0].getAttribute('data-id')).toBe('b')
  })

  it('re-renders on a view mode change', async () => {
    const wrapper = await mountChart([task('a')])

    await wrapper.setProps({ viewMode: 'Month' as const })
    await wrapper.vm.$nextTick()

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(1)
  })

  it('tears the instance down on unmount', async () => {
    const wrapper = await mountChart([task('a')])

    wrapper.unmount()

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(0)
  })
})
