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
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useBoardStore } from '../../app/stores/board'

/**
 * Which labels to chart, from the labels on the loaded issues. Filtering is
 * done on what is already loaded, so it makes no requests.
 */
const board = useBoardStore()

const open = ref(false)
const root = useTemplateRef<HTMLDivElement>('root')

/** The loaded labels, plus any chosen one no longer on them, so it can still be unticked. */
const options = computed(() => {
  const known = new Set(board.labels.map((label) => label.toLowerCase()))
  return [...board.labels, ...board.labelFilter.filter((label) => !known.has(label.toLowerCase()))]
})

const isChosen = (label: string) =>
  board.labelFilter.some((chosen) => chosen.toLowerCase() === label.toLowerCase())

function toggleLabel(label: string): void {
  board.labelFilter = isChosen(label)
    ? board.labelFilter.filter((chosen) => chosen.toLowerCase() !== label.toLowerCase())
    : [...board.labelFilter, label]
}

const summary = computed(() => {
  const chosen = board.labelFilter
  if (chosen.length === 0) return 'All'
  return chosen.length <= 2 ? chosen.join(', ') : `${chosen.length} labels`
})

// A popover, not a dialog: close on a click anywhere else.
function onPointerDown(event: PointerEvent): void {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="flex max-w-56 items-center gap-1 rounded border bg-white px-2 py-1.5 text-sm hover:bg-gray-100"
      :class="board.labelFilter.length ? 'border-gray-900' : 'border-gray-300'"
      :aria-expanded="open"
      aria-controls="label-filter-panel"
      @click="open = !open"
    >
      <span class="text-gray-600">Labels</span>
      <span class="truncate font-medium">{{ summary }}</span>
    </button>
    <div
      v-if="open"
      id="label-filter-panel"
      class="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-300 bg-white p-2 text-sm shadow-lg"
    >
      <p v-if="options.length === 0" class="p-1 text-gray-500">No loaded issue has a label.</p>
      <template v-else>
        <p class="px-1 pb-1 text-xs text-gray-500">Show issues with any of:</p>
        <ul class="max-h-72 overflow-y-auto">
          <li v-for="label in options" :key="label">
            <label class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50">
              <input type="checkbox" :checked="isChosen(label)" @change="toggleLabel(label)">
              <span class="truncate">{{ label }}</span>
            </label>
          </li>
        </ul>
        <button
          type="button"
          class="mt-1 w-full rounded px-1 py-1 text-left text-xs underline decoration-gray-400 hover:decoration-gray-900 disabled:no-underline disabled:opacity-40"
          :disabled="board.labelFilter.length === 0"
          @click="board.labelFilter = []"
        >
          Show all issues
        </button>
      </template>
    </div>
  </div>
</template>
