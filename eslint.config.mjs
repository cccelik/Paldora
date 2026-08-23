import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/.next/**',
      '**/.next-hosted/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      'no-duplicate-imports': 'error',
      'no-promise-executor-return': 'error',
      'no-useless-catch': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: [
      'apps/*/src/**/*.{ts,tsx}',
      'apps/web/app/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.*', '**/*.integration.test.*'],
    rules: {
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-lines-per-function': [
        'error',
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      'max-params': ['error', 5],
      'no-await-in-loop': 'error',
    },
  },
];
