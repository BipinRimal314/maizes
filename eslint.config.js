import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // src-tauri/target holds Rust build output, including the frontend bundle
  // re-emitted as compressed blobs. Linting a build artifact is never useful.
  globalIgnores(['dist', 'src-tauri/target', 'src-tauri/gen']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }] },
  },
  {
    // tests and build scripts run in Node
    files: ['**/*.test.{js,jsx}', 'src/scripts/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
