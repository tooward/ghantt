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
import { computed, ref } from 'vue'
import type { RateLimitInfo } from '../../app/stores/auth'

const props = defineProps<{ rateLimit: RateLimitInfo | null }>()

/** GitHub's documented GraphQL budget, used only if a response omits `limit`. */
const DEFAULT_LIMIT = 5000
const DOCS_URL = 'https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api'

// Battery geometry, in SVG units: the body's inner width is what the charge fills.
const INNER_WIDTH = 18

const limit = computed(() => props.rateLimit?.limit ?? DEFAULT_LIMIT)

/** 0–1. Clamped: `remaining` can briefly exceed a stale limit, never below zero. */
const charge = computed(() => {
  if (!props.rateLimit) return 0
  return Math.min(Math.max(props.rateLimit.remaining / limit.value, 0), 1)
})

const level = computed<'ok' | 'low' | 'critical'>(() => {
  if (charge.value <= 0.1) return 'critical'
  if (charge.value <= 0.3) return 'low'
  return 'ok'
})

const fillColour = computed(() => ({ ok: '#16a34a', low: '#d97706', critical: '#dc2626' })[level.value])

// Any visible charge draws at least a sliver, so "nearly empty" never reads as "empty".
const fillWidth = computed(() => (charge.value === 0 ? 0 : Math.max(1, charge.value * INNER_WIDTH)))

const percent = computed(() => Math.round(charge.value * 100))

const resetsAt = computed(() => {
  if (!props.rateLimit?.resetAt) return null
  const at = new Date(props.rateLimit.resetAt)
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
})

const summary = computed(() =>
  props.rateLimit ? `GitHub API budget: ${props.rateLimit.remaining.toLocaleString()} of ${limit.value.toLocaleString()} points left` : '',
)

// Hover and keyboard focus open the card through CSS; a click pins it open,
// which is what a touch screen gets.
const pinned = ref(false)
</script>

<template>
  <div v-if="rateLimit" class="group relative" @keydown.esc="pinned = false">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-gray-100"
      :aria-label="summary"
      :aria-expanded="pinned"
      aria-controls="rate-limit-card"
      @click="pinned = !pinned"
    >
      <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
        <rect x="0.75" y="0.75" width="22.5" height="12.5" rx="2.5" fill="none" stroke="#6b7280" stroke-width="1.5" />
        <rect x="24.5" y="4.5" width="2.5" height="5" rx="1" fill="#6b7280" />
        <rect
          data-testid="battery-fill"
          x="3"
          y="3"
          :width="fillWidth"
          height="8"
          rx="1"
          :fill="fillColour"
        />
      </svg>
      <span v-if="level !== 'ok'" class="text-xs" :class="level === 'critical' ? 'text-red-700' : 'text-amber-800'">
        {{ percent }}%
      </span>
    </button>

    <!-- pt-2 rather than a margin: the padding keeps the pointer inside the
         group while it crosses from the button to the card. -->
    <div
      id="rate-limit-card"
      class="absolute right-0 top-full z-20 pt-2 group-hover:block group-focus-within:block"
      :class="pinned ? 'block' : 'hidden'"
    >
      <div role="status" class="w-64 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-lg">
        <p class="font-medium text-gray-900">
          {{ rateLimit.remaining.toLocaleString() }} of {{ limit.toLocaleString() }} API points left
        </p>
        <p v-if="resetsAt" class="mt-1">Refills to {{ limit.toLocaleString() }} at {{ resetsAt }}.</p>
        <p class="mt-1 text-xs text-gray-500">
          Each page of issues costs about one point. The budget belongs to your GitHub account, so other tools
          using it draw from the same pool.
        </p>
        <a :href="DOCS_URL" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block underline">
          How GitHub rate limits work ↗
        </a>
      </div>
    </div>
  </div>
</template>
