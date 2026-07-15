import { useNavigate, Outlet } from 'react-router-dom';
import { useSession } from '../auth/session';
import { useRouteFocus } from '../../routes/focus';
import { Button, SkipLink, ThemeToggle } from '../../ui';
import './shell.css';

const ROLE_LABEL: Record<string, string> = {
  technician: 'Técnico',
  dispatcher: 'Despachador',
  supervisor: 'Supervisor',
};

// Shell responsive (FR-019/024/032): skip-link + landmarks header/nav/main. Muestra identidad+rol
// y «Cerrar sesión» (FR-001/005). El layout campo↔oficina lo deciden las vistas según el rol.
export function AppShell() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  useRouteFocus();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <SkipLink />
      <header className="shell__header">
        <span className="shell__brand">FieldOps</span>
        <div className="shell__identity">
          <ThemeToggle />
          {user ? (
            <>
              <span>
                {user.name} · {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <Button variant="secondary" onClick={onLogout}>
                Cerrar sesión
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
