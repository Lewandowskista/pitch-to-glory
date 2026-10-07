import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.npm-cache/**',
      '.claude/**',
      '.kilo/worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      ...hooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use a seedable engine RNG.',
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      // Browser-only globals: the engine must run unchanged in workers and Node.
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'location',
          'history',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'alert',
          'confirm',
          'prompt',
          'matchMedia',
          'getComputedStyle',
        ].map((name) => ({ name, message: 'The engine must not use browser globals.' })),
      ],
      'no-restricted-imports': [
        'error',
        {
          // The engine runs unchanged in workers and Node tests: no UI, storage or platform code.
          patterns: [
            'react',
            'react-*',
            'react-router*',
            'zustand*',
            'dexie',
            'pixi.js',
            'framer-motion',
            'howler',
            '**/platform',
            '**/platform/**',
            '**/store',
            '**/store/**',
            '**/persistence/**',
            '**/screens/**',
            '**/ui/**',
            '**/hooks/**',
            '**/workers/**',
          ],
        },
      ],
    },
  },
  prettier,
);
