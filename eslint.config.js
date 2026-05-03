import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      '.vite',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...jsxA11y.configs.recommended.rules,
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
    },
  },
  // Anti-cheat: AI module must not import hidden game state.
  // ai.ts may only import pure types/constants from src/game/types, src/game/constants,
  // and the publicView builder's exported public types — never engine, placement, or
  // anything that could leak hidden ship coordinates.
  {
    files: ['src/game/ai.ts', 'src/game/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '*/engine',
                '*/placement',
                '*/rules',
                '*/persistence',
                '*/stats',
                '*/components/*',
                '*/hooks/*',
                './engine',
                './placement',
                './rules',
                './persistence',
                './stats',
              ],
              message:
                'AI is anti-cheat: it must only import pure types/constants and PublicOpponentView. Engine, placement, rules, etc. expose hidden state.',
            },
          ],
        },
      ],
    },
  },
  // React components must not call the engine reducer or shot resolution rules
  // directly: they must dispatch actions through hooks. (Pure query helpers like
  // canPlaceShip / shipFootprint are fine — they read state, never mutate it.)
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/game/engine', '*/game/rules'],
              message:
                'Components must not call engine/rules directly. Dispatch actions via the useGame hook.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
