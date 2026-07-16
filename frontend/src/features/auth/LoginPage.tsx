import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from './session';
import { ApiError } from '../../api/client';
import { INVALID_CREDENTIALS_MESSAGE } from '../../i18n/errors';
import { Button, TextField } from '../../ui';
import './auth.css';

// FR-001/002: login accesible. 401 → mensaje genérico «Credenciales no válidas» (no revela el campo).
export function LoginPage() {
  const { login, status } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/orders';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // S-001: un usuario ya autenticado no debe ver /login (guard tras los hooks, rules-of-hooks).
  if (status === 'authenticated') return <Navigate to="/orders" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await login(identifier, password);
      navigate(from, { replace: true });
    } catch (err) {
      // 401 → genérico sin revelar el campo (FR-002); otros errores → su mensaje mapeado (FR-015).
      if (err instanceof ApiError && err.status !== 401) setError(err.userMessage);
      else setError(INVALID_CREDENTIALS_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  // FE-8 (022) · T020 · hero centrado del preview (FR-009): marca «F» + wordmark + tagline, y debajo los
  // dos campos + botón «Entrar» ya existentes. «Iniciar sesión» se conserva como encabezado SECUNDARIO
  // (h2) del formulario — heredado de US1/FE-1, referenciado por otros tests (`getByRole('heading', {name:
  // 'Iniciar sesión'})` sin nivel) — el wordmark pasa a ser el h1 de la vista.
  return (
    <section className="login-hero">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <h1 className="login-hero__wordmark">FieldOps</h1>
      <p className="login-hero__tagline">Gestión de órdenes de campo, en cualquier pantalla.</p>
      <div className="login-hero__card">
        <h2>Iniciar sesión</h2>
        <form onSubmit={onSubmit} noValidate>
          <TextField
            label="Usuario o email"
            name="identifier"
            value={identifier}
            autoComplete="username"
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <TextField
            label="Contraseña"
            name="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </section>
  );
}
