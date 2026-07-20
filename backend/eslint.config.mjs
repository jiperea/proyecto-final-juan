// ESLint flat config — Constitution XII (reglas de lint concretas)
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/handlers/contract/types.ts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'prisma/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // Cero `any` salvo con JUSTIFICACIÓN adyacente (Constitution XII)
      '@typescript-eslint/no-explicit-any': 'error',
      // Solo named exports (Constitution XII / Convenciones)
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Solo named exports (Constitution XII).' },
      ],
      // Tamaños: funciones <=50 líneas, ficheros <=300 líneas
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', 12],
    },
  },
  {
    // Los tests pueden tener funciones (describe/it) más largas
    files: ['tests/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // El dominio NO puede importar infraestructura (Constitution III) — verificado además por test T059
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['express', 'express/*'], message: 'domain/ no importa Express (hexagonal, Const. III).' },
            { group: ['@prisma/client', '../infra/*', '../../infra/*'], message: 'domain/ no importa Prisma/infra (Const. III).' },
            { group: ['jsonwebtoken', 'argon2', 'helmet'], message: 'domain/ no importa SDKs de infra (Const. III).' },
          ],
        },
      ],
    },
  },
);
