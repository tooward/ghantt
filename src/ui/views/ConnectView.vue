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
  await auth.connect(token.value, remember.value, label.value.trim())
  token.value = ''
}

// Unlocking needs a click of its own: deriving the key prompts for the
// passkey, and a prompt nobody asked for is the pattern to avoid.
async function onUnlock() {
  await auth.unlock()
}
</script>

<template>
  <section class="mx-auto max-w-lg">
    <h2 class="text-xl font-semibold text-gray-900">Connect to GitHub</h2>
    <p class="mt-2 text-sm text-gray-600">
      Ghantt reads issues directly from your browser. Your token is sent only to
      <code class="rounded bg-gray-100 px-1">api.github.com</code> and never to any server of ours.
      <a href="/help.html" target="_blank" rel="noopener" class="underline">How to use Ghantt</a>
    </p>

    <div
      v-if="auth.hasRememberedToken"
      class="mt-6 rounded border border-gray-300 bg-gray-50 p-4"
    >
      <p class="text-sm text-gray-700">
        A token is remembered on this device, encrypted with a passkey.
      </p>
      <button
        type="button"
        :disabled="auth.status === 'connecting'"
        class="mt-3 rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        @click="onUnlock"
      >
        {{ auth.status === 'connecting' ? 'Unlocking…' : 'Unlock with passkey' }}
      </button>
    </div>

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

      <label v-if="auth.canRemember" class="flex items-start gap-2 text-sm text-gray-700">
        <input v-model="remember" type="checkbox" class="mt-1">
        <span>
          Remember this token on this device, encrypted with a passkey.
          <span class="block text-xs text-gray-500">
            You will be asked to create a passkey, and possibly to use it once more. Only the encrypted token is
            stored, and unlocking it later needs your fingerprint, face or PIN — so a script on this
            page cannot read it silently. With this off, the token is forgotten when you close the
            tab.
          </span>
        </span>
      </label>
      <p v-else class="text-xs text-gray-500">
        This browser cannot encrypt a stored token with a passkey, so the token will be forgotten
        when you close the tab.
      </p>

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
        with access to the repository you want to chart.
      </p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>
          Repository permissions → <strong>Issues: Read and write</strong> to change dates from the chart, or
          <strong>Read-only</strong> just to view it
        </li>
        <li>Repository permissions → <strong>Metadata: Read-only</strong></li>
        <li>Nothing else. The app only ever changes issue date fields.</li>
        <li>Set an expiry of <strong>90 days or less</strong>.</li>
      </ul>
    </div>
  </section>
</template>
