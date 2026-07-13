import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshOnce } from '../../api/refresh';
import { invalidateSession, setCurrentRole, subscribeSession } from '../../api/session-store';
import type { SessionUser } from '../../api/types';
import * as authApi from './auth-api';

type BootStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionContextValue {
  status: BootStatus;
  user: SessionUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<BootStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const booted = useRef(false);

  function adopt(u: SessionUser) {
    setCurrentRole(u.role);
    setUser(u);
    setStatus('authenticated');
  }

  // Bootstrap (FR-023): al arrancar, refresh silencioso + me (con un reintento).
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let alive = true;
    void (async () => {
      const r = await refreshOnce();
      if (!alive) return;
      if (!r) {
        setStatus('anonymous');
        return;
      }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const me = await authApi.fetchMe();
          if (alive) adopt(me);
          return;
        } catch {
          if (attempt === 1 && alive) setStatus('anonymous');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Eventos del store (FR-005/029): invalidación → anónimo + purga; cambio de rol → purga + re-fetch me.
  useEffect(() => {
    return subscribeSession((e) => {
      qc.clear();
      if (e === 'invalidated') {
        setUser(null);
        setStatus('anonymous');
      } else if (e === 'role-changed') {
        void authApi
          .fetchMe()
          .then((me) => adopt(me))
          .catch(() => {
            setUser(null);
            setStatus('anonymous');
          });
      }
    });
  }, [qc]);

  const value: SessionContextValue = {
    status,
    user,
    login: async (identifier, password) => {
      // S-001: purga toda sesión/caché previa (epoch + queryClient.clear vía 'invalidated') antes de
      // adoptar la nueva identidad, para no filtrar datos entre cuentas en el mismo navegador.
      invalidateSession();
      const u = await authApi.login(identifier, password);
      adopt(u);
    },
    logout: async () => {
      await authApi.logout(); // invalidateSession() dispara 'invalidated' → handler pone anónimo + purga
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
