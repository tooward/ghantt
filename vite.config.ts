import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// frappe-gantt's package `exports` map declares only "." (with a `style`
// condition), so a deep import of its stylesheet is not resolvable by name.
// Aliasing the one path keeps the import readable and the file un-vendored.
const frappeGanttCss = fileURLToPath(
  new URL('./node_modules/frappe-gantt/dist/frappe-gantt.css', import.meta.url),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      'frappe-gantt/dist/frappe-gantt.css': frappeGanttCss,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup/jsdom-svg.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      reporter: ['text', 'json-summary'],
    },
  },
})
