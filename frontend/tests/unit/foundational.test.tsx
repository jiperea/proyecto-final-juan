import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatusBadge } from '../../src/ui/StatusBadge';
import { SkipLink } from '../../src/ui/SkipLink';
import { handleBfcachePageshow } from '../../src/app/bfcache';
import { getAccessToken, setAccessToken, setCurrentRole } from '../../src/api/session-store';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

afterEach(() => setAccessToken(null));

describe('Foundational · design system + a11y', () => {
  it('StatusBadge muestra color + etiqueta español (FR-007, WCAG 1.4.1)', () => {
    render(<StatusBadge status="pending_review" />);
    const badge = screen.getByText('En revisión');
    expect(badge).toHaveClass('badge--pending_review');
  });

  it('SkipLink apunta a #main (WCAG 2.4.1, FR-032)', () => {
    render(<SkipLink />);
    expect(screen.getByText('Saltar al contenido')).toHaveAttribute('href', '#main');
  });

  it('bfcache: pageshow persisted blanquea y, si el refresh falla, invalida la sesión (FR-030)', async () => {
    setAccessToken('stale');
    setCurrentRole('technician');
    server.use(http.post('/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));
    handleBfcachePageshow({ persisted: true });
    // blanqueo síncrono inmediato
    expect(document.documentElement.getAttribute('data-bfcache-blank')).toBe('true');
    await waitFor(() => expect(getAccessToken()).toBeNull()); // sesión invalidada
    await waitFor(() =>
      expect(document.documentElement.hasAttribute('data-bfcache-blank')).toBe(false),
    );
  });

  it('bfcache: pageshow no-persisted no hace nada', () => {
    handleBfcachePageshow({ persisted: false });
    expect(document.documentElement.hasAttribute('data-bfcache-blank')).toBe(false);
  });
});
