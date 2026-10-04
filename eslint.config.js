import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  globalIgnores(['.next', '.next-*', 'dist', 'src/vendor/sdk/**', 'server/node_modules']),
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Deliberate patterns: drop a field with `{ ip, ...rest }`, and name an argument
  // that must exist but isn't read `_x`.
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }] } }
]);
