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
import { computed, onMounted, ref, watch } from 'vue'
import { useBoardStore } from '../../app/stores/board'
import { useSettingsStore } from '../../app/stores/settings'
import ChartSkeleton from '../components/ChartSkeleton.vue'
import ErrorBanner from '../components/ErrorBanner.vue'
import GanttChart from '../components/GanttChart.vue'
import GraphNotice from '../components/GraphNotice.vue'
import RepoHelp from '../components/RepoHelp.vue'
import TaskDetail from '../components/TaskDetail.vue'
import type { TaskId } from '../../domain/Task'

const board = useBoardStore()
const settings = useSettingsStore()

const owner = ref(settings.lastOwner)
const name = ref(settings.lastRepo)
const issueType = ref(settings.issueType)
const selectedId = ref<TaskId | null>(null)

// Read from the unpruned tasks: the panel lists every blocker GitHub reports,
// including those the graph drops.
const selectedTask = computed(() => board.tasks.find((task) => task.id === selectedId.value) ?? null)

// A reload or a different repository can take the selected task away.
watch(selectedTask, (task) => {
  if (!task) selectedId.value = null
})

const warnedTasks = computed(() => board.graph.tasks.filter((task) => task.warnings.length > 0).length)
const canLoad = computed(() => owner.value.trim() !== '' && name.value.trim() !== '')
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

async function onLoad() {
  if (!canLoad.value) return
  settings.lastOwner = owner.value.trim()
  settings.lastRepo = name.value.trim()
  settings.issueType = issueType.value.trim()
  await board.loadRepo(owner.value, name.value, issueType.value)
}

onMounted(() => {
  // Settings come back on reload; the token deliberately does not.
  if (canLoad.value) void onLoad()
})
</script>

<template>
  <section>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="onLoad">
      <div>
        <div class="flex items-center">
          <label for="owner" class="text-sm font-medium">Owner</label>
          <RepoHelp />
        </div>
        <input
          id="owner"
          v-model="owner"
          required
          placeholder="frappe"
          class="mt-1 rounded border border-gray-300 px-3 py-2"
        >
      </div>
      <div>
        <label for="repo" class="block text-sm font-medium">Repository</label>
        <input
          id="repo"
          v-model="name"
          required
          placeholder="gantt"
          class="mt-1 rounded border border-gray-300 px-3 py-2"
        >
      </div>
      <div>
        <label for="issue-type" class="block text-sm font-medium">Type</label>
        <input
          id="issue-type"
          v-model="issueType"
          list="issue-types"
          placeholder="All types"
          class="mt-1 w-36 rounded border border-gray-300 px-3 py-2"
        >
        <!-- Suggestions from the loaded repository; free text still works. -->
        <datalist id="issue-types">
          <option v-for="type in board.issueTypes" :key="type" :value="type" />
        </datalist>
      </div>
      <button
        type="submit"
        :disabled="board.loading || !canLoad"
        class="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {{ board.loading ? 'Loading…' : 'Load' }}
      </button>

      <div class="ml-auto">
        <label for="view-mode" class="block text-sm font-medium">Scale</label>
        <select
          id="view-mode"
          v-model="settings.viewMode"
          class="mt-1 rounded border border-gray-300 px-3 py-2"
        >
          <option v-for="mode in settings.viewModes" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </div>
    </form>

    <ErrorBanner :message="board.error" @dismiss="board.error = null" />

    <ChartSkeleton v-if="isFirstLoad" />

    <div v-else-if="board.tasks.length" class="mt-6">
      <p class="text-sm text-gray-600" aria-live="polite">
        Showing {{ board.graph.tasks.length }} of {{ board.totalCount }} open {{ issueNoun }}.
      </p>

      <GraphNotice
        :dropped-edges="board.graph.droppedEdges"
        :broken-cycles="board.graph.brokenCycles"
        :warned-tasks="warnedTasks"
      />

      <div class="relative mt-3">
        <GanttChart
          :tasks="board.graph.tasks"
          :view-mode="settings.viewMode"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />
        <!-- Outside the chart's scroll container so it stays put, and just
             below the date header so the dates stay readable. -->
        <!-- Keyed by task, so choosing another bar starts a fresh form. -->
        <TaskDetail
          v-if="selectedTask"
          :key="selectedTask.id"
          class="absolute right-3 top-24 z-10"
          :task="selectedTask"
          :tasks="board.tasks"
          :editability="board.dateEditability"
          :save="(changes) => board.saveDates(selectedTask!.id, changes)"
          :link="board.linkBlocker"
          :unlink="board.unlinkBlocker"
          @close="selectedId = null"
          @select="selectedId = $event"
        />
      </div>

      <button
        v-if="board.hasNextPage"
        type="button"
        :disabled="board.loading"
        class="mt-4 rounded border border-gray-300 px-4 py-2 disabled:opacity-50"
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
