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
import { describe, expect, it } from 'vitest'
import type { Task, TaskId } from '../src/domain/Task'
import { detectAndBreakCycles, pruneDanglingEdges } from '../src/domain/TaskGraph'
import GanttChart from '../src/ui/components/GanttChart.vue'
import { WARNED_BAR_CLASS } from '../src/ui/components/frappeTasks'

function task(id: TaskId, dependsOn: TaskId[] = [], warnings: string[] = []): Task {
  return {
    id,
    number: 1,
    title: `Issue ${id}`,
    url: `https://github.com/o/r/issues/${id}`,
    start: new Date(2026, 0, 5),
    due: new Date(2026, 0, 9),
    dependsOn,
    warnings,
  }
}

/** What the board store's derived graph does, in the same order. */
function renderable(tasks: Task[]): Task[] {
  return detectAndBreakCycles(pruneDanglingEdges(tasks).tasks).tasks
}

async function mountChart(tasks: Task[]) {
  const wrapper = mount(GanttChart, { props: { tasks, viewMode: 'Week' as const } })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('dependency rendering', () => {
  it('draws one arrow per surviving edge', async () => {
    const wrapper = await mountChart(renderable([task('a'), task('b', ['a']), task('c', ['b'])]))

    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(2)
  })

  // B must finish before A can start, so the arrow runs from the blocker to
  // the blocked issue. Drawn the other way it looks plausible and is wrong.
  it('points the arrow from the blocker to the blocked issue', async () => {
    // "a blocks b": b.dependsOn = [a].
    const wrapper = await mountChart(renderable([task('a'), task('b', ['a'])]))

    const arrow = wrapper.element.querySelector('.arrow path')
    expect(arrow?.getAttribute('data-from')).toBe('a')
    expect(arrow?.getAttribute('data-to')).toBe('b')
  })

  // The single most likely source of bugs per ARCHITECTURE.md §5.4: blockedBy
  // routinely names closed issues and issues in other repositories.
  it('draws no arrow for an edge pointing outside the loaded set, and does not crash', async () => {
    const pruned = pruneDanglingEdges([task('a', ['closed-issue'])])
    expect(pruned.dropped).toBe(1)

    const wrapper = await mountChart(pruned.tasks)

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(1)
    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(0)
  })

  it('resolves a previously dangling edge into an arrow once its target loads', async () => {
    const wrapper = await mountChart(renderable([task('b', ['a'])]))
    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(0)

    // Page two arrives carrying the target.
    await wrapper.setProps({ tasks: renderable([task('b', ['a']), task('a')]) })
    await wrapper.vm.$nextTick()

    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(1)
  })

  // Must complete rather than hang: an unbroken cycle recurses forever.
  it('renders a cyclic task set after the cycle is broken', async () => {
    const wrapper = await mountChart(renderable([task('a', ['b']), task('b', ['a'])]))

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(2)
    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(1)
  })

  it('renders a three-node cycle', async () => {
    const wrapper = await mountChart(renderable([task('a', ['c']), task('b', ['a']), task('c', ['b'])]))

    expect(wrapper.element.querySelectorAll('.bar-wrapper')).toHaveLength(3)
    expect(wrapper.element.querySelectorAll('.arrow path')).toHaveLength(2)
  })
})

describe('warning indicators', () => {
  it('marks a warned task bar and gives it a tooltip', async () => {
    const wrapper = await mountChart([task('a', [], ['Ignored the start date field: "soon" is not a valid date.'])])

    const bar = wrapper.element.querySelector(`.${WARNED_BAR_CLASS}`)
    expect(bar).not.toBeNull()
    expect(bar?.querySelector('title')?.textContent).toContain('not a valid date')
  })

  it('leaves unwarned bars unmarked', async () => {
    const wrapper = await mountChart([task('a')])

    expect(wrapper.element.querySelector(`.${WARNED_BAR_CLASS}`)).toBeNull()
  })
})
