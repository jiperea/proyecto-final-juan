import { ok, type DomainError, type Result } from '../../domain/result';
import type { AiSummaryProviderPort, ProviderSummary, PromptInput } from '../../domain/ai/summary-ports';

// Proveedor MOCK determinista (AI_PROVIDER=mock): tests sin red/CLI. Devuelve un resumen conforme
// derivado de los metadatos (sin PII). Los tests que necesiten fallback/error/PII inyectan su propio
// puerto (override de deps.summaryDeps.provider), igual que el patrón de review-db-errors.
export class MockAiSummaryProvider implements AiSummaryProviderPort {
  generate(input: PromptInput): Promise<Result<ProviderSummary | null, DomainError>> {
    const summary = `Resumen de la incidencia: registrada con ${String(input.evidence.count)} evidencia(s).`;
    return Promise.resolve(ok({ summary, sufficient: true }));
  }
}
