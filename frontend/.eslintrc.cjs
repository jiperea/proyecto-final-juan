/* ESLint FE-1 + FE-6 (020). Gates de disciplina del design system (FR-017 / SC-008a):
   (b) prohibir style={{…}} inline en JSX; (c) prohibir literales de color/tamaño en .ts/.tsx fuera de src/ui/.
   FE-6 (020-front-architecture) añade, clasificadas `enforced` por el baseline (0 violaciones en src/ — ver
   docs/front-architecture.md §Baseline): regla (g) sin default exports, regla (b) exhaustive-deps como error,
   regla (j) las vistas no importan apiFetch directamente (solo la capa de datos).
   ALCANCE: las reglas (g) y (j) se acotan a `src/` (producción); los config files de tooling
   (vite/vitest/playwright) REQUIEREN default export y los tests pueden importar apiFetch → quedan fuera. */
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
  // FE-6 (FR-007a): el directorio de fixtures de lint se excluye del run principal (se lintan
  // programáticamente desde el test). Solo ese directorio; ninguna ruta de producción.
  ignorePatterns: ['dist', 'src/api/generated', 'node_modules', 'tests/lint-fixtures'],
  rules: {
    // FR-017b: nada de estilos inline con literales en JSX.
    'react/forbid-dom-props': ['error', { forbid: ['style'] }],
    'react/forbid-component-props': ['error', { forbid: ['style'] }],
    // FE-6 regla (b) `enforced` (baseline 0): dependencias completas en hooks (elevado de warn a error).
    // Global: los config/test files no tienen hooks, así que 0 violaciones.
    'react-hooks/exhaustive-deps': 'error',
  },
  overrides: [
    {
      // FE-6 reglas (g) y (j) `enforced`, acotadas a PRODUCCIÓN (todo src/, incl. src/ui).
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        // (g) sin default exports (espejo de la disciplina del backend).
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message: 'FE-6 regla (g): sin default exports. Usa un named export (ver docs/front-architecture.md).',
          },
        ],
        // (j) las vistas no llaman al cliente api directamente; usan hooks de api/. `ApiError` (tipo) sí se
        // permite; se restringe solo `apiFetch`.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/api/client'],
                importNames: ['apiFetch'],
                message:
                  'FE-6 regla (j): no importes apiFetch en vistas/componentes; usa un hook de la capa api/ ' +
                  '(ver docs/front-architecture.md).',
              },
            ],
          },
        ],
      },
    },
    {
      // FR-017c: prohibir literales de color/tamaño/fuente fuera de src/ui/. Este override REEMPLAZA
      // no-restricted-syntax para src/** no-ui, así que repite el selector de (g) para no perderlo.
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/ui/**'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message: 'FE-6 regla (g): sin default exports. Usa un named export (ver docs/front-architecture.md).',
          },
          {
            selector:
              "Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/], Literal[value=/^\\d+(?:px|rem|em)$/], Literal[value=/(serif|sans-serif|monospace)/]",
            message:
              'FR-017c: color/tamaño/fuente literal fuera de src/ui/. Usa un token del design system.',
          },
          {
            selector: "Property[key.name=/^(fontFamily|font)$/] > Literal",
            message: 'FR-017c: tipografía literal fuera de src/ui/. Usa el token --font-*.',
          },
        ],
      },
    },
    {
      // FE-6 regla (j): la CAPA DE DATOS sí puede importar apiFetch (es su responsabilidad).
      files: ['src/api/**', 'src/**/*-api.ts', 'src/**/use*.{ts,tsx}'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: ['tests/**/*.{ts,tsx}', 'mocks/**/*.ts'],
      rules: { 'react/forbid-dom-props': 'off' },
    },
  ],
};
