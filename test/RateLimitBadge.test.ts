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
import type { RateLimitInfo } from '../src/adapters/github/GitHubClient'
import RateLimitBadge from '../src/ui/components/RateLimitBadge.vue'

function badge(rateLimit: RateLimitInfo | null) {
  return mount(RateLimitBadge, { props: { rateLimit } })
}

const at = (remaining: number, limit?: number): RateLimitInfo => ({
  cost: 1,
  remaining,
  resetAt: '2026-09-23T17:27:02Z',
  ...(limit === undefined ? {} : { limit }),
})

const fill = (wrapper: ReturnType<typeof badge>) => wrapper.get('[data-testid="battery-fill"]')

describe('RateLimitBadge', () => {
  it('renders nothing before GitHub has reported a budget', () => {
    expect(badge(null).html()).toBe('<!--v-if-->')
  })

  it('fills in proportion to the points left', () => {
    const full = Number(fill(badge(at(5000, 5000))).attributes('width'))
    const half = Number(fill(badge(at(2500, 5000))).attributes('width'))

    expect(full).toBe(18)
    expect(half).toBe(9)
  })

  it('uses the limit GitHub reports rather than assuming 5,000', () => {
    expect(Number(fill(badge(at(5000, 10000))).attributes('width'))).toBe(9)
  })

  it('assumes 5,000 when the response carries no limit', () => {
    expect(Number(fill(badge(at(2500))).attributes('width'))).toBe(9)
  })

  it('turns amber when low and red when nearly empty, showing the percentage', () => {
    const ok = badge(at(4000, 5000))
    const low = badge(at(1000, 5000))
    const critical = badge(at(100, 5000))

    expect(fill(ok).attributes('fill')).toBe('#16a34a')
    expect(ok.get('button').text()).toBe('')
    expect(fill(low).attributes('fill')).toBe('#d97706')
    expect(low.get('button').text()).toBe('20%')
    expect(fill(critical).attributes('fill')).toBe('#dc2626')
    expect(critical.get('button').text()).toBe('2%')
  })

  it('draws a sliver for almost nothing, and no fill for nothing', () => {
    expect(Number(fill(badge(at(1, 5000))).attributes('width'))).toBe(1)
    expect(Number(fill(badge(at(0, 5000))).attributes('width'))).toBe(0)
  })

  it('shows the points left and links to GitHub docs in the card', () => {
    const wrapper = badge(at(4883, 5000))
    const card = wrapper.get('#rate-limit-card')

    expect(card.text()).toContain('4,883 of 5,000 API points left')
    expect(card.get('a').attributes('href')).toBe(
      'https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api',
    )
    expect(wrapper.get('button').attributes('aria-label')).toContain('4,883 of 5,000')
  })

  it('pins the card open on click, for touch screens', async () => {
    const wrapper = badge(at(4883, 5000))
    expect(wrapper.get('#rate-limit-card').classes()).toContain('hidden')

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('#rate-limit-card').classes()).toContain('block')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })
})
