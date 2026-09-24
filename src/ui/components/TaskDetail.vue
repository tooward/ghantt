<!--
  Copyright 2026 Mike Ward

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { format, isValid, parseISO } from 'date-fns'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { daysAligned, effortConflict, formatDays, type DateSource } from '../../domain/dateResolution'
import type { Task, TaskId } from '../../domain/Task'
import { wouldCreateCycle } from '../../domain/TaskGraph'
import { countWorkingDays, endAfterWorkingDays, startBeforeWorkingDays } from '../../domain/workingDays'
import IssueLinks, { type LinkCandidate, type LookupOffer } from './IssueLinks.vue'

/**
 * Only what the user changed: dates as `YYYY-MM-DD`, Days in working days
 * or null to clear it.
 */
export interface FieldChanges {
  start?: string
  due?: string
  effort?: number | null
}

type EditableField = 'start' | 'due' | 'effort'

/**
 * The selected task's details, and the place its dates and Days are edited.
 * Mount it with `:key` set to the task id so switching tasks starts a fresh
 * form. Every day count comes from `workingDays.ts`; nothing here counts days.
 */
const props = defineProps<{
  task: Task
  /** Every loaded task: linked ones can be selected, and any can be picked as a link. */
  tasks: Task[]
  /** Why each field cannot be edited, or null where it can. Omit for read-only. */
  editability?: { start: string | null; due: string | null; effort?: string | null }
  /** Writes the changes; resolves to an error message, or null on success. */
  save?: (changes: FieldChanges) => Promise<string | null>
  /** Record / remove "`blockedId` is blocked by `blockerId`"; resolve to an error message or null. */
  link?: (blockedId: TaskId, blockerId: TaskId) => Promise<string | null>
  unlink?: (blockedId: TaskId, blockerId: TaskId) => Promise<string | null>
  /**
   * For picker text naming an issue ("#123", "owner/repo#123", a URL): a label
   * and a one-off fetch of it. Null when the text is not such a reference.
   */
  findIssue?: (text: string) => { label: string; run: () => Promise<Task | string> } | null
}>()

const emit = defineEmits<{
  close: []
  select: [id: TaskId]
}>()

const toInput = (date: Date) => format(date, 'yyyy-MM-dd')
const effortToInput = (days: number | null) => (days === null ? '' : String(days))

const startInput = ref(toInput(props.task.start))
const dueInput = ref(toInput(props.task.due))
// A string, so an empty box means "no Days" rather than zero.
const effortInput = ref(effortToInput(props.task.effortDays))
const saving = ref(false)
const saveError = ref<string | null>(null)
const justSaved = ref(false)

// A save hands back a new task; show the dates GitHub now holds. Keyed on the
// dates, not the object: a link change also hands back a new task, and must
// not wipe dates the user is still editing.
// Two sources, not one getter returning an array: a fresh array every run
// would count as a change and fire on any update to the task.
watch(
  [() => toInput(props.task.start), () => toInput(props.task.due)],
  ([start, due]) => {
    startInput.value = start
    dueInput.value = due
  },
)
// Only while the box still shows the old value: an automatic save of Days
// can land while the user is typing in it.
watch(
  () => props.task.effortDays,
  (days, previous) => {
    if (effortInput.value === effortToInput(previous)) effortInput.value = effortToInput(days)
  },
)

const loadedIds = computed(() => new Set(props.tasks.map((task) => task.id)))

/** Loaded issues not already linked in this direction, flagged where a link would loop. */
function candidates(
  existing: { id: TaskId }[],
  loops: (other: Task) => boolean,
  why: (other: Task) => string,
): LinkCandidate[] {
  const linked = new Set(existing.map((link) => link.id))
  return props.tasks
    .filter((other) => other.id !== props.task.id && !linked.has(other.id))
    .map((other) => ({
      id: other.id,
      number: other.number,
      title: other.title,
      reason: loops(other) ? why(other) : null,
    }))
}

/**
 * A lookup offer for issues not on the board, checked the same way as loaded
 * candidates once fetched. A bare "#12" that is loaded needs no lookup: the
 * list already shows it.
 */
function lookupFor(direction: 'blockers' | 'blocking') {
  return (text: string): LookupOffer | null => {
    const named = props.findIssue?.(text)
    if (!named) return null
    const bare = /^#?(\d+)$/.exec(text.trim())
    if (bare && props.tasks.some((task) => task.number === Number(bare[1]))) return null
    return {
      label: named.label,
      find: async () => {
        const result = await named.run()
        if (typeof result === 'string') return result
        const known = props.tasks.some((task) => task.id === result.id) ? props.tasks : [...props.tasks, result]
        const linked = direction === 'blockers' ? props.task.blockers : props.task.blocking
        let reason: string | null = null
        if (result.id === props.task.id) reason = 'That is this issue.'
        else if (linked.some((link) => link.id === result.id)) reason = 'Already linked.'
        else if (
          direction === 'blockers'
            ? wouldCreateCycle(known, props.task.id, result.id)
            : wouldCreateCycle(known, result.id, props.task.id)
        ) {
          reason = direction === 'blockers'
            ? `${named.label} already waits on this issue, directly or through others.`
            : `${named.label} already blocks this issue, directly or through others.`
        }
        const loaded = props.tasks.some((task) => task.id === result.id)
        return {
          id: result.id,
          number: result.number,
          title: result.title,
          reason,
          label: named.label,
          note: loaded ? undefined : 'not on the chart',
        }
      },
    }
  }
}

const lookupBlocker = lookupFor('blockers')
const lookupBlocked = lookupFor('blocking')

const blockerCandidates = computed(() =>
  candidates(
    props.task.blockers,
    (other) => wouldCreateCycle(props.tasks, props.task.id, other.id),
    (other) => `#${other.number} already waits on this issue, directly or through others.`,
  ),
)

const blockedCandidates = computed(() =>
  candidates(
    props.task.blocking,
    (other) => wouldCreateCycle(props.tasks, other.id, props.task.id),
    (other) => `#${other.number} already blocks this issue, directly or through others.`,
  ),
)

function reasonFor(key: EditableField): string | null {
  if (!props.save || !props.editability) return 'Editing is not available.'
  if (!props.task.canSetFields) return 'You do not have permission to set fields on this issue.'
  const reason = props.editability[key]
  // null means "editable"; only a parent that never mentions Days leaves it unavailable.
  if (reason === undefined) return key === 'effort' ? 'Editing Days is not available.' : null
  return reason
}

const startReason = computed(() => reasonFor('start'))
const dueReason = computed(() => reasonFor('due'))
const effortReason = computed(() => reasonFor('effort'))
const anyEditable = computed(() => !startReason.value || !dueReason.value || !effortReason.value)

/** The Days box: a number, null when empty, NaN when not a number. */
const effortValue = computed<number | null>(() => {
  const text = String(effortInput.value ?? '').trim()
  return text === '' ? null : Number(text)
})

// Only what differs from what is shown: a date resolved from the milestone
// or the creation date must not be written back just because it was displayed.
const changes = computed<FieldChanges>(() => {
  const out: FieldChanges = {}
  if (!startReason.value && startInput.value !== toInput(props.task.start)) out.start = startInput.value
  if (!dueReason.value && dueInput.value !== toInput(props.task.due)) out.due = dueInput.value
  if (!effortReason.value && effortValue.value !== props.task.effortDays) out.effort = effortValue.value
  return out
})

const isDirty = computed(() => Object.keys(changes.value).length > 0)

const parsedStart = computed(() => (isValid(parseISO(startInput.value)) ? parseISO(startInput.value) : null))
const parsedDue = computed(() => (isValid(parseISO(dueInput.value)) ? parseISO(dueInput.value) : null))

const validation = computed<string | null>(() => {
  if (!startInput.value || !parsedStart.value) return 'Pick a start date.'
  if (!dueInput.value || !parsedDue.value) return 'Pick an end date.'
  // ISO dates compare correctly as strings.
  if (dueInput.value < startInput.value) return 'End is before Start.'
  const effort = effortValue.value
  if (effort !== null && !(Number.isFinite(effort) && effort > 0)) return 'Days must be a number above zero.'
  return null
})

/** Working days from the Start box to the End box, both counted. */
const days = computed(() =>
  parsedStart.value && parsedDue.value ? countWorkingDays(parsedStart.value, parsedDue.value) : null,
)

/** Days as it would be after saving: the box if it can be edited, else the issue's. */
const effectiveDays = computed<number | null>(() => {
  if (effortReason.value) return props.task.effortDays
  const effort = effortValue.value
  return effort !== null && Number.isFinite(effort) && effort > 0 ? effort : null
})

/**
 * Start–End and Days disagree, either way. A warning, never a block: the
 * user decides, since the tool cannot see everything (shared or part-time
 * work, say).
 */
const conflict = computed<string | null>(() => {
  const effort = effectiveDays.value
  if (effort === null || days.value === null || daysAligned(days.value, effort)) return null
  return effortConflict(days.value, effort)
})

/** The Days that Start–End gives, when it would change the Days box. */
const daysFromDates = computed<number | null>(() => {
  if (effortReason.value || !days.value) return null
  const effort = effectiveDays.value
  return effort !== null && daysAligned(days.value, effort) ? null : days.value
})

function setDaysFromDates(): void {
  if (daysFromDates.value !== null) effortInput.value = effortToInput(daysFromDates.value)
}

/** The End that Start + Days gives, when it would change the End box. */
const endFromDays = computed<Date | null>(() => {
  const effort = effectiveDays.value
  if (dueReason.value || effort === null || !parsedStart.value || !conflict.value) return null
  const end = endAfterWorkingDays(parsedStart.value, effort)
  return toInput(end) === dueInput.value ? null : end
})

function setEndFromDays(): void {
  if (endFromDays.value) dueInput.value = toInput(endFromDays.value)
}

/** The Start that End − Days gives, when it would change the Start box. */
const startFromDays = computed<Date | null>(() => {
  const effort = effectiveDays.value
  if (startReason.value || effort === null || !parsedDue.value || !conflict.value) return null
  const start = startBeforeWorkingDays(parsedDue.value, effort)
  return toInput(start) === startInput.value ? null : start
})

function setStartFromDays(): void {
  if (startFromDays.value) startInput.value = toInput(startFromDays.value)
}

/**
 * Days to write on opening, unasked, so the dates and Days agree: only when
 * both dates are real field values and the Days field is empty. A date from
 * the milestone or a default was never chosen, and a Days value that is
 * already there, even a mismatched one, is the user's call. `effort` is
 * checked as well as `effortDays` so a stored 0 is not overwritten.
 */
const autoFillDays = computed<number | null>(() => {
  const task = props.task
  if (effortReason.value || task.effortDays !== null || task.effort !== null) return null
  if (task.dateSources.start !== 'field' || task.dateSources.due !== 'field') return null
  const count = countWorkingDays(task.start, task.due)
  return count > 0 ? count : null
})
const autoFilled = ref<number | null>(null)
const autoFillError = ref<string | null>(null)
let autoFillTried = false

// A watch, not onMounted: whether Days is editable waits on the field lookup,
// which may finish after the panel opens. Tried at most once per panel, and
// never after the user has saved: clearing Days, or saving a first End, must
// not be followed by a write they did not ask for.
watch(
  autoFillDays,
  async (count) => {
    if (count === null || autoFillTried || isDirty.value || !props.save) return
    autoFillTried = true
    const error = await props.save({ effort: count })
    if (error) autoFillError.value = error
    else autoFilled.value = count
  },
  { immediate: true },
)

const SOURCE_NOTES: Record<DateSource, string | null> = {
  field: null,
  effort: 'from Days',
  milestone: 'from the milestone',
  default: 'default length',
  created: 'issue created',
}

/** Where a shown date came from, while it is still the one shown. */
function sourceNote(key: 'start' | 'due'): string | null {
  const original = toInput(key === 'start' ? props.task.start : props.task.due)
  const current = key === 'start' ? startInput.value : dueInput.value
  return current === original ? SOURCE_NOTES[props.task.dateSources[key]] : null
}

function formatDay(date: Date): string {
  return format(date, 'EEE d MMM yyyy')
}

function revert(): void {
  startInput.value = toInput(props.task.start)
  dueInput.value = toInput(props.task.due)
  effortInput.value = effortToInput(props.task.effortDays)
  saveError.value = null
}

async function onSave(): Promise<void> {
  if (!props.save || !isDirty.value || validation.value || saving.value) return
  autoFillTried = true
  saving.value = true
  saveError.value = null
  justSaved.value = false
  try {
    const error = await props.save({ ...changes.value })
    // Keep the edits on failure, so nothing typed is lost.
    saveError.value = error
    justSaved.value = error === null
  } finally {
    saving.value = false
  }
}

// Non-modal, so Esc is wired by hand. Leave it alone while a real dialog is
// open over the page, which handles its own Esc; while typing in a field; and
// while there are unsaved edits, which Esc would otherwise throw away.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
  // The target is the window itself when nothing has focus.
  const typing = event.target instanceof Element && event.target.closest('input, select, textarea')
  if (typing || isDirty.value) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <aside
    aria-labelledby="task-detail-title"
    class="w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-gray-300 bg-white text-sm shadow-lg"
  >
    <div class="flex items-start gap-2 border-b border-gray-200 px-4 py-3">
      <h2 id="task-detail-title" class="flex-1 font-semibold text-gray-900">
        <span class="text-gray-500">#{{ task.number }}</span> {{ task.title }}
      </h2>
      <button
        type="button"
        class="-mr-1 rounded px-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
        aria-label="Close details"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <form class="px-4 py-3" @submit.prevent="onSave">
      <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
        <dt class="text-gray-500"><label for="detail-start">Start</label></dt>
        <dd>
          <input
            v-if="!startReason"
            id="detail-start"
            v-model="startInput"
            type="date"
            required
            class="rounded border border-gray-300 px-2 py-1"
          >
          <span v-else :title="startReason">{{ formatDay(task.start) }}</span>
          <span v-if="sourceNote('start')" class="ml-1 text-xs text-gray-500">({{ sourceNote('start') }})</span>
        </dd>
        <dt class="text-gray-500"><label for="detail-due">End</label></dt>
        <dd>
          <input
            v-if="!dueReason"
            id="detail-due"
            v-model="dueInput"
            type="date"
            required
            class="rounded border border-gray-300 px-2 py-1"
          >
          <span v-else :title="dueReason">{{ formatDay(task.due) }}</span>
          <span v-if="sourceNote('due')" class="ml-1 text-xs text-gray-500">({{ sourceNote('due') }})</span>
        </dd>
        <dt class="text-gray-500">Length</dt>
        <dd>{{ days === null ? '—' : `${days} working day${days === 1 ? '' : 's'}` }}</dd>
        <dt class="text-gray-500"><label for="detail-days">Days</label></dt>
        <dd>
          <span v-if="!effortReason" class="inline-flex items-center gap-1">
            <input
              id="detail-days"
              v-model="effortInput"
              type="number"
              min="0.5"
              step="0.5"
              inputmode="decimal"
              placeholder="—"
              class="w-20 rounded border border-gray-300 px-2 py-1"
            >
            <span class="text-gray-500">working days</span>
          </span>
          <span v-else :title="effortReason">
            {{ task.effortDays !== null ? formatDays(task.effortDays) : (task.effort ?? '—') }}
          </span>
        </dd>
      </dl>

      <p v-if="autoFilled !== null && !isDirty" role="status" class="mt-2 text-xs text-green-700">
        Days set to {{ autoFilled }} from Start–End and saved to GitHub.
      </p>
      <p v-if="autoFillError" class="mt-2 text-xs text-gray-500">
        Could not fill in Days from Start–End: {{ autoFillError }}
      </p>

      <!-- Live, from the boxes, so it also covers dates written outside this app. -->
      <p v-if="conflict" role="status" class="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
        {{ conflict }} Adjust one below, or keep them as they are — the tool may not know
        everything, such as shared or part-time work.
      </p>

      <div v-if="daysFromDates !== null || endFromDays || startFromDays" class="mt-2 flex flex-col items-start gap-1">
        <button
          v-if="daysFromDates !== null"
          type="button"
          class="text-xs underline decoration-gray-400 hover:decoration-gray-900"
          @click="setDaysFromDates"
        >
          Set Days from Start–End ({{ daysFromDates }})
        </button>
        <button
          v-if="endFromDays"
          type="button"
          class="text-xs underline decoration-gray-400 hover:decoration-gray-900"
          @click="setEndFromDays"
        >
          Set End from Days ({{ formatDay(endFromDays) }})
        </button>
        <button
          v-if="startFromDays"
          type="button"
          class="text-xs underline decoration-gray-400 hover:decoration-gray-900"
          @click="setStartFromDays"
        >
          Set Start from Days ({{ formatDay(startFromDays) }})
        </button>
      </div>

      <!-- Once per reason: the same one usually covers both dates. -->
      <p
        v-for="reason in [...new Set([startReason, dueReason, effortReason].filter((r) => r !== null))]"
        :key="reason"
        class="mt-2 text-xs text-gray-500"
      >
        {{ reason }}
      </p>

      <div v-if="anyEditable" class="mt-3 flex items-center gap-2">
        <button
          type="submit"
          :disabled="!isDirty || !!validation || saving"
          class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40"
        >
          {{ saving ? 'Saving…' : conflict ? 'Save anyway' : 'Save' }}
        </button>
        <button
          v-if="isDirty && !saving"
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5"
          @click="revert"
        >
          Revert
        </button>
        <span v-if="justSaved && !isDirty" role="status" class="text-green-700">Saved to GitHub.</span>
      </div>
      <p v-if="isDirty && validation" class="mt-2 text-xs text-red-700">{{ validation }}</p>
      <p v-if="saveError" role="alert" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">{{ saveError }}</p>
    </form>

    <IssueLinks
      heading="Blocked by"
      add-label="Add blocker"
      :links="task.blockers"
      :loaded-ids="loadedIds"
      :candidates="blockerCandidates"
      :lookup="findIssue && lookupBlocker"
      :add="link && ((id) => link!(task.id, id))"
      :remove="unlink && ((id) => unlink!(task.id, id))"
      @select="emit('select', $event)"
    />
    <IssueLinks
      heading="Blocks"
      add-label="Add blocked issue"
      :links="task.blocking"
      :loaded-ids="loadedIds"
      :candidates="blockedCandidates"
      :lookup="findIssue && lookupBlocked"
      :add="link && ((id) => link!(id, task.id))"
      :remove="unlink && ((id) => unlink!(id, task.id))"
      @select="emit('select', $event)"
    />

    <div class="border-t border-gray-200 px-4 py-3">
      <a :href="task.url" target="_blank" rel="noopener noreferrer" class="underline">Open in GitHub ↗</a>
    </div>
  </aside>
</template>
