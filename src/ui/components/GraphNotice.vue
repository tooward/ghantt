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
