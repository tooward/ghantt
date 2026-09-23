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
import { useAuthStore } from '../app/stores/auth'
import { useBoardStore } from '../app/stores/board'
import BoardToolbar from './components/BoardToolbar.vue'
import RateLimitBadge from './components/RateLimitBadge.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import BoardView from './views/BoardView.vue'
import ConnectView from './views/ConnectView.vue'

const auth = useAuthStore()
const board = useBoardStore()

// The board's figure is the more recent one once issues start loading.
const rateLimit = computed(() => board.rateLimit ?? auth.rateLimit)

const finishing = ref(false)
const settingsOpen = ref(false)

async function onFinishRemember() {
  finishing.value = true
  try {
    await auth.finishRemember()
  } finally {
    finishing.value = false
  }
}

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
        <h1 class="flex items-center gap-2 text-lg font-semibold">
          <!-- GitHub's mark (Octicons, MIT), at the power button's 24px. -->
          <svg viewBox="0 0 16 16" class="h-6 w-6" fill="currentColor" aria-hidden="true">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          Ghantt
        </h1>
        <div v-if="auth.isConnected && auth.user" class="flex items-center gap-3 text-sm">
          <RateLimitBadge :rate-limit="rateLimit" />
          <img :src="auth.user.avatarUrl" alt="" class="h-6 w-6 rounded-full">
          <span>{{ auth.user.login }}</span>
          <!-- Gear and power share the avatar's 24px box. -->
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            @click="settingsOpen = true"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 hover:text-red-700"
            aria-label="Disconnect"
            title="Disconnect"
            @click="onDisconnect"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M7.05 6.4a8 8 0 1 0 9.9 0" />
              <path d="M12 3v9" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <BoardToolbar v-if="auth.isConnected" />

    <main class="mx-auto max-w-5xl px-6 pb-10 pt-6">
      <!-- "Remember" was asked for and could not be done (or not yet); say so
           where it will actually be read, which is after the view has switched. -->
      <p
        v-if="auth.persistenceNotice"
        role="status"
        class="mb-6 flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <span class="flex-1">{{ auth.persistenceNotice }}</span>
        <!-- Its own click: a second passkey prompt without a fresh gesture is
             rejected by browsers. -->
        <button
          v-if="auth.pendingPasskey"
          type="button"
          :disabled="finishing"
          class="shrink-0 rounded bg-amber-900 px-3 py-1 text-white disabled:opacity-50"
          @click="onFinishRemember"
        >
          {{ finishing ? 'Waiting for passkey…' : 'Use passkey' }}
        </button>
        <button type="button" class="shrink-0 underline" @click="auth.dismissPersistenceNotice()">
          Dismiss
        </button>
      </p>

      <ConnectView v-if="!auth.isConnected" />
      <BoardView v-else />
      <SettingsPanel v-if="auth.isConnected" v-model:open="settingsOpen" />
    </main>
  </div>
</template>
