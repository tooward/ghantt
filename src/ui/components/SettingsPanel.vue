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
import { useTemplateRef, watch } from 'vue'
import { useSettingsStore } from '../../app/stores/settings'

const settings = useSettingsStore()

const open = defineModel<boolean>('open', { default: false })

// A native modal <dialog>, as in RepoHelp: focus trapping, Esc and an inert
// page come with it. `open` drives it; the dialog's own close (Esc included)
// reports back through `close`.
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(
  [open, dialog],
  ([isOpen, el]) => {
    if (!el) return
    if (isOpen && !el.open) el.showModal()
    if (!isOpen && el.open) el.close()
  },
  { immediate: true },
)

// A click whose target is the <dialog> itself landed on the backdrop.
function onDialogClick(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="settings-title"
    class="m-auto w-full max-w-2xl rounded-lg p-0 shadow-xl backdrop:bg-black/40"
    @close="open = false"
    @click="onDialogClick"
  >
    <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
      <h2 id="settings-title" class="text-base font-semibold text-gray-900">Settings</h2>
      <button
        type="button"
        class="-mr-1 rounded px-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
        aria-label="Close settings"
        @click="open = false"
      >
        ×
      </button>
    </div>

    <div id="settings-body" class="grid gap-4 p-5 sm:grid-cols-2">
      <div>
        <label for="start-field" class="block text-sm font-medium">Start field</label>
        <input
          id="start-field"
          v-model="settings.startFieldName"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">Issue date field name, matched case-insensitively.</p>
      </div>

      <div>
        <label for="due-field" class="block text-sm font-medium">End field</label>
        <input
          id="due-field"
          v-model="settings.dueFieldName"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
      </div>

      <div>
        <label for="effort-field" class="block text-sm font-medium">Effort field</label>
        <input
          id="effort-field"
          v-model="settings.effortFieldName"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">A Number issue field, in working days. A single-select one is shown but not calculated with.</p>
      </div>

      <div>
        <label for="default-days" class="block text-sm font-medium">Default task length (working days)</label>
        <input
          id="default-days"
          v-model.number="settings.defaultTaskDays"
          type="number"
          min="1"
          max="365"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">Used when an issue has no End and no Effort. Start and End both count, so 1 means a one-day task.</p>
      </div>

      <div>
        <label for="page-size" class="block text-sm font-medium">Issues per request</label>
        <input
          id="page-size"
          v-model.number="settings.pageSize"
          type="number"
          min="1"
          max="100"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">GitHub allows at most 100.</p>
      </div>

      <div class="sm:col-span-2">
        <button type="button" class="rounded border border-gray-300 px-3 py-2 text-sm" @click="settings.reset()">
          Reset to defaults
        </button>
      </div>
    </div>
  </dialog>
</template>
