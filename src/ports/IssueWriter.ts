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

/** What kind of value an issue field holds. Only dates and numbers are written. */
export type FieldKind = 'date' | 'number' | 'single-select' | 'multi-select' | 'text'

/** An issue field a repository offers. */
export interface IssueFieldRef {
  id: string
  name: string
  kind: FieldKind
}

/** One field to set — a `YYYY-MM-DD` date or a number — or to clear. */
export type FieldValue =
  | { fieldId: string; date: string }
  | { fieldId: string; number: number }
  | { fieldId: string; clear: true }

/**
 * Writing back to the forge. Separate from `IssueSource` so reading never
 * depends on write support, and a read-only source stays a complete one.
 */
export interface IssueWriter {
  /** The issue fields this repository offers, with their kinds. */
  fields(repo: RepoRef): Promise<IssueFieldRef[]>
  /** Set or clear the given fields on one issue; resolves to the issue as the forge now holds it. */
  setFields(issueId: TaskId, values: FieldValue[]): Promise<Task>
  /**
   * Record that `issueId` is blocked by `blockerId`, or remove that. Resolves
   * to both issues as the forge now holds them, so each side's links update.
   */
  addBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]>
  removeBlockedBy(issueId: TaskId, blockerId: TaskId): Promise<Task[]>
}
