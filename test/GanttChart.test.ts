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

  it('opens the issue in a new tab when a bar is clicked', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)

    const wrapper = await mountChart([task('a')])
    wrapper.element.querySelector('.bar-wrapper')?.dispatchEvent(new Event('click', { bubbles: true }))

    expect(open).toHaveBeenCalledWith('https://github.com/o/r/issues/a', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
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
