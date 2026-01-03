import {defineConfig, globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tsConfig from '@abhijithvijayan/eslint-config/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tsConfig({
    files: ['**/*.ts', '**/*.tsx'],
  }),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Wrangler temp files
    '.wrangler/**',
  ]),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-use-before-define': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'import-x/no-duplicates': 'off',
      'import-x/no-anonymous-default-export': 'off',
      'func-names': 'off',
    },
  },
]);

export default eslintConfig;
