import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyChoice,
  getStoredChoice,
  persistChoice,
  setChoice,
  subscribeToStorage,
  THEME_STORAGE_KEY,
} from '../../src/ui/theme';

// FR-004/FR-004b/FR-016 · lógica del store de tema (SC-006/SC-007).
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme store', () => {
  it('sin elección previa → «system» (precedencia usuario>SO>claro delegada a CSS)', () => {
    expect(getStoredChoice()).toBe('system');
  });

  it('elegir claro/oscuro fija data-theme y persiste', () => {
    setChoice('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(getStoredChoice()).toBe('dark');
  });

  it('«system» elimina el atributo y borra la clave', () => {
    setChoice('dark');
    setChoice('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('escribe SOLO la clave de tema en localStorage (SC-007)', () => {
    setChoice('light');
    expect(Object.keys(localStorage)).toEqual([THEME_STORAGE_KEY]);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('valor inválido guardado → degrada a «system»', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getStoredChoice()).toBe('system');
  });

  it('si localStorage.setItem falla, aplica el tema en el DOM sin lanzar (FR-004b)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => setChoice('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sincroniza entre pestañas por el evento storage', () => {
    const onChange = vi.fn();
    const unsub = subscribeToStorage(onChange);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(onChange).toHaveBeenCalledWith('dark');
    unsub();
  });

  it('applyChoice/persistChoice son independientes (aplicar sin persistir)', () => {
    applyChoice('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    persistChoice('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
