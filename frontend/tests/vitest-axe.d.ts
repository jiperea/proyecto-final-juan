/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
import 'vitest';

// Augmenta el matcher de vitest-axe para tsc (el runtime lo registra expect.extend).
interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
