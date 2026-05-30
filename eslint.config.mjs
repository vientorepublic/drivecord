// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// eslint-plugin-prettier 는 사용하지 않습니다.
// 포매팅은 VS Code Prettier 익스텐션이 전담하고,
// eslint-config-prettier 가 Prettier 와 충돌하는 ESLint 규칙만 비활성화합니다.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
