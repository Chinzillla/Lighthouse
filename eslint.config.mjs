import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['__tests__/**/*.{js,jsx}', 'setupTests.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  globalIgnores([
    '.next/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'node_modules/**',
    'out/**',
  ]),
]);

export default eslintConfig;
