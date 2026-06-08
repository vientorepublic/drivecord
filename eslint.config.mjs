// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// eslint-plugin-prettier is not used.
// Formatting is handled exclusively by the VS Code Prettier extension;
// eslint-config-prettier only disables ESLint rules that conflict with Prettier.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
