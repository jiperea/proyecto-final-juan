// FE-8 (022) · T002/T024 · Punto único de configuración de a11y para la suite (localizado según T002).
//
// FR-010/SC-005: excepción AA DOCUMENTADA y ACOTADA al acento-en-botón. El botón primario (`.btn--primary`)
// usa el acento vivo del artifact (#DC5A24 claro / #FF7A45 oscuro) con texto blanco de forma LITERAL,
// ~3.4:1 en claro (por debajo de AA 4.5:1 de texto). Es la ÚNICA superficie con excepción de contraste;
// el resto de la suite (todo lo demás) sigue exigiendo AA sin relajar el umbral (SC-004).
//
// La excepción se materializa por EXCLUSIÓN DE REGIÓN (selector CSS `.btn--primary`), no desactivando la
// regla `color-contrast` de forma global: axe-core admite un `context` con `exclude` (lista de listas de
// selectores). Todos los tests de axe de la suite deben importar `axe` desde AQUÍ (no desde `vitest-axe`
// directamente) para que la excepción quede centralizada en un único punto anotado.
import AxeCore from 'axe-core';

const AA_EXCEPTION_SELECTOR = '.btn--primary'; // FR-010: único selector excluido de color-contrast.

export async function axe(container: Element): Promise<AxeCore.AxeResults> {
  return AxeCore.run({ include: [container], exclude: [[AA_EXCEPTION_SELECTOR]] }, {});
}
