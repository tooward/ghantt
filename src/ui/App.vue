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
import { computed, onMounted } from 'vue'
import { useAuthStore } from '../app/stores/auth'
import { useBoardStore } from '../app/stores/board'
import RateLimitBadge from './components/RateLimitBadge.vue'
import BoardView from './views/BoardView.vue'
import ConnectView from './views/ConnectView.vue'

const auth = useAuthStore()
const board = useBoardStore()

// The board's figure is the more recent one once issues start loading.
const rateLimit = computed(() => board.rateLimit ?? auth.rateLimit)

function onDisconnect() {
  board.clear()
  auth.disconnect()
}

onMounted(() => {
  // Only succeeds if the user previously ticked "remember".
  void auth.restore()
})
</script>

<template>
  <div class="min-h-screen bg-white text-gray-900">
    <header class="border-b border-gray-200">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <h1 class="text-lg font-semibold">
          gh-gantt
        </h1>
        <div v-if="auth.isConnected && auth.user" class="flex items-center gap-3 text-sm">
          <RateLimitBadge :rate-limit="rateLimit" />
          <img :src="auth.user.avatarUrl" alt="" class="h-6 w-6 rounded-full">
          <span>{{ auth.user.login }}</span>
          <button type="button" class="underline" @click="onDisconnect">
            Disconnect
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-10">
      <!-- "Remember" was asked for and could not be done safely; say so where
           it will actually be read, which is after the view has switched. -->
      <p
        v-if="auth.persistenceNotice"
        role="status"
        class="mb-6 flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <span class="flex-1">{{ auth.persistenceNotice }}</span>
        <button type="button" class="shrink-0 underline" @click="auth.persistenceNotice = null">
          Dismiss
        </button>
      </p>

      <ConnectView v-if="!auth.isConnected" />
      <BoardView v-else />
    </main>
  </div>
</template>
