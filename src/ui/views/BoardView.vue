<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoardStore } from '../../app/stores/board'
import { useSettingsStore, type ViewMode } from '../../app/stores/settings'
import GanttChart from '../components/GanttChart.vue'
import GraphNotice from '../components/GraphNotice.vue'

const board = useBoardStore()
const settings = useSettingsStore()

const owner = ref('frappe')
const name = ref('gantt')

const VIEW_MODES: ViewMode[] = ['Day', 'Week', 'Month']

const warnedTasks = computed(() => board.graph.tasks.filter((task) => task.warnings.length > 0).length)

async function onLoad() {
  if (!owner.value.trim() || !name.value.trim()) return
  await board.loadRepo(owner.value, name.value)
}
</script>

<template>
  <section>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="onLoad">
      <div>
        <label for="owner" class="block text-sm font-medium">Owner</label>
        <input id="owner" v-model="owner" class="mt-1 rounded border border-gray-300 px-3 py-2" >
      </div>
      <div>
        <label for="repo" class="block text-sm font-medium">Repository</label>
        <input id="repo" v-model="name" class="mt-1 rounded border border-gray-300 px-3 py-2" >
      </div>
      <button
        type="submit"
        :disabled="board.loading"
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
          <option v-for="mode in VIEW_MODES" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </div>
    </form>

    <p v-if="board.error" role="alert" class="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {{ board.error }}
    </p>

    <div v-if="board.tasks.length" class="mt-6">
      <p class="text-sm text-gray-600">
        Showing {{ board.tasks.length }} of {{ board.totalCount }} open issues.
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
        Load more
      </button>
    </div>

    <p v-else-if="board.repo && !board.loading && !board.error" class="mt-6 text-sm text-gray-600">
      No open issues in {{ board.repo.owner }}/{{ board.repo.name }}.
    </p>
  </section>
</template>
