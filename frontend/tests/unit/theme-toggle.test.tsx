import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../../src/ui/ThemeToggle';
import { THEME_STORAGE_KEY } from '../../src/ui/theme';

// FR-004b/SC-008 · conmutador accesible, refleja la elección, sin llamadas de red.
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.restoreAllMocks());

describe('ThemeToggle', () => {
  it('es un grupo accesible con las tres opciones y «Sistema» activa por defecto', () => {
    render(<ThemeToggle />);
    const group = screen.getByRole('group', { name: 'Tema de la interfaz' });
    expect(group).toBeInTheDocument();
    for (const name of ['Claro', 'Oscuro', 'Sistema']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('elegir «Oscuro» fija data-theme, persiste y marca aria-pressed', async () => {
    const u = userEvent.setup();
    render(<ThemeToggle />);
    await u.click(screen.getByRole('button', { name: 'Oscuro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('no realiza llamadas de red (SC-008)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const u = userEvent.setup();
    render(<ThemeToggle />);
    await u.click(screen.getByRole('button', { name: 'Claro' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
