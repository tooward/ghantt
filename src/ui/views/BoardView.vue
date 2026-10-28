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
import { useBoardStore } from '../../app/stores/board'
import { useSettingsStore } from '../../app/stores/settings'
import ChartSkeleton from '../components/ChartSkeleton.vue'
import ErrorBanner from '../components/ErrorBanner.vue'
import GanttChart from '../components/GanttChart.vue'
import GraphNotice from '../components/GraphNotice.vue'
import MilestoneDetail from '../components/MilestoneDetail.vue'
import TaskDetail from '../components/TaskDetail.vue'
import type { TaskId } from '../../domain/Task'

const board = useBoardStore()
const settings = useSettingsStore()

const selectedId = ref<TaskId | null>(null)

// Read from the unpruned tasks: the panel lists every blocker GitHub reports,
// including those the graph drops.
const selectedTask = computed(() => board.tasks.find((task) => task.id === selectedId.value) ?? null)

/** Picker text naming an issue that may not be loaded, and a one-off fetch of it. */
function findIssue(text: string) {
  const named = board.issueRefFor(text)
  return named && { label: named.label, run: () => board.lookupIssue(named.ref) }
}

/** A stand-in milestone diamond: no issue behind it, so it has its own small panel. */
const selectedMilestone = computed(() =>
  board.timeline.find((row) => row.id === selectedId.value && row.marker?.synthetic) ?? null,
)

// A reload or a different repository can take the selection away.
watch([selectedTask, selectedMilestone], ([task, milestone]) => {
  if (!task && !milestone) selectedId.value = null
})

// From the timeline, which adds milestone warnings; stand-in diamonds are not issues.
const warnedTasks = computed(
  () => board.timeline.filter((row) => !row.marker?.synthetic && row.warnings.length > 0).length,
)
/** "Feature issues" or "issues", for the counts and the empty state. */
const loadedType = computed(() => board.repo?.issueType ?? null)
const issueNoun = computed(() => (loadedType.value ? `${loadedType.value} issues` : 'issues'))

// A typo filters everything out, which would look like an empty repository.
const unknownType = computed(() => {
  const type = loadedType.value?.toLowerCase()
  if (!type || board.issueTypes.length === 0) return false
  return !board.issueTypes.some((known) => known.toLowerCase() === type)
})

const isFirstLoad = computed(() => board.loading && board.tasks.length === 0)

/** Loaded issues the label filter hides; zero when there is no filter. */
const hiddenByLabel = computed(() => board.graph.tasks.length - board.visibleTasks.length)

</script>

<template>
  <!-- A column filling main: the chart takes whatever height the notices above
       and the Load more button below leave over. -->
  <section class="flex min-h-0 flex-1 flex-col">
    <!-- Owner, Repository and Type live in the toolbar under the header. -->
    <p v-if="!board.repo && !board.loading && !board.error" class="text-sm text-gray-600">
      Choose a repository from the toolbar above to chart its issues.
    </p>

    <ErrorBanner :message="board.error" @dismiss="board.error = null" />

    <ChartSkeleton v-if="isFirstLoad" />

    <div v-else-if="board.tasks.length" class="flex min-h-0 flex-1 flex-col">
      <GraphNotice
        :dropped-edges="board.graph.droppedEdges"
        :broken-cycles="board.graph.brokenCycles"
        :warned-tasks="warnedTasks"
      />

      <p v-if="hiddenByLabel > 0" class="mb-2 text-sm text-gray-600" role="status">
        Showing {{ board.visibleTasks.length }} of {{ board.graph.tasks.length }} loaded {{ issueNoun }}:
        only those labelled {{ board.labelFilter.join(' or ') }}.
        <button type="button" class="underline" @click="board.labelFilter = []">Show all</button>
      </p>

      <!-- The only vertical scroll: the chart scrolls inside this box, which
           fills the window's remaining height. A floor, so a very short window
           still shows a few rows (main scrolls instead). -->
      <div class="relative min-h-48 flex-1">
        <GanttChart
          class="h-full"
          :tasks="board.timeline"
          :view-mode="settings.viewMode"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
        <!-- Outside the chart's scroll container so it stays put while the
             chart scrolls under it. The column sits below the date header and
             clear of both scrollbars. Only the panel takes clicks; the rest of
             the column lets them through to the chart. A panel taller than the
             chart scrolls on its own. -->
        <div class="pointer-events-none absolute bottom-6 left-3 right-6 top-20 z-10 flex items-start justify-end">
          <!-- Keyed by task, so choosing another bar starts a fresh form. -->
          <TaskDetail
            v-if="selectedTask"
            :key="selectedTask.id"
            class="pointer-events-auto max-h-full overflow-y-auto"
            :task="selectedTask"
            :tasks="board.tasks"
            :editability="board.fieldEditability"
            :save="(changes) => board.saveFields(selectedTask!.id, changes)"
            :link="board.linkBlocker"
            :unlink="board.unlinkBlocker"
            :find-issue="findIssue"
            @close="selectedId = null"
            @select="selectedId = $event"
          />
          <MilestoneDetail
            v-else-if="selectedMilestone"
            :key="selectedMilestone.id"
            class="pointer-events-auto max-h-full overflow-y-auto"
            :row="selectedMilestone"
            @close="selectedId = null"
          />
        </div>
      </div>

      <button
        v-if="board.hasNextPage"
        type="button"
        :disabled="board.loading"
        class="mt-3 self-start rounded border border-gray-300 px-4 py-2 disabled:opacity-50"
        @click="board.loadMore()"
      >
        {{ board.loading ? 'Loading…' : `Load more (${board.totalCount - board.tasks.length} remaining)` }}
      </button>
    </div>

    <p v-else-if="board.repo && !board.loading && !board.error" class="mt-6 text-sm text-gray-600">
      No open {{ issueNoun }} in {{ board.repo.owner }}/{{ board.repo.name }}.
      <template v-if="unknownType">
        This repository has no “{{ loadedType }}” type; it has {{ board.issueTypes.join(', ') }}.
      </template>
    </p>

  </section>
</template>
