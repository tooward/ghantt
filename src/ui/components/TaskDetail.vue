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
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task, TaskId } from '../../domain/Task'
import { wouldCreateCycle } from '../../domain/TaskGraph'
import IssueLinks, { type LinkCandidate } from './IssueLinks.vue'

/** `YYYY-MM-DD` strings, only for the dates the user changed. */
export interface DateChanges {
  start?: string
  due?: string
}

/**
 * The selected task's details, and the place its dates are edited. Mount it
 * with `:key` set to the task id so switching tasks starts a fresh form.
 */
const props = defineProps<{
  task: Task
  /** Every loaded task: linked ones can be selected, and any can be picked as a link. */
  tasks: Task[]
  /** Why each date cannot be edited, or null where it can. Omit for read-only. */
  editability?: { start: string | null; due: string | null }
  /** Writes the changes; resolves to an error message, or null on success. */
  save?: (changes: DateChanges) => Promise<string | null>
  /** Record / remove "`blockedId` is blocked by `blockerId`"; resolve to an error message or null. */
  link?: (blockedId: TaskId, blockerId: TaskId) => Promise<string | null>
  unlink?: (blockedId: TaskId, blockerId: TaskId) => Promise<string | null>
}>()

const emit = defineEmits<{
  close: []
  select: [id: TaskId]
}>()

const toInput = (date: Date) => format(date, 'yyyy-MM-dd')

const startInput = ref(toInput(props.task.start))
const dueInput = ref(toInput(props.task.due))
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

function reasonFor(key: 'start' | 'due'): string | null {
  if (!props.save || !props.editability) return 'Editing is not available.'
  if (!props.task.canSetFields) return 'You do not have permission to set fields on this issue.'
  return props.editability[key]
}

const startReason = computed(() => reasonFor('start'))
const dueReason = computed(() => reasonFor('due'))

// Only what differs from what is shown: a date resolved from the milestone
// or the creation date must not be written back just because it was displayed.
const changes = computed<DateChanges>(() => {
  const out: DateChanges = {}
  if (!startReason.value && startInput.value !== toInput(props.task.start)) out.start = startInput.value
  if (!dueReason.value && dueInput.value !== toInput(props.task.due)) out.due = dueInput.value
  return out
})

const isDirty = computed(() => Object.keys(changes.value).length > 0)

const validation = computed<string | null>(() => {
  const start = parseISO(startInput.value)
  const due = parseISO(dueInput.value)
  if (!startInput.value || !isValid(start)) return 'Pick a start date.'
  if (!dueInput.value || !isValid(due)) return 'Pick an end date.'
  // ISO dates compare correctly as strings.
  if (dueInput.value < startInput.value) return 'End is before Start.'
  return null
})

const days = computed(() => {
  const start = parseISO(startInput.value)
  const due = parseISO(dueInput.value)
  return isValid(start) && isValid(due) ? differenceInCalendarDays(due, start) : null
})

function formatDay(date: Date): string {
  return format(date, 'EEE d MMM yyyy')
}

function revert(): void {
  startInput.value = toInput(props.task.start)
  dueInput.value = toInput(props.task.due)
  saveError.value = null
}

async function onSave(): Promise<void> {
  if (!props.save || !isDirty.value || validation.value || saving.value) return
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
        </dd>
        <dt class="text-gray-500">Length</dt>
        <dd>{{ days === null ? '—' : `${days} day${days === 1 ? '' : 's'}` }}</dd>
        <dt class="text-gray-500">Effort</dt>
        <dd>{{ task.effort ?? '—' }}</dd>
      </dl>

      <!-- Once per reason: the same one usually covers both dates. -->
      <p
        v-for="reason in [...new Set([startReason, dueReason].filter((r) => r !== null))]"
        :key="reason"
        class="mt-2 text-xs text-gray-500"
      >
        {{ reason }}
      </p>

      <div v-if="!startReason || !dueReason" class="mt-3 flex items-center gap-2">
        <button
          type="submit"
          :disabled="!isDirty || !!validation || saving"
          class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40"
        >
          {{ saving ? 'Saving…' : 'Save' }}
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
      :add="link && ((id) => link!(id, task.id))"
      :remove="unlink && ((id) => unlink!(id, task.id))"
      @select="emit('select', $event)"
    />

    <div class="border-t border-gray-200 px-4 py-3">
      <a :href="task.url" target="_blank" rel="noopener noreferrer" class="underline">Open in GitHub ↗</a>
    </div>
  </aside>
</template>
