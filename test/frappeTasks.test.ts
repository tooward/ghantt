import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/Task'
import { toFrappeTasks } from '../src/ui/components/frappeTasks'

const task: Task = {
  id: 'I_kwDOA_jtLc5upYqd',
  number: 341,
  title: 'Add TypeScript support',
  url: 'https://github.com/frappe/gantt/issues/341',
  // Local midnight: toISOString() would report 4 January east of UTC.
  start: new Date(2026, 0, 5),
  due: new Date(2026, 0, 9),
  dependsOn: ['MDU6SXNzdWUyMjY3MTA2OTU='],
  warnings: [],
}

describe('toFrappeTasks', () => {
  it('maps domain field names onto frappe field names', () => {
    const [mapped] = toFrappeTasks([task])

    expect(mapped).toEqual({
      id: 'I_kwDOA_jtLc5upYqd',
      name: '#341 Add TypeScript support',
      start: '2026-01-05',
      end: '2026-01-09',
      progress: 0,
      dependencies: ['MDU6SXNzdWUyMjY3MTA2OTU='],
    })
  })

  it('formats dates in local time', () => {
    const [mapped] = toFrappeTasks([task])

    expect(mapped.start).toBe('2026-01-05')
  })

  it('passes dependencies as an array, not a comma-separated string', () => {
    const [mapped] = toFrappeTasks([{ ...task, dependsOn: ['a', 'b'] }])

    expect(Array.isArray(mapped.dependencies)).toBe(true)
    expect(mapped.dependencies).toEqual(['a', 'b'])
  })

  // The library mutates what it is handed, so the copies must be deep enough
  // that nothing it writes can reach the store.
  it('returns fresh objects that share no array with the input', () => {
    const input = [task]
    const [mapped] = toFrappeTasks(input)

    mapped.dependencies.push('injected')
    Object.assign(mapped, { _start: 'mutated', id: 'rewritten' })

    expect(input[0].dependsOn).toEqual(['MDU6SXNzdWUyMjY3MTA2OTU='])
    expect(input[0].id).toBe('I_kwDOA_jtLc5upYqd')
    expect(input[0]).not.toHaveProperty('_start')
  })

  it('handles an empty list', () => {
    expect(toFrappeTasks([])).toEqual([])
  })
})
