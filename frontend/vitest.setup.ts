import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';
import { installMatchMedia } from './tests/viewport';

installMatchMedia();

// jsdom no implementa object URLs (los usa el preview de evidencia de FE-2).
if (!('createObjectURL' in URL)) {
  // @ts-expect-error jsdom stub
  URL.createObjectURL = () => 'blob:preview';
  // @ts-expect-error jsdom stub
  URL.revokeObjectURL = () => undefined;
}

// MSW: los handlers derivan de los contratos congelados (contract-first en cliente).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
