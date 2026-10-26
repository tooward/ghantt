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
import { LABEL_INSET, placeLabel } from '../src/ui/components/barLabels'

const bar = { x: 100, width: 80 }

describe('placeLabel', () => {
  it('centres a label that fits inside its bar', () => {
    expect(placeLabel(bar, 40)).toEqual({ x: 120, spills: false })
  })

  it('still fits with exactly the inset to spare at each end', () => {
    expect(placeLabel(bar, 80 - 2 * LABEL_INSET)).toEqual({ x: 100 + LABEL_INSET, spills: false })
  })

  it('spills a label that would crowd the ends, starting just past the bar', () => {
    expect(placeLabel(bar, 80 - 2 * LABEL_INSET + 1)).toEqual({ x: 180 + LABEL_INSET, spills: true })
  })

  it('spills from a bar too narrow for any text', () => {
    expect(placeLabel({ x: 0, width: 4 }, 0.5)).toEqual({ x: 4 + LABEL_INSET, spills: true })
  })
})
