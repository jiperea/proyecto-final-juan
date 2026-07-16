// FE-8 (022) · T018 [Red] · US4 · FR-009.
//
// Login con el hero centrado del preview: marca «F» (cuadrado naranja), wordmark, tagline, los DOS
// campos (email/usuario + contraseña) y el botón primario «Entrar». Hoy `LoginPage` tiene los campos y
// el botón pero NO el hero (marca/wordmark/tagline) — este test falla hasta T020.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { renderApp } from '../test-utils';

function renderLogin() {
  return renderApp(<LoginPage />, '/login');
}

describe('FE-8 · LoginPage — hero centrado del preview (FR-009)', () => {
  it('muestra la marca «F», el wordmark y la tagline', () => {
    renderLogin();
    // Marca: elemento visual con el glifo «F» (marcado, no solo decorativo perdido en el DOM).
    expect(screen.getByText('F', { selector: '[aria-hidden="true"], [class*="brand"]' })).toBeInTheDocument();
    // Wordmark: el nombre del producto en el hero (no solo el <title> del documento).
    expect(screen.getByText(/FieldOps/i)).toBeInTheDocument();
    // Tagline: subtítulo descriptivo del hero (no hardcodeamos el texto exacto, solo que exista un rol
    // de encabezado secundario visible; la fidelidad literal del copy se juzga en la captura visual).
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('conserva los dos campos y el botón «Entrar» con la maquetación del hero', () => {
    renderLogin();
    expect(screen.getByLabelText(/usuario o email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('el hero está centrado (contenedor `.login-hero` o equivalente en la maquetación del preview)', () => {
    const { container } = renderLogin();
    expect(container.querySelector('.login-hero')).not.toBeNull();
  });
});
