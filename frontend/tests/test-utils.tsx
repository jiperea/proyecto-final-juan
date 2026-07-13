import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { makeQueryClient } from '../src/api/../app/queryClient';
import { SessionProvider } from '../src/features/auth/session';

export function AllProviders({
  children,
  route = '/',
}: {
  children: ReactNode;
  route?: string;
}) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <SessionProvider>{children}</SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderApp(ui: ReactElement, route = '/') {
  return render(<AllProviders route={route}>{ui}</AllProviders>);
}
