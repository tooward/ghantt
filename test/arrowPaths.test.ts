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
import { finishToStartPath, intoDiamondPath, type BarBox } from '../src/ui/components/arrowPaths'

// Two rows, 30px bars, 18px apart: row 0 mid-height is 15, row 1 is 63.
const bar = (x: number, width: number, row: number): BarBox => ({ x, y: row * 48, width, height: 30 })

/** Every coordinate pair the path visits, head excluded. */
function points(d: string): Array<[number, number]> {
  const body = d.split(' m ')[0]
  const numbers = body.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const out: Array<[number, number]> = []
  for (let i = 0; i < numbers.length; i += 2) out.push([numbers[i], numbers[i + 1]])
  return out
}

describe('finishToStartPath', () => {
  it('starts at the blocker’s right end and ends at the blocked bar’s start, both mid-height', () => {
    const d = finishToStartPath(bar(0, 100, 0), bar(200, 50, 1))
    const visited = points(d)

    expect(visited[0]).toEqual([100, 15])
    expect(visited.at(-1)).toEqual([198, 63])
    expect(d.endsWith('m -5 -5 l 5 5 l -5 5')).toBe(true)
  })

  it('never goes left of the blocker’s end when there is room between the bars', () => {
    const visited = points(finishToStartPath(bar(0, 100, 0), bar(200, 50, 1)))

    expect(Math.min(...visited.map(([x]) => x))).toBe(100)
  })

  it('detours along the row gap when the blocked bar starts before the blocker ends', () => {
    const visited = points(finishToStartPath(bar(0, 100, 0), bar(40, 50, 1)))

    expect(visited[0]).toEqual([100, 15])
    expect(visited.at(-1)).toEqual([38, 63])
    // Runs back left along the gap between the rows (y = 15 + 15 + 9 = 39)…
    expect(visited.some(([x, y]) => y === 39 && x < 40)).toBe(true)
    // …and comes into the start from the left.
    expect(visited.at(-2)![0]).toBeLessThan(38)
  })

  it('routes upward when the blocked bar is on a higher row', () => {
    const visited = points(finishToStartPath(bar(0, 100, 1), bar(40, 50, 0)))

    expect(visited[0]).toEqual([100, 63])
    expect(visited.some(([, y]) => y === 39)).toBe(true)
    expect(visited.at(-1)).toEqual([38, 15])
  })

  it('keeps corners inside short legs', () => {
    // Bars just far enough apart for the direct route: the 12px legs cap the radius.
    const d = finishToStartPath(bar(0, 100, 0), bar(124, 50, 1), { rowGap: 18, stub: 12, radius: 50 })

    for (const [x] of points(d)) expect(x).toBeGreaterThanOrEqual(100)
  })
})

describe('intoDiamondPath', () => {
  // A diamond on row 1, centred at x = 300: its top point is at y = 48.
  const diamond: BarBox = { x: 285, y: 48, width: 30, height: 30 }

  it('runs along the bar’s row and down into the top point when the bar ends before it', () => {
    const d = intoDiamondPath(bar(0, 200, 0), diamond)

    const visited = points(d)

    expect(visited[0]).toEqual([200, 15])
    expect(visited.at(-1)).toEqual([300, 46])
    // Level along the row until the corner, then straight down.
    expect(visited.filter(([, y]) => y !== 15).every(([x]) => x === 300)).toBe(true)
    expect(d.endsWith('m -5 -5 l 5 5 l 5 -5')).toBe(true)
  })

  it('handles the common case: an issue ending on the milestone’s day, right above it', () => {
    // The bar ends at 300, the diamond's centre: no room to run along, so it loops over.
    const d = intoDiamondPath(bar(100, 200, 0), diamond)
    const visited = points(d)

    expect(visited[0]).toEqual([300, 15])
    expect(visited.at(-1)).toEqual([300, 46])
    // Never back through the bar: every point is at or right of the bar's end, or on the diamond's axis.
    expect(visited.every(([x]) => x >= 300)).toBe(true)
  })

  it('comes up into the bottom point from a row below', () => {
    const d = intoDiamondPath(bar(0, 100, 3), diamond)

    expect(points(d).at(-1)).toEqual([300, 80])
    expect(d.endsWith('m -5 5 l 5 -5 l 5 5')).toBe(true)
  })
})
