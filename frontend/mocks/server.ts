import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Servidor MSW para tests (Node/jsdom).
export const server = setupServer(...handlers);
