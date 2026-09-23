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
import { computed, nextTick, ref, useId } from 'vue'
import type { LinkedIssue, TaskId } from '../../domain/Task'

/** A loaded issue that could be linked; `reason` says why it cannot, if it cannot. */
export interface LinkCandidate {
  id: TaskId
  number: number
  title: string
  reason: string | null
}

/**
 * One direction of blocking links — "Blocked by" or "Blocks" — with a picker
 * over the loaded issues and a confirm step before removing. Picking from
 * what is loaded costs no requests; issues not on the board come later.
 */
const props = defineProps<{
  heading: string
  addLabel: string
  links: LinkedIssue[]
  loadedIds: ReadonlySet<TaskId>
  candidates: LinkCandidate[]
  /** Both resolve to an error message, or null on success. Omit for read-only. */
  add?: (id: TaskId) => Promise<string | null>
  remove?: (id: TaskId) => Promise<string | null>
}>()

const emit = defineEmits<{
  select: [id: TaskId]
}>()

const MAX_OPTIONS = 8
const listId = useId()

const picking = ref(false)
const query = ref('')
const active = ref(0)
const busy = ref(false)
const error = ref<string | null>(null)
const confirming = ref<TaskId | null>(null)
const input = ref<HTMLInputElement | null>(null)

// "#12", "12" or words from the title.
const options = computed(() => {
  const q = query.value.trim().toLowerCase().replace(/^#/, '')
  const matches = q
    ? props.candidates.filter((c) => String(c.number).startsWith(q) || c.title.toLowerCase().includes(q))
    : props.candidates
  return matches.slice(0, MAX_OPTIONS)
})

async function openPicker(): Promise<void> {
  picking.value = true
  query.value = ''
  active.value = 0
  error.value = null
  await nextTick()
  input.value?.focus()
}

function closePicker(): void {
  picking.value = false
  query.value = ''
}

function move(step: number): void {
  const count = options.value.length
  if (count === 0) return
  active.value = (active.value + step + count) % count
}

async function run(action: () => Promise<string | null>): Promise<boolean> {
  busy.value = true
  error.value = null
  try {
    error.value = await action()
    return error.value === null
  } finally {
    busy.value = false
  }
}

async function choose(option: LinkCandidate | undefined): Promise<void> {
  if (!option || option.reason || !props.add || busy.value) return
  const add = props.add
  if (await run(() => add(option.id))) closePicker()
}

async function confirmRemove(id: TaskId): Promise<void> {
  const remove = props.remove
  if (!remove || busy.value) return
  if (await run(() => remove(id))) confirming.value = null
}
</script>

<template>
  <div class="border-t border-gray-200 px-4 py-3">
    <div class="flex items-baseline justify-between">
      <h3 class="text-gray-500">{{ heading }}</h3>
      <button
        v-if="add && !picking"
        type="button"
        class="text-xs underline decoration-gray-400 hover:decoration-gray-900"
        @click="openPicker"
      >
        + {{ addLabel }}
      </button>
    </div>

    <p v-if="links.length === 0 && !picking" class="mt-1">Nothing.</p>
    <ul v-else class="mt-1 space-y-1">
      <li v-for="link in links" :key="link.id" class="flex items-start gap-1">
        <span class="min-w-0 flex-1">
          <button
            v-if="loadedIds.has(link.id)"
            type="button"
            class="text-left underline decoration-gray-400 hover:decoration-gray-900"
            @click="emit('select', link.id)"
          >
            #{{ link.number }} {{ link.title }}
          </button>
          <span v-else>
            <template v-if="link.repository">{{ link.repository }}</template>#{{ link.number }} {{ link.title }}
          </span>
          <span v-if="link.closed" class="ml-1 rounded bg-gray-100 px-1 text-xs text-gray-600">closed</span>
          <span
            v-else-if="!loadedIds.has(link.id) && !link.repository"
            class="ml-1 rounded bg-gray-100 px-1 text-xs text-gray-600"
          >not loaded</span>
        </span>

        <template v-if="remove">
          <span v-if="confirming === link.id" class="flex shrink-0 items-center gap-1 text-xs">
            Remove?
            <button
              type="button"
              :disabled="busy"
              class="rounded bg-red-700 px-1.5 py-0.5 text-white disabled:opacity-50"
              @click="confirmRemove(link.id)"
            >
              {{ busy ? '…' : 'Yes' }}
            </button>
            <button type="button" :disabled="busy" class="underline" @click="confirming = null">No</button>
          </span>
          <button
            v-else
            type="button"
            class="shrink-0 rounded px-1 leading-none text-gray-400 hover:bg-gray-100 hover:text-red-700"
            :aria-label="`Remove #${link.number}`"
            @click="confirming = link.id; error = null"
          >
            ×
          </button>
        </template>
      </li>
    </ul>

    <div v-if="picking" class="relative mt-2">
      <input
        ref="input"
        v-model="query"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="options.length > 0"
        :aria-controls="listId"
        :aria-activedescendant="options[active] ? `${listId}-${active}` : undefined"
        :aria-label="addLabel"
        placeholder="Number or title"
        :disabled="busy"
        class="w-full rounded border border-gray-300 px-2 py-1"
        @input="active = 0"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose(options[active])"
        @keydown.esc.stop="closePicker"
      >
      <ul
        :id="listId"
        role="listbox"
        class="mt-1 max-h-56 overflow-y-auto rounded border border-gray-200 bg-white shadow"
      >
        <li
          v-for="(option, index) in options"
          :id="`${listId}-${index}`"
          :key="option.id"
          role="option"
          :aria-selected="index === active"
          :aria-disabled="option.reason !== null"
          class="cursor-pointer px-2 py-1"
          :class="[
            index === active ? 'bg-gray-100' : '',
            option.reason ? 'cursor-not-allowed text-gray-400' : '',
          ]"
          @mouseenter="active = index"
          @mousedown.prevent="choose(option)"
        >
          <span>#{{ option.number }} {{ option.title }}</span>
          <span v-if="option.reason" class="block text-xs">{{ option.reason }}</span>
        </li>
        <li v-if="options.length === 0" class="px-2 py-1 text-gray-500">
          No loaded issue matches.
        </li>
      </ul>
      <button type="button" class="mt-1 text-xs underline" @click="closePicker">Cancel</button>
    </div>

    <p v-if="error" role="alert" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">{{ error }}</p>
  </div>
</template>
