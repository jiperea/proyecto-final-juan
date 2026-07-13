import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// Smoke test de Phase 1: prueba que el harness (Vitest + RTL + jsdom + MSW) arranca.
describe('harness', () => {
  it('renders and queries the DOM', () => {
    render(<h1>FieldOps</h1>);
    expect(screen.getByRole('heading', { name: 'FieldOps' })).toBeInTheDocument();
  });
});
