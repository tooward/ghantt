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
import { format } from 'date-fns'
import { computed } from 'vue'
import { isRepoMilestone, type Task } from '../../domain/Task'

/**
 * The panel for a milestone diamond that has no release issue behind it: it
 * is no issue, so there is nothing to edit, only what the milestone says and
 * a link to it. A release issue's diamond opens the usual task panel instead.
 */
const props = defineProps<{ row: Task }>()
const emit = defineEmits<{ close: [] }>()

const milestone = computed(() => props.row.marker?.milestone ?? null)
const counts = computed(() => {
  const m = milestone.value
  return isRepoMilestone(m) ? { open: m.openIssueCount, closed: m.closedIssueCount } : null
})
</script>

<template>
  <aside
    aria-labelledby="milestone-detail-title"
    class="w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-gray-300 bg-white text-sm shadow-lg"
  >
    <div class="flex items-start gap-2 border-b border-gray-200 px-4 py-3">
      <h2 id="milestone-detail-title" class="flex-1 font-semibold text-gray-900">
        <span class="text-gray-500">Milestone</span> {{ row.title }}
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
    <div class="space-y-2 px-4 py-3">
      <p><span class="text-gray-500">Due</span> {{ format(row.due, 'EEE d MMM yyyy') }}</p>
      <p v-if="counts">
        {{ counts.closed }} of {{ counts.open + counts.closed }} issues closed
        <span class="text-gray-500">(every type, not only what is charted)</span>
      </p>
      <p class="text-xs text-gray-500">
        No loaded issue in this milestone has the release label, so nothing can be blocked by it yet.
      </p>
      <p v-for="warning in row.warnings" :key="warning" class="rounded bg-amber-50 p-2 text-xs text-amber-900">
        {{ warning }}
      </p>
    </div>
    <div v-if="row.url" class="border-t border-gray-200 px-4 py-3">
      <a :href="row.url" target="_blank" rel="noopener noreferrer" class="underline">Open in GitHub ↗</a>
    </div>
  </aside>
</template>
