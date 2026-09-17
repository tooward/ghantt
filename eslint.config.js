import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

const RAW_GITHUB_TYPES = '**/adapters/github/types*'

const restrict = (patterns) => ({
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    // The app is a browser-only SPA; tests run in Node.
    files: ['src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
  },

  // --- Layering rules (ARCHITECTURE.md §4). Dependencies point inward only.
  // Note: `no-restricted-imports` is not merged across config blocks — the last
  // matching block wins outright — so each block repeats every pattern that
  // applies to it, and blocks run general -> specific.
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/adapters/github/**'],
    ...restrict([RAW_GITHUB_TYPES]),
  },
  {
    files: ['src/ui/**/*.{ts,vue}'],
    ...restrict([RAW_GITHUB_TYPES, '**/adapters/**']),
  },
  {
    files: ['src/domain/**/*.ts'],
    ...restrict([RAW_GITHUB_TYPES, '**/adapters/**', '**/app/**', '**/ui/**', 'vue', 'pinia']),
  },
]
