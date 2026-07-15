import type { OrderStatus } from '../api/types';

// Orden del ciclo de vida (FSM). `satisfies` obliga a cubrir los 5 estados; si el contrato añade uno, falla.
const STEPS = [
  { status: 'draft', label: 'Borrador' },
  { status: 'assigned', label: 'Asignada' },
  { status: 'in_progress', label: 'En curso' },
  { status: 'pending_review', label: 'En revisión' },
  { status: 'closed', label: 'Cerrada' },
] as const satisfies ReadonlyArray<{ status: OrderStatus; label: string }>;

const STATE_TEXT = {
  done: 'completado',
  current: 'actual',
  upcoming: 'pendiente',
} as const;

// FE-5 (017) · Stepper del ciclo de vida de la orden (FR-006). Componente de presentación PURO: recibe el
// estado ya autorizado por props; sin fetch ni datos fuera de alcance (FR-014). El estado de cada paso se
// comunica TAMBIÉN por texto (no solo color/posición): etiqueta accesible «(actual/completado/pendiente)»
// y aria-current en el paso actual (WCAG 1.4.1).
export function Stepper({ status }: { status: OrderStatus }) {
  const currentIndex = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="stepper" aria-label="Estado de la orden">
      {STEPS.map((step, i) => {
        const kind = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
        return (
          <li
            key={step.status}
            className={`stepper__step stepper__step--${kind}`}
            aria-current={kind === 'current' ? 'step' : undefined}
          >
            <span className="stepper__dot" aria-hidden="true" />
            <span className="stepper__label">{step.label}</span>
            <span className="stepper__state"> ({STATE_TEXT[kind]})</span>
          </li>
        );
      })}
    </ol>
  );
}
