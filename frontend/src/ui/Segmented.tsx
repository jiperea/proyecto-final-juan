import type { KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  /** Nombre accesible del grupo (`aria-label` del `radiogroup`). */
  label: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

// FE-8 (022) · T008 · control segmentado accesible del artifact (FR-005/FR-005a/FR-011b): `radiogroup` +
// `radio` (solo una opción activa a la vez), navegable con flechas (roving tabindex), foco visible. El
// segmento ACTIVO es una píldora de SUPERFICIE (`--color-surface` + `--shadow-1` + `--color-text`), NO el
// acento vivo (fiel al artifact). Cualquier transición respeta `prefers-reduced-motion` (regla global de
// `tokens.css`). Componente de presentación PURO: sin fetch ni estado de negocio (recibe/emite valor).
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = options[(index + dir + options.length) % options.length];
    if (next) onChange(next.value);
  }

  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((opt, i) => {
        const checked = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="seg__option"
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
