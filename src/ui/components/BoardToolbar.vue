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
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useBoardStore } from '../../app/stores/board'
import { useSettingsStore } from '../../app/stores/settings'
import RepoHelp from './RepoHelp.vue'

/**
 * The strip under the header: what is charted, behind a button that slides
 * down the Owner / Repository / Type form, and the chart's scale.
 */
const board = useBoardStore()
const settings = useSettingsStore()

const owner = ref(settings.lastOwner)
const name = ref(settings.lastRepo)
const issueType = ref(settings.issueType)

const canLoad = computed(() => owner.value.trim() !== '' && name.value.trim() !== '')

// Open on first use, when there is nothing to chart yet.
const open = ref(!canLoad.value)
const ownerInput = useTemplateRef<HTMLInputElement>('ownerInput')

/** "shieldedtech/product · Feature", from what is loaded rather than what is typed. */
const summary = computed(() => {
  const repo = board.repo
  if (!repo) return null
  return { repo: `${repo.owner}/${repo.name}`, type: repo.issueType || 'All types' }
})

async function toggle(): Promise<void> {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    ownerInput.value?.focus()
  }
}

async function onLoad(): Promise<void> {
  if (!canLoad.value) return
  settings.lastOwner = owner.value.trim()
  settings.lastRepo = name.value.trim()
  settings.issueType = issueType.value.trim()
  await board.loadRepo(owner.value, name.value, issueType.value)
  // Stay open on failure, so the fields can be corrected.
  if (!board.error) open.value = false
}

onMounted(() => {
  // Settings come back on reload; the token deliberately does not.
  if (canLoad.value) void onLoad()
})
</script>

<template>
  <div class="border-b border-gray-200 bg-gray-50">
    <div class="flex items-center gap-3 px-6 py-2">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
        :aria-expanded="open"
        aria-controls="board-source-panel"
        @click="toggle"
      >
        <template v-if="summary">
          <span class="truncate font-medium">{{ summary.repo }}</span>
          <span class="text-gray-400" aria-hidden="true">·</span>
          <span class="truncate text-gray-600">{{ summary.type }}</span>
        </template>
        <span v-else class="font-medium">Choose repository</span>
        <svg
          viewBox="0 0 20 20"
          class="h-4 w-4 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none"
          :class="open ? 'rotate-180' : ''"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
        </svg>
      </button>
      <button
        v-if="board.repo"
        type="button"
        class="rounded border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        aria-label="Refresh"
        title="Download the issues again"
        :disabled="board.loading"
        @click="board.refresh()"
      >
        <!-- Heroicons arrow-path (MIT). Spins while loading. -->
        <svg
          viewBox="0 0 20 20"
          class="h-4 w-4 motion-reduce:animate-none"
          :class="board.loading ? 'animate-spin' : ''"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
          />
        </svg>
      </button>
      <span v-if="board.loading" class="text-sm text-gray-500" aria-live="polite">Loading…</span>

      <div class="ml-auto flex items-center gap-2">
        <label for="view-mode" class="text-sm text-gray-600">Scale</label>
        <select
          id="view-mode"
          v-model="settings.viewMode"
          class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
        >
          <option v-for="mode in settings.viewModes" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </div>
    </div>

    <!-- Slides by animating the row from 0fr to 1fr, so no height is hard-coded.
         Inert while closed, so Tab never reaches fields that cannot be seen.
         Vue renders `:inert="false"` as the attribute inert="false", which
         browsers read as inert, so it is removed outright when open. -->
    <div
      id="board-source-panel"
      class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="open ? undefined : true"
      @keydown.esc="open = false"
    >
      <div class="overflow-hidden">
        <form class="flex flex-wrap items-end gap-3 px-6 pb-4 pt-2" @submit.prevent="onLoad">
          <div>
            <div class="flex items-center">
              <label for="owner" class="text-sm font-medium">Owner</label>
              <RepoHelp />
            </div>
            <input
              id="owner"
              ref="ownerInput"
              v-model="owner"
              required
              placeholder="frappe"
              class="mt-1 rounded border border-gray-300 bg-white px-3 py-2"
            >
          </div>
          <div>
            <label for="repo" class="block text-sm font-medium">Repository</label>
            <input
              id="repo"
              v-model="name"
              required
              placeholder="gantt"
              class="mt-1 rounded border border-gray-300 bg-white px-3 py-2"
            >
          </div>
          <div>
            <label for="issue-type" class="block text-sm font-medium">Type</label>
            <input
              id="issue-type"
              v-model="issueType"
              list="issue-types"
              placeholder="All types"
              class="mt-1 w-36 rounded border border-gray-300 bg-white px-3 py-2"
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
        </form>
      </div>
    </div>
  </div>
</template>
