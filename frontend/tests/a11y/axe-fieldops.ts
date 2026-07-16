// FE-8 (022) · T002/T024 · Punto único de configuración de a11y para la suite (localizado según T002).
//
// FR-010/SC-005: excepción AA DOCUMENTADA y ACOTADA al acento-en-botón. El botón primario (`.btn--primary`)
// usa el acento vivo del artifact (#DC5A24 claro / #FF7A45 oscuro) con texto blanco de forma LITERAL,
// ~3.4:1 en claro (por debajo de AA 4.5:1 de texto). Es la ÚNICA superficie con excepción de contraste;
// el resto de la suite (todo lo demás) sigue exigiendo AA sin relajar el umbral (SC-004).
//
// La excepción es ACOTADA A LA REGLA `color-contrast` Y AL SELECTOR `.btn--primary`: se ejecuta axe con
// TODAS las reglas sobre TODO el contenedor (incluida color-contrast en el resto de la UI y TODAS las demás
// reglas —nombre accesible, ARIA, roles— sobre el propio botón) y solo se SUPRIMEN, en post-proceso, las
// violaciones de `color-contrast` cuyos nodos apuntan al botón primario. Así no se silencia ninguna otra
// regla sobre los botones ni color-contrast en ningún otro elemento (cierra el hallazgo G3 I-001). Todos
// los tests de axe importan `axe` desde AQUÍ para centralizar la excepción en un único punto anotado.
import AxeCore from 'axe-core';

const AA_EXCEPTION_SELECTOR = '.btn--primary'; // FR-010: único selector exento, y SOLO de color-contrast.

export async function axe(container: Element): Promise<AxeCore.AxeResults> {
  const results = await AxeCore.run({ include: [container] }, {});
  results.violations = results.violations
    .map((v) => {
      if (v.id !== 'color-contrast') return v;
      // Quita solo los nodos del botón primario; el resto de fallos de contraste se conservan.
      const nodes = v.nodes.filter(
        (n) => !n.target.some((t) => typeof t === 'string' && t.includes(AA_EXCEPTION_SELECTOR)),
      );
      return { ...v, nodes };
    })
    .filter((v) => v.nodes.length > 0);
  return results;
}
