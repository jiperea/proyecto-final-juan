// 024/025 · Tile de evidencia: disparador accesible («Ver imagen N de total») que abre el
// `EvidenceViewer` en su posición (click, Enter o Espacio — semántica nativa de `<button>`). Ya no
// gestiona su propio fetch/blob ni renderiza la imagen incrustada (024): el visor ampliado (025) se
// encarga del flujo fetch→blob y de su presentación a tamaño completo.
export function EvidenceTile({
  index,
  total,
  onOpen,
}: {
  index: number; // 1-based
  total: number;
  onOpen: () => void;
}) {
  const label = `Imagen ${index}`;

  return (
    <li className="order-detail__evidence-tile">
      <button
        type="button"
        className="order-detail__evidence-open"
        onClick={(e) => {
          // Foco explícito sobre el disparador (comportamiento nativo de click en navegadores reales;
          // jsdom no lo simula) — necesario para que el visor pueda capturar y devolver el foco aquí
          // al cerrarse (FR-003).
          e.currentTarget.focus();
          onOpen();
        }}
        aria-label={`Ver ${label.toLowerCase()} de ${total}`}
      >
        {label}
      </button>
    </li>
  );
}
