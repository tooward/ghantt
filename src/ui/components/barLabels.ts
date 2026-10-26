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

import type { BarBox } from './arrowPaths'

/** Room left between a label and each end of its bar, or the bar's end and a label beside it. */
export const LABEL_INSET = 6

export interface LabelPlacement {
  /** The label's left edge. */
  x: number
  /** True when the label does not fit inside the bar and sits after it instead. */
  spills: boolean
}

/**
 * Where a label of `length` pixels goes: centred in its bar when it fits with
 * `LABEL_INSET` to spare at each end, otherwise in full just past the bar's
 * end. A label is never cut; the bar's tooltip carries the same text.
 */
export function placeLabel(bar: Pick<BarBox, 'x' | 'width'>, length: number): LabelPlacement {
  if (length <= bar.width - 2 * LABEL_INSET) return { x: bar.x + (bar.width - length) / 2, spills: false }
  return { x: bar.x + bar.width + LABEL_INSET, spills: true }
}
