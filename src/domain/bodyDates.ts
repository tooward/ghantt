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

import { isValid, parseISO } from 'date-fns'

export interface BodyDateConfig {
  startPrefix: string
  duePrefix: string
}

export interface BodyDates {
  start: Date | null
  due: Date | null
}

export const DEFAULT_BODY_PREFIXES: BodyDateConfig = {
  startPrefix: 'GanttStart:',
  duePrefix: 'GanttDue:',
}

/**
 * Reads `GanttStart:` / `GanttDue:` lines out of an issue body. The convention
 * is inherited from GanttLab so existing users' issues keep working; the
 * prefixes are configurable.
 *
 * A line matches only if it *starts with* the prefix once leading whitespace is
 * trimmed — so a prefix mentioned mid-sentence is not a date. Matching is
 * case-insensitive. The first matching line wins.
 */
export function parseBodyDates(body: string | null | undefined, cfg: BodyDateConfig): BodyDates {
  if (!body) return { start: null, due: null }

  const startPrefix = cfg.startPrefix.toLowerCase()
  const duePrefix = cfg.duePrefix.toLowerCase()

  let start: Date | null = null
  let due: Date | null = null

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    const lower = line.toLowerCase()

    if (start === null && startPrefix && lower.startsWith(startPrefix)) {
      start = parseDateAfterPrefix(line, cfg.startPrefix.length)
    } else if (due === null && duePrefix && lower.startsWith(duePrefix)) {
      due = parseDateAfterPrefix(line, cfg.duePrefix.length)
    }

    if (start !== null && due !== null) break
  }

  return { start, due }
}

function parseDateAfterPrefix(line: string, prefixLength: number): Date | null {
  const value = line.slice(prefixLength).trim()
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}
