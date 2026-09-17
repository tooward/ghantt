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
    applyWarningTooltips()
    return
  }

  // The instance method. The package README shows `gantt.tasks.refresh()`,
  // which does not exist — following it means the chart silently never updates.
  gantt.value.refresh(frappeTasks)
  applyWarningTooltips()
}

/**
 * Give warned bars a native tooltip. The library renders each bar group with
 * `data-id`, and an SVG `<title>` child is the tooltip mechanism inside an
 * SVG — there is no popup to hang it off, since popups are disabled so that a
 * click goes straight to the issue.
 */
function applyWarningTooltips(): void {
  const el = container.value
  if (!el) return

  for (const task of props.tasks) {
    if (task.warnings.length === 0) continue

    const group = el.querySelector(`[data-id="${CSS.escape(task.id)}"]`)
    if (!group) continue

    const existing = group.querySelector(':scope > title')
    const title = existing ?? document.createElementNS('http://www.w3.org/2000/svg', 'title')
    title.textContent = task.warnings.join(' ')
    if (!existing) group.prepend(title)
  }
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

/* Warned tasks: the dates behind the bar were guessed or corrected. */
.gh-gantt-chart .gh-gantt-warned .bar {
  fill: #f59e0b;
}
</style>
