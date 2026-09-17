<script setup lang="ts">
import Gantt, { type FrappeOptions, type FrappeTask, type FrappeViewMode } from 'frappe-gantt'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { Task } from '../../domain/Task'
import { toFrappeTasks } from './frappeTasks'
import 'frappe-gantt/dist/frappe-gantt.css'

const props = defineProps<{
  tasks: Task[]
  viewMode: FrappeViewMode
}>()

const container = shallowRef<HTMLDivElement | null>(null)
// shallowRef, never ref: the library mutates its own internals constantly, and
// deep reactivity over that destroys performance.
const gantt = shallowRef<Gantt | null>(null)

function openIssue(frappeTask: FrappeTask): void {
  const task = props.tasks.find((candidate) => candidate.id === frappeTask.id)
  if (task) window.open(task.url, '_blank', 'noopener,noreferrer')
}

function options(): FrappeOptions {
  return {
    view_mode: props.viewMode,
    // This app never edits: the chart is a view of GitHub, not an editor.
    readonly: true,
    popup: false,
    infinite_padding: false,
    today_button: true,
    on_click: openIssue,
  }
}

function destroy(): void {
  gantt.value?.clear()
  gantt.value = null
}

function render(): void {
  const el = container.value
  if (!el) return

  // frappe does not handle an empty task list gracefully, so never construct
  // one — the template shows an empty state instead.
  if (props.tasks.length === 0) {
    destroy()
    el.innerHTML = ''
    return
  }

  const frappeTasks = toFrappeTasks(props.tasks)

  if (!gantt.value) {
    el.innerHTML = ''
    gantt.value = new Gantt(el, frappeTasks, options())
    return
  }

  // The instance method. The package README shows `gantt.tasks.refresh()`,
  // which does not exist — following it means the chart silently never updates.
  gantt.value.refresh(frappeTasks)
}

watch(
  () => [props.tasks, props.viewMode] as const,
  () => render(),
  { immediate: false },
)

watch(container, () => render(), { immediate: true })

watch(
  () => props.viewMode,
  (mode) => gantt.value?.change_view_mode(mode),
)

onBeforeUnmount(destroy)
</script>

<template>
  <div>
    <p v-if="tasks.length === 0" class="rounded border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
      Nothing to chart yet.
    </p>
    <div v-show="tasks.length > 0" ref="container" class="gh-gantt-chart overflow-x-auto" />
  </div>
</template>

<style>
.gh-gantt-chart .bar-wrapper {
  cursor: pointer;
}
</style>
