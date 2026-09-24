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
import { fitLabel } from '../src/ui/components/barLabels'

/** Seven pixels a character, near enough to 13px Helvetica for these checks. */
const measure = (text: string) => text.length * 7

describe('fitLabel', () => {
  it('keeps a label that fits', () => {
    expect(fitLabel('#12 Short', 100, measure)).toBe('#12 Short')
  })

  it('cuts a long label to the longest start that fits, with an ellipsis', () => {
    const fitted = fitLabel('#173 Serialization format', 70, measure)

    expect(fitted).toBe('#173 Seri…')
    expect(measure(fitted)).toBeLessThanOrEqual(70)
  })

  it('does not leave a space before the ellipsis', () => {
    expect(fitLabel('#173 Serialization', 42, measure)).toBe('#173…')
  })

  it('is empty when not even the ellipsis fits', () => {
    expect(fitLabel('#1 Anything', 5, measure)).toBe('')
  })
})
