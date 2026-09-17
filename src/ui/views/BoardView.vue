<script setup lang="ts">
import { format } from 'date-fns'
import { ref } from 'vue'
import { useBoardStore } from '../../app/stores/board'

const board = useBoardStore()

const owner = ref('frappe')
const name = ref('gantt')

const day = (date: Date) => format(date, 'yyyy-MM-dd')

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
    </form>

    <p v-if="board.error" role="alert" class="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {{ board.error }}
    </p>

    <div v-if="board.tasks.length" class="mt-6">
      <p class="text-sm text-gray-600">
        Showing {{ board.tasks.length }} of {{ board.totalCount }} open issues.
        <span v-if="board.graph.droppedEdges">
          {{ board.graph.droppedEdges }} dependencies point to issues outside this view.
        </span>
        <span v-if="board.graph.brokenCycles">
          {{ board.graph.brokenCycles }} circular dependencies ignored.
        </span>
      </p>

      <table class="mt-3 w-full text-left text-sm">
        <thead class="border-b border-gray-300 text-gray-600">
          <tr>
            <th class="py-2 pr-3">#</th>
            <th class="py-2 pr-3">Title</th>
            <th class="py-2 pr-3">Start</th>
            <th class="py-2 pr-3">Due</th>
            <th class="py-2 pr-3">Blocked by</th>
            <th class="py-2">Warnings</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in board.graph.tasks" :key="task.id" class="border-b border-gray-100">
            <td class="py-2 pr-3 tabular-nums">{{ task.number }}</td>
            <td class="py-2 pr-3">
              <a :href="task.url" target="_blank" rel="noopener noreferrer" class="underline">{{ task.title }}</a>
            </td>
            <td class="py-2 pr-3 tabular-nums">{{ day(task.start) }}</td>
            <td class="py-2 pr-3 tabular-nums">{{ day(task.due) }}</td>
            <td class="py-2 pr-3 tabular-nums">{{ task.dependsOn.length }}</td>
            <td class="py-2 text-amber-700">{{ task.warnings.join(' ') }}</td>
          </tr>
        </tbody>
      </table>

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
