// FE-6 fixture (regla g): un default export DEBE producir error de eslint. NO es código de producción;
// vive en tests/lint-fixtures/ (excluido del run principal) y se linta programáticamente desde el test.
export default function Bad() {
  return null;
}
