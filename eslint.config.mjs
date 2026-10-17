import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['out/', 'dist/', 'node_modules/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/main/**/*.ts', '*.config.*'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['src/renderer/**/*.ts'],
        languageOptions: { globals: globals.browser },
    }
);
