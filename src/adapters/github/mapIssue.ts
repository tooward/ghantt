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

import { milestoneDay, resolveDates } from '../../domain/dateResolution'
import type { LinkedIssue, MilestoneRef, Task } from '../../domain/Task'
import type { GitHubIssueNode, GitHubIssueRef } from './types'

export interface MapConfig {
  /** Name of the issue date field holding the start date, matched case-insensitively. */
  startFieldName: string
  dueFieldName: string
  /**
   * The Days field: effort in working days. A Number field is calculated
   * with; a single-select one is only shown.
   */
  daysFieldName: string
  defaultTaskDays: number
  /** Label marking a milestone's release issue, matched case-insensitively. */
  releaseLabel: string
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  startFieldName: 'Start',
  dueFieldName: 'End',
  daysFieldName: 'Days',
  defaultTaskDays: 1,
  releaseLabel: 'release',
}

/**
 * Turn one raw issue into a domain `Task`.
 *
 * All date rules live in `resolveDates`; this file only decides which raw
 * strings feed which rung. `IssueFieldDateValue.value` is a String, so it is
 * handed over unparsed and the domain layer decides whether it is usable.
 */
export function mapIssue(node: GitHubIssueNode, cfg: MapConfig): Task {
  const effortDays = effortNumber(node, cfg.daysFieldName)
  const { start, due, sources, warnings } = resolveDates(
    {
      fieldStart: dateFieldValue(node, cfg.startFieldName),
      fieldDue: dateFieldValue(node, cfg.dueFieldName),
      milestoneDue: node.milestone?.dueOn ?? null,
      createdAt: node.createdAt,
      effortDays,
    },
    { defaultTaskDays: cfg.defaultTaskDays },
  )

  const blockedBy = (node.blockedBy?.nodes ?? []).filter(Boolean)

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    start,
    due,
    // `blockedBy` means "these must finish first", which is exactly dependsOn.
    // Edges may point outside the loaded set; pruning is the graph layer's job.
    dependsOn: blockedBy.map((ref) => ref.id),
    blockers: blockedBy.map((ref) => linkedIssue(ref, node)),
    blocking: (node.blocking?.nodes ?? []).filter(Boolean).map((ref) => linkedIssue(ref, node)),
    effort: effortValue(node, cfg.daysFieldName),
    effortDays,
    dateSources: sources,
    canSetFields: node.viewerCanSetFields === true,
    warnings,
    milestone: milestoneRef(node),
    isRelease: hasLabel(node, cfg.releaseLabel),
  }
}

function milestoneRef(node: GitHubIssueNode): MilestoneRef | null {
  const milestone = node.milestone
  // Grouping needs the id; a milestone without one (old fixtures) is not grouped.
  if (!milestone?.id) return null
  return { id: milestone.id, title: milestone.title ?? '', dueOn: milestoneDay(milestone.dueOn) }
}

function hasLabel(node: GitHubIssueNode, name: string): boolean {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return false
  return (node.labels?.nodes ?? []).some((label) => label?.name.trim().toLowerCase() === wanted)
}

function linkedIssue(ref: GitHubIssueRef, node: GitHubIssueNode): LinkedIssue {
  return {
    id: ref.id,
    number: ref.number,
    title: ref.title,
    closed: ref.state === 'CLOSED',
    // Named only when it differs, so same-repository links read as plain "#12".
    repository: ref.repository && ref.repository.nameWithOwner !== node.repository?.nameWithOwner
      ? ref.repository.nameWithOwner
      : null,
  }
}

function dateFieldValue(node: GitHubIssueNode, fieldName: string): string | null {
  return fieldValueNode(node, fieldName, ['IssueFieldDateValue'])?.value ?? null
}

/** Days may be set up as a number field or a single select; accept either. */
function effortValue(node: GitHubIssueNode, fieldName: string): string | null {
  const value = fieldValueNode(node, fieldName, ['IssueFieldNumberValue', 'IssueFieldSingleSelectValue'])
  if (!value) return null
  if (typeof value.numberValue === 'number') return String(value.numberValue)
  return value.optionName ?? null
}

/** Working days from a Number field, or null: unset, not above zero, or a select field. */
function effortNumber(node: GitHubIssueNode, fieldName: string): number | null {
  const value = fieldValueNode(node, fieldName, ['IssueFieldNumberValue'])?.numberValue
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function fieldValueNode(node: GitHubIssueNode, fieldName: string, typenames: string[]) {
  const wanted = fieldName.trim().toLowerCase()
  if (!wanted) return null

  for (const value of node.issueFieldValues?.nodes ?? []) {
    // Check the union discriminator before touching `field` — each fragment
    // selects only its own variant's properties.
    if (!value || !typenames.includes(value.__typename)) continue
    if (value.field?.name?.trim().toLowerCase() !== wanted) continue
    return value
  }
  return null
}
