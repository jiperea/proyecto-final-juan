import { useEffect, useState } from 'react';
import { getStoredChoice, setChoice, subscribeToStorage, THEME_CHOICES, type ThemeChoice } from './theme';

const LABELS: Record<ThemeChoice, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

// FE-5 (017) · Conmutador de tema (FR-004b). Muestra la ELECCIÓN (claro/oscuro/sistema), no el tema
// resuelto. Componente de presentación puro: su única E/S es el store de tema (theme.ts) — sin fetch
// ni datos de negocio (FR-014). Grupo de botones con aria-pressed (accesible por teclado, foco visible).
export function ThemeToggle() {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => getStoredChoice());

  useEffect(() => subscribeToStorage(setChoiceState), []);

  function select(next: ThemeChoice) {
    setChoice(next);
    setChoiceState(next);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Tema de la interfaz">
      {THEME_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          className="theme-toggle__option"
          aria-pressed={choice === c}
          onClick={() => select(c)}
        >
          {LABELS[c]}
        </button>
      ))}
    </div>
  );
}
