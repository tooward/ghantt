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

<template>
  <div class="mt-3 animate-pulse space-y-3" aria-hidden="true">
    <div class="h-6 w-full rounded bg-gray-200" />
    <div v-for="row in 6" :key="row" class="flex items-center gap-3">
      <div class="h-4 w-40 rounded bg-gray-100" />
      <div
        class="h-6 rounded bg-gray-200"
        :style="{ width: `${25 + ((row * 37) % 50)}%`, marginLeft: `${(row * 23) % 30}%` }"
      />
    </div>
  </div>
</template>
