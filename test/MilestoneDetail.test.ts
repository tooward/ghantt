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
import type { Milestone, Task } from '../src/domain/Task'
import MilestoneDetail from '../src/ui/components/MilestoneDetail.vue'

const v1: Milestone = {
  id: 'M1', title: 'v1.0', dueOn: new Date(2026, 9, 9), url: 'https://github.com/o/r/milestone/1',
  openIssueCount: 3, closedIssueCount: 1,
}

const row: Task = {
  id: 'milestone:M1',
  number: 0,
  title: 'v1.0',
  url: v1.url,
  start: v1.dueOn!,
  due: v1.dueOn!,
  dependsOn: [],
  blockers: [],
  blocking: [],
  effort: null,
  effortDays: null,
  dateSources: { start: 'milestone', due: 'milestone' },
  canSetFields: false,
  warnings: ['1 issue finishes after this milestone; the latest, #2, ends Tue 13 Oct 2026.'],
  milestone: v1,
  isRelease: false,
  marker: { milestone: v1, date: v1.dueOn!, synthetic: true },
}

describe('MilestoneDetail', () => {
  it('shows the due date, counts of every type, warnings and a link', () => {
    const wrapper = mount(MilestoneDetail, { props: { row } })

    expect(wrapper.text()).toContain('Fri 9 Oct 2026')
    expect(wrapper.text()).toContain('1 of 4 issues closed')
    expect(wrapper.text()).toContain('every type')
    expect(wrapper.text()).toContain('the latest, #2')
    expect(wrapper.get('a').attributes('href')).toBe(v1.url)
  })

  it('closes', async () => {
    const wrapper = mount(MilestoneDetail, { props: { row } })

    await wrapper.get('button[aria-label="Close details"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
