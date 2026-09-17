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
import { useSettingsStore } from '../../app/stores/settings'

const settings = useSettingsStore()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <section class="mt-6 rounded border border-gray-200">
    <h2>
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        :aria-expanded="open"
        aria-controls="settings-body"
        @click="open = !open"
      >
        Settings
        <span aria-hidden="true">{{ open ? '−' : '+' }}</span>
      </button>
    </h2>

    <div v-show="open" id="settings-body" class="grid gap-4 border-t border-gray-200 p-4 sm:grid-cols-2">
      <div>
        <label for="start-field" class="block text-sm font-medium">Start date field</label>
        <input
          id="start-field"
          v-model="settings.startFieldName"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">Issue date field name, matched case-insensitively.</p>
      </div>

      <div>
        <label for="due-field" class="block text-sm font-medium">Due date field</label>
        <input
          id="due-field"
          v-model="settings.dueFieldName"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
      </div>

      <div>
        <label for="start-prefix" class="block text-sm font-medium">Body start prefix</label>
        <input
          id="start-prefix"
          v-model="settings.startPrefix"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono"
        >
        <p class="mt-1 text-xs text-gray-500">A line in the issue body, e.g. <code>GanttStart: 2026-03-01</code>.</p>
      </div>

      <div>
        <label for="due-prefix" class="block text-sm font-medium">Body due prefix</label>
        <input
          id="due-prefix"
          v-model="settings.duePrefix"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono"
        >
      </div>

      <div>
        <label for="default-days" class="block text-sm font-medium">Default task length (days)</label>
        <input
          id="default-days"
          v-model.number="settings.defaultTaskDays"
          type="number"
          min="1"
          max="365"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">Used when an issue has no due date of its own.</p>
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
  </section>
</template>
