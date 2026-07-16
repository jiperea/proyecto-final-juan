import { useEffect, useRef, useState } from 'react';
import { EVIDENCE_MAX_ITEMS } from '../../api/schemas';
import { Button } from '../../ui';
import { ADD_EVIDENCE_MESSAGE, makeEvidenceItem } from './evidence';
import type { EvidenceItem } from './evidence';

// FR-004: captura/validación de evidencia a nivel de metadato. Rechazo EN EL MOMENTO DE AÑADIR; preview
// del contenido real (object URL); eliminar por ítem (teclado, nombre accesible); límite 10; aviso honesto.
//
// FE-8 (022) · T021 · rejilla 3-col del preview (FR-008/H-004): el `<input type=file>` real queda oculto
// visualmente (`.visually-hidden`, sigue siendo el destino de `getByLabelText('Añadir foto')` heredado de
// FE-2); el tile visible es un `<button>` (rol nativo `button`, SIN `--color-accent-vivid` ni
// `--color-primary` — H-004: el «+» no es superficie de acento) que abre el picker. Píldora de requisito
// («✓ N, mínimo 1» / «0, mínimo 1») fiel al artifact.
export function EvidencePicker({
  items,
  onChange,
}: {
  items: EvidenceItem[];
  onChange: (next: EvidenceItem[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = items.length >= EVIDENCE_MAX_ITEMS;

  // Libera los object URL al desmontar (no dejar blobs colgando en memoria).
  useEffect(() => () => items.forEach((it) => URL.revokeObjectURL(it.previewUrl)), [items]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    let next = [...items];
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      const res = makeEvidenceItem(file, next);
      if (res.ok && res.item) next = [...next, res.item];
      else if (res.error) lastError = ADD_EVIDENCE_MESSAGE[res.error];
    }
    setError(lastError);
    onChange(next);
    if (inputRef.current) inputRef.current.value = ''; // permite re-seleccionar el mismo fichero
  }

  function remove(objectRef: string) {
    const gone = items.find((it) => it.ref.object_ref === objectRef);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    onChange(items.filter((it) => it.ref.object_ref !== objectRef));
    setError(null);
  }

  const requirementMet = items.length >= 1;

  return (
    <fieldset className="evidence">
      <legend>Evidencia (≥1 foto)</legend>

      <p className="evidence-requirement" data-met={requirementMet}>
        {requirementMet ? `✓ ${items.length}, mínimo 1` : `${items.length}, mínimo 1`}
      </p>

      <label className="visually-hidden" htmlFor="evidence-input">
        Añadir foto
      </label>
      <input
        ref={inputRef}
        id="evidence-input"
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        capture="environment"
        disabled={atMax}
        aria-describedby={atMax ? 'evidence-max' : error ? 'evidence-error' : undefined}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {atMax ? (
        <span id="evidence-max" className="field__error" role="status">
          Máximo {EVIDENCE_MAX_ITEMS} fotos alcanzado.
        </span>
      ) : null}
      {error ? (
        <span id="evidence-error" className="field__error" role="alert">
          {error}
        </span>
      ) : null}

      <ul className="evidence-grid" aria-label={`Evidencias añadidas: ${items.length}`}>
        {items.map((it, i) => (
          <li key={it.ref.object_ref} className="evidence-item">
            <img
              className="evidence-item__thumb"
              src={it.previewUrl}
              alt={`Foto ${i + 1} de ${items.length}: ${it.fileName}`}
            />
            <Button
              variant="secondary"
              onClick={() => remove(it.ref.object_ref)}
              aria-label={`Eliminar foto ${i + 1} de ${items.length}`}
            >
              Eliminar
            </Button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="evidence-add"
            disabled={atMax}
            onClick={() => inputRef.current?.click()}
          >
            <span aria-hidden="true">+</span>
            <span>Añadir foto</span>
          </button>
        </li>
      </ul>
    </fieldset>
  );
}
