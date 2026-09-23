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

import type { Task, TaskId } from '../domain/Task'
import type { RepoRef } from './IssueSource'

/** A date-type issue field a repository offers. */
export interface DateField {
  id: string
  name: string
}

/** One field to set: a `DateField.id` and a `YYYY-MM-DD` date. */
export interface DateFieldValue {
  fieldId: string
  date: string
}

/**
 * Writing back to the forge. Separate from `IssueSource` so reading never
 * depends on write support, and a read-only source stays a complete one.
 */
export interface IssueWriter {
  /** The date fields issues in this repository can carry. */
  dateFields(repo: RepoRef): Promise<DateField[]>
  /** Set the given fields on one issue; resolves to the issue as the forge now holds it. */
  setDates(issueId: TaskId, values: DateFieldValue[]): Promise<Task>
  /**
   * Record that `issueId` is blocked by `blockerId`, or remove that. Resolves
   * to both issues as the forge now holds them, so each side's links update.
   */
  addBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]>
  removeBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]>
}
