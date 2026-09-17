<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '../app/stores/auth'
import ConnectView from './views/ConnectView.vue'

const auth = useAuthStore()

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
          <span v-if="auth.rateLimit" class="text-gray-500">
            {{ auth.rateLimit.remaining }} API points left
          </span>
          <img :src="auth.user.avatarUrl" alt="" class="h-6 w-6 rounded-full">
          <span>{{ auth.user.login }}</span>
          <button type="button" class="underline" @click="auth.disconnect()">
            Disconnect
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-10">
      <ConnectView v-if="!auth.isConnected" />
      <p v-else class="text-sm text-gray-600">
        Connected as {{ auth.user?.login }}. Issue loading arrives in Phase 3.
      </p>
    </main>
  </div>
</template>
