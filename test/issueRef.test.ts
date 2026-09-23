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

import { describe, expect, it } from 'vitest'
import { formatIssueRef, parseIssueRef } from '../src/app/issueRef'

const current = { owner: 'shieldedtech', name: 'product' }

describe('parseIssueRef', () => {
  it.each([
    ['#123', { owner: 'shieldedtech', name: 'product', number: 123 }],
    ['123', { owner: 'shieldedtech', name: 'product', number: 123 }],
    ['  #7 ', { owner: 'shieldedtech', name: 'product', number: 7 }],
    ['acme/api#9', { owner: 'acme', name: 'api', number: 9 }],
    ['https://github.com/acme/api/issues/9', { owner: 'acme', name: 'api', number: 9 }],
    ['github.com/acme/api.js/issues/9#issuecomment-1', { owner: 'acme', name: 'api.js', number: 9 }],
    ['HTTPS://GitHub.com/acme/api/issues/9?x=1', { owner: 'acme', name: 'api', number: 9 }],
  ])('reads %p', (text, expected) => {
    expect(parseIssueRef(text, current)).toEqual(expected)
  })

  it.each(['', 'Build the thing', '#12a', 'https://github.com/acme/api/pull/9', 'https://gitlab.com/acme/api/issues/9'])(
    'is null for %p',
    (text) => {
      expect(parseIssueRef(text, current)).toBeNull()
    },
  )

  it('needs a current repository for a bare number', () => {
    expect(parseIssueRef('#12', null)).toBeNull()
    expect(parseIssueRef('acme/api#12', null)).toEqual({ owner: 'acme', name: 'api', number: 12 })
  })
})

describe('formatIssueRef', () => {
  it('is short in the current repository, qualified elsewhere', () => {
    expect(formatIssueRef({ owner: 'ShieldedTech', name: 'Product', number: 5 }, current)).toBe('#5')
    expect(formatIssueRef({ owner: 'acme', name: 'api', number: 5 }, current)).toBe('acme/api#5')
  })
})
