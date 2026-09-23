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
import type { Task, TaskId } from '../../domain/Task'
import { finishToStartPath, type BarBox } from './arrowPaths'
import { toFrappeTasks } from './frappeTasks'
import 'frappe-gantt/dist/frappe-gantt.css'

const props = defineProps<{
  tasks: Task[]
  viewMode: FrappeViewMode
  /** The bar to highlight; the detail panel shows this task. */
  selectedId?: TaskId | null
}>()

const emit = defineEmits<{
  /** A bar was clicked. Clicking the selected bar again clears the selection. */
  select: [id: TaskId | null]
}>()

const SELECTED_BAR_CLASS = 'gh-gantt-selected'

const container = shallowRef<HTMLDivElement | null>(null)
// shallowRef, never ref: the library mutates its own internals constantly, and
// deep reactivity over that destroys performance.
const gantt = shallowRef<Gantt | null>(null)

// A click selects rather than opening GitHub; the detail panel links out.
function selectTask(frappeTask: FrappeTask): void {
  emit('select', frappeTask.id === props.selectedId ? null : frappeTask.id)
}

function options(): FrappeOptions {
  return {
    view_mode: props.viewMode,
    // This app never edits: the chart is a view of GitHub, not an editor.
    readonly: true,
    popup: false,
    infinite_padding: false,
    today_button: true,
    on_click: selectTask,
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
    decorate()
    return
  }

  // The instance method. The package README shows `gantt.tasks.refresh()`,
  // which does not exist — following it means the chart silently never updates.
  gantt.value.refresh(frappeTasks)
  decorate()
}

/** Everything the library knows nothing about, reapplied after each render. */
function decorate(): void {
  applyWarningTooltips()
  applySelection()
  rerouteArrows()
}

/**
 * Redraw every dependency arrow finish-to-start: from the blocker's right end
 * to the blocked bar's start. The library draws from the blocker's middle.
 */
function rerouteArrows(): void {
  const el = container.value
  if (!el) return
  const box = (id: string): BarBox | null => {
    const bar = el.querySelector(`.bar-wrapper[data-id="${CSS.escape(id)}"] .bar`)
    if (!bar) return null
    const read = (name: string) => Number(bar.getAttribute(name))
    const result = { x: read('x'), y: read('y'), width: read('width'), height: read('height') }
    return Object.values(result).every(Number.isFinite) ? result : null
  }
  for (const path of el.querySelectorAll<SVGPathElement>('.arrow path[data-from][data-to]')) {
    const from = box(path.dataset.from ?? '')
    const to = box(path.dataset.to ?? '')
    if (from && to) path.setAttribute('d', finishToStartPath(from, to))
  }
}

function applySelection(): void {
  const el = container.value
  if (!el) return
  for (const group of el.querySelectorAll(`.${SELECTED_BAR_CLASS}`)) group.classList.remove(SELECTED_BAR_CLASS)
  if (!props.selectedId) return
  el.querySelector(`.bar-wrapper[data-id="${CSS.escape(props.selectedId)}"]`)?.classList.add(SELECTED_BAR_CLASS)
}

/**
 * Give warned bars a native tooltip. The library renders each bar group with
 * `data-id`, and an SVG `<title>` child is the tooltip mechanism inside an
 * SVG — there is no popup to hang it off, since popups are disabled so that a
 * click selects the task for the detail panel.
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
  (mode) => {
    gantt.value?.change_view_mode(mode)
    decorate()
  },
)

watch(() => props.selectedId, applySelection)

onBeforeUnmount(destroy)
</script>

<template>
  <div>
    <p v-if="tasks.length === 0" class="rounded border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
      Nothing to chart yet.
    </p>
    <!-- No overflow here: the library's own .gantt-container scrolls both ways,
         which is what keeps its date header sticky. -->
    <div v-show="tasks.length > 0" ref="container" class="gh-gantt-chart" />
  </div>
</template>

<style>
/*
 * Bars are light green with a darker green outline: a pale fill alone is
 * barely distinguishable from the white rows, so the stroke carries the
 * contrast. Colour is reserved for meaning later — status will take it over.
 */
.gh-gantt-chart {
  --g-bar-color: #bbf7d0;
  --g-bar-border: #15803d;
  --g-arrow-color: #374151;
}

/*
 * frappe sets the container's inline height to the full chart height, so it
 * never scrolls vertically and the date header scrolls off the page. Capping
 * it makes the container scroll, and the library's header is already
 * `position: sticky; top: 0` inside it.
 */
.gh-gantt-chart .gantt-container {
  max-height: calc(100vh - 16rem);
  min-height: 16rem;
}

.gh-gantt-chart .bar-wrapper {
  cursor: pointer;
}

.gh-gantt-chart .bar-wrapper .bar {
  stroke-width: 1;
  outline: none;
}

/* Warned tasks: the dates behind the bar were guessed or corrected. */
.gh-gantt-chart .gh-gantt-warned .bar {
  fill: #fcd34d;
  stroke: #b45309;
}

.gh-gantt-chart .gh-gantt-selected .bar {
  stroke: #14532d;
  stroke-width: 3;
}
</style>
