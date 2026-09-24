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

/** Room left between a label and each end of its bar. */
export const LABEL_INSET = 6

const ELLIPSIS = '…'

/**
 * The longest start of `text` that fits in `maxWidth`, ending in "…" when
 * anything was cut. Empty when not even "…" fits: the label must stay inside
 * its bar, and the bar's tooltip still has the full text. `measure` returns
 * a candidate's rendered width.
 */
export function fitLabel(text: string, maxWidth: number, measure: (candidate: string) => number): string {
  if (measure(text) <= maxWidth) return text
  if (measure(ELLIPSIS) > maxWidth) return ''

  // Binary search on the number of characters kept before the ellipsis.
  let low = 0
  let high = text.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidth) low = mid
    else high = mid - 1
  }
  return text.slice(0, low).trimEnd() + ELLIPSIS
}
