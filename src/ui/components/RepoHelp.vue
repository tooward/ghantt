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
import { useTemplateRef } from 'vue'

// A native modal <dialog> gives focus trapping, Esc to close and an inert
// page behind it without any of that being reimplemented here.
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

function open() {
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

// A click whose target is the <dialog> itself landed on the backdrop, since
// the content fills the dialog's box.
function onDialogClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}
</script>

<template>
  <button
    type="button"
    class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 align-middle font-serif text-[10px] font-bold italic leading-none text-gray-600 hover:bg-gray-100"
    aria-label="What goes in Owner and Repository?"
    aria-haspopup="dialog"
    @click="open"
  >
    i
  </button>

  <dialog
    ref="dialog"
    aria-labelledby="repo-help-title"
    class="m-auto max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40"
    @click="onDialogClick"
  >
    <div class="p-5 text-sm text-gray-700">
      <h2 id="repo-help-title" class="text-base font-semibold text-gray-900">Owner and repository</h2>

      <p class="mt-3">
        Both come from the repository's URL:
        <code class="rounded bg-gray-100 px-1">github.com/<strong>owner</strong>/<strong>repo</strong></code>.
      </p>
      <p class="mt-2">
        The owner is the account the repository belongs to — a user or an organisation — not necessarily you.
        For <code class="rounded bg-gray-100 px-1">github.com/frappe/gantt</code>, the owner is
        <code class="rounded bg-gray-100 px-1">frappe</code> and the repository is
        <code class="rounded bg-gray-100 px-1">gantt</code>. Your own username only matters through the token.
      </p>

      <h3 class="mt-4 font-semibold text-gray-900">Organisation repositories</h3>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>
          When creating a fine-grained token, set <strong>Resource owner</strong> to the organisation, not your
          personal account, or the token cannot see its repositories.
        </li>
        <li>
          The organisation may require approval of fine-grained tokens. Until an admin approves it, the token shows
          as pending and requests fail.
        </li>
      </ul>

      <div class="mt-5 text-right">
        <button type="button" class="rounded bg-gray-900 px-4 py-2 text-white" @click="close">
          Close
        </button>
      </div>
    </div>
  </dialog>
</template>
