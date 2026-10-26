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
import Gantt, { type FrappeOptions, type FrappeTask, type FrappeViewMode } from 'frappe-gantt'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { isRepoMilestone, type Task, type TaskId } from '../../domain/Task'
import { finishToStartPath, intoDiamondPath, type BarBox } from './arrowPaths'
import { LABEL_INSET, placeLabel } from './barLabels'
import { barName, toFrappeTasks, WARNED_BAR_CLASS } from './frappeTasks'
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

/** Blank rows under the last bar, so the chart does not end hard against its last issue. */
const EMPTY_ROWS = 1

/**
 * Tighter than frappe's defaults (bars 30, 18 between rows, a 45 + 30 header),
 * so more issues fit on screen. The upper header must still clear frappe's
 * month text, which it places 17px down, and the Today button (see the
 * stylesheet below).
 */
const BAR_HEIGHT = 22
const ROW_GAP = 10
const UPPER_HEADER_HEIGHT = 36
const LOWER_HEADER_HEIGHT = 26

/**
 * The grid height frappe would pick for `count` rows, plus the blank ones. The
 * same sum as its own (`make_grid_background`); frappe adds 10 to the header.
 */
function chartHeight(count: number): number {
  const header = UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT + 10
  return header + ROW_GAP + (BAR_HEIGHT + ROW_GAP) * (count + EMPTY_ROWS) - 10
}

function options(): FrappeOptions {
  return {
    view_mode: props.viewMode,
    container_height: chartHeight(props.tasks.length),
    bar_height: BAR_HEIGHT,
    padding: ROW_GAP,
    upper_header_height: UPPER_HEADER_HEIGHT,
    lower_header_height: LOWER_HEADER_HEIGHT,
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
  // The grid's height does not follow the task count on its own: `refresh`
  // reads the option for it, so it is updated first. The container's own
  // height is the box it sits in, set by the stylesheet below.
  gantt.value.options.container_height = chartHeight(props.tasks.length)
  gantt.value.refresh(frappeTasks)
  decorate()
}

/** Everything the library knows nothing about, reapplied after each render. */
function decorate(): void {
  applyLabels()
  applyMilestones()
  applySelection()
  rerouteArrows()
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const DIAMOND_CLASS = 'gh-gantt-diamond'
const DIAMOND_LABEL_CLASS = 'gh-gantt-diamond-label'

/** The frappe bar's box, read from its attributes; null until it is laid out. */
function barBox(group: Element | null): BarBox | null {
  const bar = group?.querySelector('.bar')
  if (!bar) return null
  const read = (name: string) => Number(bar.getAttribute(name))
  const box = { x: read('x'), y: read('y'), width: read('width'), height: read('height') }
  return Object.values(box).every(Number.isFinite) ? box : null
}

/**
 * Where a milestone's diamond sits: centred on the end of its day, as a
 * deadline, and as tall as a bar. frappe still draws a one-day bar for the
 * row, which is hidden but kept as the click target.
 */
function diamondBox(bar: BarBox): BarBox {
  const half = bar.height / 2
  return { x: bar.x + bar.width - half, y: bar.y, width: 2 * half, height: 2 * half }
}

/**
 * Draw each milestone row as a diamond, with its name beside it. frappe's own
 * label is emptied (by `applyLabels`) rather than moved, so its deferred
 * placement has nothing to fight over. Text is set with `textContent` only.
 */
function applyMilestones(): void {
  const el = container.value
  if (!el) return

  for (const task of props.tasks) {
    if (!task.marker) continue
    const group = el.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`)
    const bar = barBox(group)
    if (!group || !bar) continue
    group.classList.toggle(WARNED_BAR_CLASS, task.warnings.length > 0)
    for (const old of group.querySelectorAll(`.${DIAMOND_CLASS}, .${DIAMOND_LABEL_CLASS}`)) old.remove()

    const box = diamondBox(bar)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const half = box.width / 2
    const diamond = document.createElementNS(SVG_NS, 'path')
    diamond.setAttribute('class', DIAMOND_CLASS)
    diamond.setAttribute('d', `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`)
    group.append(diamond)

    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('class', `bar-label ${DIAMOND_LABEL_CLASS}`)
    label.setAttribute('x', String(cx + half + LABEL_INSET))
    label.setAttribute('y', String(cy))
    label.textContent = barName(task)
    group.append(label)
  }
}

/** A diamond's tooltip: what it is, when, and how far along. */
function markerTooltip(task: Task): string[] {
  const marker = task.marker!
  const lines = [`${barName(task)} — due ${format(marker.date, 'EEE d MMM yyyy')}`]
  if (!marker.synthetic) lines.push(`Release issue: #${task.number} ${task.title}`)
  const milestone = marker.milestone
  if (isRepoMilestone(milestone)) {
    const total = milestone.openIssueCount + milestone.closedIssueCount
    lines.push(`${milestone.closedIssueCount} of ${total} issues closed, of every type`)
  }
  return lines
}

/**
 * Redraw every dependency arrow finish-to-start: from the blocker's right end
 * to the blocked bar's start. The library draws from the blocker's middle.
 * A diamond is its own box: arrows leave from its right point, and come in
 * through its top (or bottom) point.
 */
function rerouteArrows(): void {
  const el = container.value
  if (!el) return
  const markers = new Set(props.tasks.filter((task) => task.marker).map((task) => task.id))
  const box = (id: string): BarBox | null => {
    const bar = barBox(el.querySelector(`.bar-wrapper[data-id="${CSS.escape(id)}"]`))
    return bar && markers.has(id) ? diamondBox(bar) : bar
  }
  for (const path of el.querySelectorAll<SVGPathElement>('.arrow path[data-from][data-to]')) {
    const toId = path.dataset.to ?? ''
    const from = box(path.dataset.from ?? '')
    const to = box(toId)
    if (from && to) path.setAttribute('d', markers.has(toId) ? intoDiamondPath(from, to) : finishToStartPath(from, to))
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
 * Give every bar its full name as its label, and a native tooltip with the
 * name plus any warnings. An SVG `<title>` child is the tooltip mechanism
 * inside an SVG; there is no popup to hang it off, since popups are disabled
 * so that a click selects the task for the detail panel.
 */
function applyLabels(): void {
  const el = container.value
  if (!el) return

  for (const task of props.tasks) {
    const group = el.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`)
    if (!group) continue
    const name = barName(task)

    const existing = group.querySelector(':scope > title')
    const title = existing ?? document.createElementNS(SVG_NS, 'title')
    title.textContent = [...(task.marker ? markerTooltip(task) : [name]), ...task.warnings].join('\n')
    if (!existing) group.prepend(title)

    const label = group.querySelector<SVGTextElement>('.bar-label')
    if (!label) continue
    // A diamond's name is drawn beside it by `applyMilestones`.
    label.textContent = task.marker ? '' : name
  }
  placeLabels()
  // frappe places labels itself on the next frame, by a rule that ignores the
  // inset; this frame is queued after its own, so the rule here has the last word.
  requestAnimationFrame(placeLabels)
}

/**
 * Centre each label in its bar, or spill it past the bar's end where it does
 * not fit (`placeLabel`). frappe's `big` class styles a spilled label as text
 * on the grid rather than on the bar.
 */
function placeLabels(): void {
  const el = container.value
  if (!el) return

  for (const task of props.tasks) {
    if (task.marker) continue
    const group = el.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`)
    const label = group?.querySelector<SVGTextElement>('.bar-label')
    const bar = barBox(group ?? null)
    if (!label || !bar) continue
    const { x, spills } = placeLabel(bar, label.getComputedTextLength())
    label.classList.toggle('big', spills)
    label.setAttribute('x', String(x))
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
    <div v-show="tasks.length > 0" ref="container" class="gh-gantt-chart h-full" />
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
 * The chart is the only thing that scrolls vertically: the container fills the
 * box the board gives it (the window's remaining height) rather than being as
 * tall as the chart, and scrolls inside it, so the date header stays pinned
 * and the horizontal scrollbar stays in view. frappe sizes the container from
 * `--gv-grid-height`; that is overridden here. Sized to the chart instead, a
 * horizontal scrollbar left it a few pixels short, and the page and a sliver
 * of the chart both scrolled.
 */
.gh-gantt-chart .gantt-container {
  height: 100%;
  border: 1px solid #e5e7eb;
}

/*
 * The Today button sits in the upper header. frappe pads it 10px down, which
 * with the shorter header would push it over the day row.
 */
.gh-gantt-chart .gantt-container .side-header {
  padding-top: 4px;
}

.gh-gantt-chart .bar-wrapper {
  cursor: pointer;
}

.gh-gantt-chart .bar-wrapper .bar {
  stroke-width: 1;
  outline: none;
}

/*
 * Milestones: the one-day bar frappe draws stays as the click target, but
 * unseen; the diamond and its name are drawn over it. The name sits outside
 * the bar, so it takes the text colour frappe gives labels beside a bar.
 */
.gh-gantt-chart .gh-gantt-milestone .bar {
  opacity: 0;
}

.gh-gantt-chart .gh-gantt-diamond {
  fill: #1f2937;
  stroke: #111827;
  stroke-width: 1;
}

.gh-gantt-chart .gh-gantt-warned .gh-gantt-diamond {
  fill: #fcd34d;
  stroke: #b45309;
}

.gh-gantt-chart .gh-gantt-selected .gh-gantt-diamond {
  stroke: #14532d;
  stroke-width: 3;
}

.gh-gantt-chart .gh-gantt-diamond-label {
  text-anchor: start;
  font-weight: 600;
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
