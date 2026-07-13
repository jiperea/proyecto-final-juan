// Caso de uso PURO (Constitution III): resume la incidencia con fidelidad y sin inventar/filtrar PII.
// No importa child_process/Prisma; el proveedor se inyecta por puerto. Determinista y testeable.
import { type DomainError, type Result, ok } from '../result';
import { hasStructuredPii, redactStructured } from './pii-redactor';
import type { AiSummaryProviderPort, IncidentSource, PromptInput } from './summary-ports';

// Cota del resumen (FR-014). Un resumen conforme tiene ≤ MAX_SUMMARY_CHARS.
export const MAX_SUMMARY_CHARS = 1200;

export interface SummarizeThresholds {
  readonly minNotesChars: number; // FR-015: nº mínimo de caracteres no-whitespace en notas crudas
  readonly minEvidence: number; // FR-015: nº mínimo de evidencia
}

export interface SummarizeIncidentDeps {
  readonly provider: AiSummaryProviderPort;
  readonly thresholds: SummarizeThresholds;
}

export interface SummarizeIncidentInput {
  readonly source: IncidentSource; // ya resuelta (visibilidad/ciclo) por el handler vía IncidentSourcePort
}

// Outcome de éxito/negocio (el `denied`/`error` los gobierna el handler). Precedencia K3/H-001.
export type SummaryOutcome = 'success' | 'fallback_insufficient' | 'blocked_pii';

export interface SummaryResult {
  readonly summary: string | null;
  readonly sufficient: boolean;
  readonly outcome: SummaryOutcome;
}

const FALLBACK: SummaryResult = { summary: null, sufficient: false, outcome: 'fallback_insufficient' };
const BLOCKED: SummaryResult = { summary: null, sufficient: false, outcome: 'blocked_pii' };

// Longitud en CODE POINTS (I-003: convención del boundary; no unidades UTF-16). Evita divergencias con
// caracteres astrales (emoji) tanto en el umbral FR-015 como en la cota FR-014.
function codePointLength(text: string): number {
  return [...text].length;
}

// Longitud de contenido "sustantivo" = caracteres no-whitespace (FR-015, sobre notas CRUDAS pre-redacción).
function nonWhitespaceLength(text: string): number {
  return codePointLength(text.replace(/\s/gu, ''));
}

export async function summarizeOrderIncident(
  deps: SummarizeIncidentDeps,
  input: SummarizeIncidentInput,
): Promise<Result<SummaryResult, DomainError>> {
  const { source } = input;

  // (1) Umbral determinista FR-015 (Constitution VIII), sobre notas CRUDAS (K4) — SIN llamar al proveedor.
  const notesOk = nonWhitespaceLength(source.notes) >= deps.thresholds.minNotesChars;
  const evidenceOk = source.evidence.count >= deps.thresholds.minEvidence;
  if (!notesOk || !evidenceOk) {
    return ok(FALLBACK); // corto-circuito determinista (FR-002 caso 1)
  }

  // (2) Minimización de PII estructurada ANTES del proveedor (FR-003b). La serialización nonce-delimitada
  // (FR-016) la aplica el adaptador infra a partir de este PromptInput.
  const promptInput: PromptInput = {
    notesRedacted: redactStructured(source.notes),
    evidence: source.evidence,
  };

  // (3) Proveedor por puerto. Timeout/fallo de proceso → err(SERVICE_UNAVAILABLE) → 503 (el handler lo mapea).
  const generated = await deps.provider.generate(promptInput);
  if (!generated.ok) {
    return generated; // propaga DomainError (SERVICE_UNAVAILABLE)
  }

  // (4) Validación de salida y clasificación con precedencia blocked_pii > (longitud|vacío) (K3/H-001).
  const out = generated.value;
  if (out === null) {
    return ok(FALLBACK); // salida no conforme como JSON (malformado/campo ausente, H-003) → 200 fallback
  }
  if (!out.sufficient) {
    return ok(FALLBACK); // el proveedor declara insuficiente (FR-002 caso 2)
  }
  const summary = out.summary;
  if (hasStructuredPii(summary)) {
    return ok(BLOCKED); // seguridad: gana aunque además exceda 1200 o esté vacío
  }
  const trimmed = summary.trim();
  if (trimmed.length === 0 || codePointLength(summary) > MAX_SUMMARY_CHARS) {
    return ok(FALLBACK); // vacío tras trim (FR-010) o >1200 (FR-014) — colapsan en fallback_insufficient
  }
  return ok({ summary, sufficient: true, outcome: 'success' });
}
