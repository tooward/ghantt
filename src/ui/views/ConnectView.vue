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
import { ref } from 'vue'
import { useAuthStore } from '../../app/stores/auth'

const auth = useAuthStore()

// Not used for authentication — it exists so password managers have a
// username field to pair with the token and will offer to save the credential.
const label = ref('')
const token = ref('')
const remember = ref(false)

// The user submits explicitly. Never auto-submit on paste or autofill:
// the whole point of the password-manager path is a deliberate gesture.
async function onSubmit() {
  if (!token.value.trim()) return
  await auth.connect(token.value, remember.value ? 'persistent' : 'session')
  token.value = ''
}
</script>

<template>
  <section class="mx-auto max-w-lg">
    <h2 class="text-xl font-semibold text-gray-900">Connect to GitHub</h2>
    <p class="mt-2 text-sm text-gray-600">
      gh-gantt reads issues directly from your browser. Your token is sent only to
      <code class="rounded bg-gray-100 px-1">api.github.com</code> and never to any server of ours.
    </p>

    <form class="mt-6 space-y-4" @submit.prevent="onSubmit">
      <div>
        <label for="gh-label" class="block text-sm font-medium text-gray-900">
          Label or GitHub username
        </label>
        <input
          id="gh-label"
          v-model="label"
          type="text"
          name="username"
          autocomplete="username"
          placeholder="your-github-login"
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        >
        <p class="mt-1 text-xs text-gray-500">
          Only so your password manager can find this credential again.
        </p>
      </div>

      <div>
        <label for="gh-token" class="block text-sm font-medium text-gray-900">
          Personal access token
        </label>
        <input
          id="gh-token"
          v-model="token"
          type="password"
          name="token"
          autocomplete="current-password"
          required
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono"
        >
      </div>

      <label class="flex items-start gap-2 text-sm text-gray-700">
        <input v-model="remember" type="checkbox" class="mt-1">
        <span>
          Remember this token on this device.
          <span class="block text-xs text-gray-500">
            Leave this off unless you need it — the token is then kept in browser storage, where
            any script running on this page could read it. With it off, the token is forgotten when
            you close the tab.
          </span>
        </span>
      </label>

      <button
        type="submit"
        :disabled="auth.status === 'connecting'"
        class="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {{ auth.status === 'connecting' ? 'Connecting…' : 'Connect' }}
      </button>
    </form>

    <p v-if="auth.error" role="alert" class="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {{ auth.error }}
    </p>

    <div class="mt-8 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      <h3 class="font-medium text-gray-900">Creating a token</h3>
      <p class="mt-2">
        Use a
        <a
          class="underline"
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noopener noreferrer"
        >fine-grained personal access token</a>
        with read-only access to the repository you want to chart.
      </p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>Repository permissions → <strong>Issues: Read-only</strong></li>
        <li>Repository permissions → <strong>Metadata: Read-only</strong></li>
        <li>Nothing else. This app never writes to GitHub.</li>
        <li>Set an expiry of <strong>90 days or less</strong>.</li>
      </ul>
    </div>
  </section>
</template>
