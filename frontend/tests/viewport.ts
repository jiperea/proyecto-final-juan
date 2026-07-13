// Mock controlable de matchMedia para tests de responsive (jsdom no lo implementa).
type Listener = (e: { matches: boolean }) => void;
const registry = new Map<string, Set<Listener>>();
let wide = false;

export function installMatchMedia(): void {
  window.matchMedia = (query: string) => {
    const matches = query.includes('min-width: 1024px') ? wide : false;
    const set = registry.get(query) ?? new Set<Listener>();
    registry.set(query, set);
    return {
      matches,
      media: query,
      addEventListener: (_: string, cb: Listener) => set.add(cb),
      removeEventListener: (_: string, cb: Listener) => set.delete(cb),
      addListener: (cb: Listener) => set.add(cb),
      removeListener: (cb: Listener) => set.delete(cb),
      dispatchEvent: () => true,
      onchange: null,
    } as unknown as MediaQueryList;
  };
}

// Simula un resize cruzando (o no) el breakpoint de 1024px.
export function setViewportWide(next: boolean): void {
  wide = next;
  for (const [query, set] of registry) {
    const matches = query.includes('min-width: 1024px') ? wide : false;
    for (const cb of set) cb({ matches });
  }
}
