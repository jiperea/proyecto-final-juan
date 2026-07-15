import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { makeQueryClient } from './app/queryClient';
import { SessionProvider } from './features/auth/session';
import { AppRoutes } from './routes/AppRoutes';
import { applyChoice, getStoredChoice, subscribeToStorage } from './ui/theme';
import './ui/tokens.css';
import './ui/components.css';

// FE-5 (FR-004b/H-002): aplica el tema elegido y sincroniza entre pestañas de forma GLOBAL (en todas las
// rutas, incluida /login), no acoplado al ciclo de vida del ThemeToggle del shell. El script inline de
// index.html ya lo aplicó pre-pintado; esto reafirma con la misma clave/util (fuente de verdad única).
applyChoice(getStoredChoice());
subscribeToStorage(() => {});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={makeQueryClient()}>
        <BrowserRouter>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
