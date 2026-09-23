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
import { describe, expect, it, vi } from 'vitest'
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
