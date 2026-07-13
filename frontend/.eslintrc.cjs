/* ESLint FE-1. Incluye los gates de disciplina de design system (FR-017 / SC-008a):
   (b) prohibir style={{…}} inline en JSX; (c) prohibir literales de color/tamaño en .ts/.tsx fuera de src/ui/. */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18' } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', 'src/api/generated', 'node_modules'],
  rules: {
    // FR-017b: nada de estilos inline con literales en JSX.
    'react/forbid-dom-props': ['error', { forbid: ['style'] }],
    'react/forbid-component-props': ['error', { forbid: ['style'] }],
  },
  overrides: [
    {
      // FR-017c: prohibir literales de color/tamaño fuera de src/ui/ (deben salir de tokens).
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/ui/**'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/], Literal[value=/^\\d+(?:px|rem|em)$/]",
            message:
              'FR-017c: color/tamaño literal fuera de src/ui/. Usa un token del design system.',
          },
        ],
      },
    },
    {
      files: ['tests/**/*.{ts,tsx}', 'mocks/**/*.ts'],
      rules: { 'react/forbid-dom-props': 'off' },
    },
  ],
};
