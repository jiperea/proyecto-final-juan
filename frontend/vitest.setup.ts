import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';
import { installMatchMedia } from './tests/viewport';

installMatchMedia();

// MSW: los handlers derivan de los contratos congelados (contract-first en cliente).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
