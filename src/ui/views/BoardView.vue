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
import { computed, onMounted, ref } from 'vue'
import { useBoardStore } from '../../app/stores/board'
import { useSettingsStore } from '../../app/stores/settings'
import ChartSkeleton from '../components/ChartSkeleton.vue'
import ErrorBanner from '../components/ErrorBanner.vue'
import GanttChart from '../components/GanttChart.vue'
import GraphNotice from '../components/GraphNotice.vue'
import SettingsPanel from '../components/SettingsPanel.vue'

const board = useBoardStore()
const settings = useSettingsStore()

const owner = ref(settings.lastOwner)
const name = ref(settings.lastRepo)
const settingsOpen = ref(false)

const warnedTasks = computed(() => board.graph.tasks.filter((task) => task.warnings.length > 0).length)
const canLoad = computed(() => owner.value.trim() !== '' && name.value.trim() !== '')
const isFirstLoad = computed(() => board.loading && board.tasks.length === 0)

async function onLoad() {
  if (!canLoad.value) return
  settings.lastOwner = owner.value.trim()
  settings.lastRepo = name.value.trim()
  await board.loadRepo(owner.value, name.value)
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
        <label for="owner" class="block text-sm font-medium">Owner</label>
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
        Showing {{ board.graph.tasks.length }} of {{ board.totalCount }} open issues.
      </p>

      <GraphNotice
        :dropped-edges="board.graph.droppedEdges"
        :broken-cycles="board.graph.brokenCycles"
        :warned-tasks="warnedTasks"
      />

      <GanttChart class="mt-3" :tasks="board.graph.tasks" :view-mode="settings.viewMode" />

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
      No open issues in {{ board.repo.owner }}/{{ board.repo.name }}.
    </p>

    <SettingsPanel v-model:open="settingsOpen" />
  </section>
</template>
