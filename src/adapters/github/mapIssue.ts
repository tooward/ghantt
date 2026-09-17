import { parseBodyDates, type BodyDateConfig } from '../../domain/bodyDates'
import { resolveDates } from '../../domain/dateResolution'
import type { Task } from '../../domain/Task'
import type { GitHubIssueNode } from './types'

export interface MapConfig extends BodyDateConfig {
  /** Name of the issue date field holding the start date, matched case-insensitively. */
  startFieldName: string
  dueFieldName: string
  defaultTaskDays: number
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  startFieldName: 'Start date',
  dueFieldName: 'Target date',
  startPrefix: 'GanttStart:',
  duePrefix: 'GanttDue:',
  defaultTaskDays: 1,
}

/**
 * Turn one raw issue into a domain `Task`.
 *
 * All date rules live in `resolveDates`; this file only decides which raw
 * strings feed which rung. `IssueFieldDateValue.value` is a String, so it is
 * handed over unparsed and the domain layer decides whether it is usable.
 */
export function mapIssue(node: GitHubIssueNode, cfg: MapConfig): Task {
  const bodyDates = parseBodyDates(node.body, cfg)

  const { start, due, warnings } = resolveDates(
    {
      fieldStart: dateFieldValue(node, cfg.startFieldName),
      fieldDue: dateFieldValue(node, cfg.dueFieldName),
      bodyStart: bodyDates.start,
      bodyDue: bodyDates.due,
      milestoneDue: node.milestone?.dueOn ?? null,
      createdAt: node.createdAt,
    },
    { defaultTaskDays: cfg.defaultTaskDays },
  )

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    start,
    due,
    // `blockedBy` means "these must finish first", which is exactly dependsOn.
    // Edges may point outside the loaded set; pruning is the graph layer's job.
    dependsOn: (node.blockedBy?.nodes ?? []).filter(Boolean).map((ref) => ref.id),
    warnings,
  }
}

function dateFieldValue(node: GitHubIssueNode, fieldName: string): string | null {
  const wanted = fieldName.trim().toLowerCase()
  if (!wanted) return null

  for (const value of node.issueFieldValues?.nodes ?? []) {
    // Check the union discriminator before touching `field` — text, number and
    // select values have neither `field.name` nor `value`.
    if (!value || value.__typename !== 'IssueFieldDateValue') continue
    if (value.field?.name?.trim().toLowerCase() !== wanted) continue
    return value.value ?? null
  }
  return null
}
