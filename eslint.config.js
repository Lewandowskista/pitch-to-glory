import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/**
 * Formatting goes through the locale seam (src/i18n/locale.ts, docs/ARCHITECTURE.md
 * "Localization"): no literal locale ('en', ['en-GB'], `en`) passed to an `Intl` constructor or
 * a `toLocale…String` call anywhere else, so a new language changes every number, date and
 * plural at once.
 */
const LOCALE_MESSAGE =
  'Format through src/i18n/locale.ts (formatNumber, formatMoney, formatDate, plural): no literal locales.';
/** A first argument written as a locale: a string, a template or an array of them. */
const LITERAL = ['Literal', 'TemplateLiteral', 'ArrayExpression'].map(
  (type) => `[arguments.0.type='${type}']`,
);
const localeSyntax = [
  "NewExpression[callee.object.name='Intl']",
  "CallExpression[callee.object.name='Intl']",
  'CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]',
].flatMap((call) => LITERAL.map((test) => ({ selector: call + test, message: LOCALE_MESSAGE })));
const randomSyntax = {
  selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
  message: 'Use a seedable engine RNG.',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-custom/**',
      'dist-next/**',
      'node_modules/**',
      'artifacts/**',
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
      'no-restricted-syntax': ['error', randomSyntax, ...localeSyntax],
    },
  },
  {
    // The locale seam itself, and the tests and scripts around the app.
    files: ['src/i18n/locale.ts'],
    rules: { 'no-restricted-syntax': ['error', randomSyntax] },
  },
  {
    files: ['e2e/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.{ts,mjs,js}'],
    rules: { 'no-restricted-syntax': ['error', ...localeSyntax] },
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
