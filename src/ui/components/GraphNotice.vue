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
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  droppedEdges: number
  brokenCycles: number
  warnedTasks: number
}>()

const dismissed = ref(false)

const messages = computed(() => {
  const lines: string[] = []
  if (props.droppedEdges > 0) {
    lines.push(
      `${props.droppedEdges} ${props.droppedEdges === 1 ? 'dependency points' : 'dependencies point'} ` +
        'to issues outside this view — closed, in another repository, or not loaded yet.',
    )
  }
  if (props.brokenCycles > 0) {
    lines.push(
      `${props.brokenCycles} circular ${props.brokenCycles === 1 ? 'dependency was' : 'dependencies were'} ` +
        'ignored so the chart could be drawn.',
    )
  }
  if (props.warnedTasks > 0) {
    lines.push(
      `${props.warnedTasks} ${props.warnedTasks === 1 ? 'issue has' : 'issues have'} ` +
        'estimated or corrected dates — hover the amber bars for details.',
    )
  }
  return lines
})

// A newly loaded repository deserves to be told about again.
watch(messages, () => {
  dismissed.value = false
})
</script>

<template>
  <aside
    v-if="messages.length && !dismissed"
    class="mt-4 flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
  >
    <ul class="flex-1 space-y-1">
      <li v-for="message in messages" :key="message">{{ message }}</li>
    </ul>
    <button type="button" class="shrink-0 underline" @click="dismissed = true">Dismiss</button>
  </aside>
</template>
