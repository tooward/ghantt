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

import type { RepoRef } from '../ports/IssueSource'

/** An issue named by what a user types or pastes. */
export interface IssueRef {
  owner: string
  name: string
  number: number
}

const OWNER_REPO = String.raw`([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)`

/**
 * Read an issue reference out of picker text, or null when it is not one:
 *   "#123" or "123"                                   → issue 123 in `current`
 *   "owner/repo#123"                                  → that repository's issue 123
 *   "https://github.com/owner/repo/issues/123" (a URL, with or without scheme)
 * Pull-request URLs are refused here: only issues can block.
 */
export function parseIssueRef(text: string, current: RepoRef | null): IssueRef | null {
  const input = text.trim()

  const bare = /^#?(\d+)$/.exec(input)
  if (bare) return current ? { owner: current.owner, name: current.name, number: Number(bare[1]) } : null

  const short = new RegExp(`^${OWNER_REPO}#(\\d+)$`).exec(input)
  if (short) return { owner: short[1], name: short[2], number: Number(short[3]) }

  const url = new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/${OWNER_REPO}/issues/(\\d+)(?:[/?#].*)?$`, 'i').exec(input)
  if (url) return { owner: url[1], name: url[2], number: Number(url[3]) }

  return null
}

/** "#123" in the current repository, "owner/repo#123" anywhere else. */
export function formatIssueRef(ref: IssueRef, current: RepoRef | null): string {
  const same = current && current.owner.toLowerCase() === ref.owner.toLowerCase() && current.name.toLowerCase() === ref.name.toLowerCase()
  return same ? `#${ref.number}` : `${ref.owner}/${ref.name}#${ref.number}`
}
