// Flat config de ESLint que codifica el Principio XII de la constitution.
// Requiere (instalar en la fase de implementación):
//   npm i -D eslint typescript-eslint
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Constitution XII: cero `any` injustificado (usa `// JUSTIFICACIÓN:` y desactiva la regla en la línea)
      '@typescript-eslint/no-explicit-any': 'error',
      // Constitution XII: funciones <= 50 líneas, ficheros <= 300 líneas
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // Solo named exports
      'no-restricted-syntax': ['error', { selector: 'ExportDefaultDeclaration', message: 'Usa named exports (Constitution XII).' }],
    },
  },
  {
    // Regla de arquitectura hexagonal (Principio III): el dominio no importa infraestructura.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'express', message: 'domain/ no puede importar Express (Constitution III).' },
          { name: '@prisma/client', message: 'domain/ no puede importar Prisma (Constitution III).' },
        ],
        patterns: ['**/infra/**'],
      }],
    },
  },
);
