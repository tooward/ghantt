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

/**
 * Finish-to-start dependency arrows: from the right end of the blocking bar
 * to the left end (start) of the blocked bar, both at mid-height.
 *
 * frappe-gantt draws its own arrows from the *middle* of the blocking bar,
 * and does so inside `node_modules`, so rather than patch the library the
 * chart rewrites each arrow's `d` after every render with these paths.
 */

export interface BarBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ArrowOptions {
  /** Vertical space between rows; the detour runs along the middle of it. */
  rowGap: number
  /** How far the line runs out of the blocker, and back before the blocked bar. */
  stub: number
  /** Corner radius. */
  radius: number
}

export const DEFAULT_ARROW_OPTIONS: ArrowOptions = { rowGap: 18, stub: 12, radius: 5 }

/** Where the line stops short of the blocked bar, leaving room for the head. */
const HEAD_GAP = 2

type Point = readonly [number, number]

export function finishToStartPath(from: BarBox, to: BarBox, options: ArrowOptions = DEFAULT_ARROW_OPTIONS): string {
  const { rowGap, stub } = options
  const startX = from.x + from.width
  const startY = from.y + from.height / 2
  const endX = to.x - HEAD_GAP
  const endY = to.y + to.height / 2

  let points: Point[]
  if (to.x >= startX + 2 * stub) {
    // Room between the bars: out, across to the blocked row, in.
    const turnX = startX + stub
    points = [[startX, startY], [turnX, startY], [turnX, endY], [endX, endY]]
  } else {
    // The blocked bar starts before the blocker ends. Leave to the right,
    // run back along the gap between the blocker's row and the next row
    // toward the target, and come in from the left so the head still points
    // into the start.
    const down = endY > startY ? 1 : -1
    const laneY = startY + down * (from.height / 2 + rowGap / 2)
    const outX = startX + stub
    const inX = to.x - stub
    points = [[startX, startY], [outX, startY], [outX, laneY], [inX, laneY], [inX, endY], [endX, endY]]
  }

  return `${rounded(points, options.radius)} m -5 -5 l 5 5 l -5 5`
}

/**
 * An arrow into a milestone diamond: out of the bar's right end, then into
 * the diamond's top point (or bottom, from a row below it). A diamond has no
 * start edge to come in from the left to, and the usual case — an issue that
 * ends on the milestone's day — ends exactly above it.
 */
export function intoDiamondPath(from: BarBox, diamond: BarBox, options: ArrowOptions = DEFAULT_ARROW_OPTIONS): string {
  const { rowGap, stub } = options
  const startX = from.x + from.width
  const startY = from.y + from.height / 2
  const tipX = diamond.x + diamond.width / 2
  const below = startY > diamond.y + diamond.height / 2
  const tipY = below ? diamond.y + diamond.height + HEAD_GAP : diamond.y - HEAD_GAP

  let points: Point[]
  if (startX + stub <= tipX) {
    // Straight along the bar's row, then down (or up) into the point.
    points = [[startX, startY], [tipX, startY], [tipX, tipY]]
  } else {
    // The bar ends past the diamond: out, over to the lane beside the
    // diamond's row, back along it, and in.
    const laneY = below ? diamond.y + diamond.height + rowGap / 2 : diamond.y - rowGap / 2
    const outX = startX + stub
    points = [[startX, startY], [outX, startY], [outX, laneY], [tipX, laneY], [tipX, tipY]]
  }

  const head = below ? 'm -5 5 l 5 -5 l 5 5' : 'm -5 -5 l 5 5 l 5 -5'
  return `${rounded(points, options.radius)} ${head}`
}

/**
 * An orthogonal polyline with its corners rounded. Each radius is capped at
 * half the shorter neighbouring segment, so short legs never overshoot.
 */
function rounded(points: Point[], radius: number): string {
  const [first, ...rest] = points
  let path = `M ${fmt(first[0])} ${fmt(first[1])}`
  for (let i = 0; i < rest.length; i += 1) {
    const corner = rest[i]
    const next = rest[i + 1]
    if (!next) {
      path += ` L ${fmt(corner[0])} ${fmt(corner[1])}`
      break
    }
    const prev = points[i]
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2)
    const before = toward(corner, prev, r)
    const after = toward(corner, next, r)
    path += ` L ${fmt(before[0])} ${fmt(before[1])} Q ${fmt(corner[0])} ${fmt(corner[1])} ${fmt(after[0])} ${fmt(after[1])}`
  }
  return path
}

function distance(a: Point, b: Point): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
}

/** The point `r` along the segment from `from` toward `to`. */
function toward(from: Point, to: Point, r: number): Point {
  const length = distance(from, to)
  if (length === 0) return from
  return [from[0] + ((to[0] - from[0]) / length) * r, from[1] + ((to[1] - from[1]) / length) * r]
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}
