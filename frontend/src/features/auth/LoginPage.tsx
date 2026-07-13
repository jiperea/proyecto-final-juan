import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from './session';
import { ApiError } from '../../api/client';
import { INVALID_CREDENTIALS_MESSAGE } from '../../i18n/errors';
import { Button, TextField } from '../../ui';

// FR-001/002: login accesible. 401 → mensaje genérico «Credenciales no válidas» (no revela el campo).
export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/orders';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

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

  return (
    <section>
      <h1>Iniciar sesión</h1>
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
    </section>
  );
}
