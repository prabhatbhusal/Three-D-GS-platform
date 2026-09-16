import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  globalIgnores(['.next', 'dist', 'src/vendor/sdk/**', 'server/node_modules']),
  ...compat.extends('next/core-web-vitals', 'next/typescript')
]);
