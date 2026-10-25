import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // ── Fichiers ignorés ──────────────────────────────────────────────
  { ignores: ['node_modules', 'dist', 'frontend/dist', 'var', 'vendor', 'ms-playwright', '.npm-cache'] },

  // ── Base : backend + shared (Node.js) ─────────────────────────────
  {
    files: ['backend/**/*.ts', 'shared/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: { project: './tsconfig.json' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },

  // ── Scripts CLI backend (console.log autorisé) ────────────────────
  {
    files: ['backend/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // ── Logger HTTP (console.log intentionnel pour JSON stdout) ───────
  {
    files: ['backend/src/http/logger.ts', 'backend/src/server.ts'],
    rules: { 'no-console': 'off' },
  },

  // ── Frontend (React / navigateur) ─────────────────────────────────
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { project: './frontend/tsconfig.json', ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Le pattern setLoading(true) au début d'un useEffect de fetch est sûr et
      // très courant ; la règle de react-hooks v7 est trop stricte pour ce cas.
      'react-hooks/set-state-in-effect': 'off',
      // Date.now() dans le rendu n'est pas un effet de bord dangereux ici.
      'react-hooks/purity': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
);
