import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setChoice } from '../../src/ui/theme';

// SC-006/H-014 · cambiar de tema es un swap de variables CSS en :root (atributo data-theme), NO remonta
// el subárbol → el elemento enfocado sigue enfocado.
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('preservación de foco al cambiar de tema', () => {
  it('el input enfocado sigue enfocado tras cambiar el tema', () => {
    render(<input aria-label="campo" />);
    const input = screen.getByLabelText('campo');
    input.focus();
    expect(document.activeElement).toBe(input);

    setChoice('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // El foco no se pierde porque no se remonta nada (solo cambia el atributo de la raíz).
    expect(document.activeElement).toBe(input);
  });
});
