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
import { computed } from 'vue'
import type { RateLimitInfo } from '../../app/stores/auth'

const props = defineProps<{ rateLimit: RateLimitInfo | null }>()

// GitHub's GraphQL budget is 5,000 points an hour; one page costs one point.
const LOW_WATER_MARK = 250

const isLow = computed(() => (props.rateLimit?.remaining ?? Infinity) <= LOW_WATER_MARK)

const resetsAt = computed(() => {
  if (!props.rateLimit?.resetAt) return null
  const at = new Date(props.rateLimit.resetAt)
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString()
})
</script>

<template>
  <span
    v-if="rateLimit"
    class="rounded px-2 py-1 text-xs"
    :class="isLow ? 'bg-amber-100 text-amber-900' : 'text-gray-500'"
    :title="resetsAt ? `Resets at ${resetsAt}` : undefined"
  >
    {{ rateLimit.remaining }} API points left<template v-if="isLow && resetsAt">, resets {{ resetsAt }}</template>
  </span>
</template>
