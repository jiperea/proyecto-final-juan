import { useCallback, useMemo, useState } from 'react';
import type { Order } from '../../api/types';

export type OrderFilterSegment = 'active' | 'all';

export type OrderEmptyKind = 'none' | 'no-orders' | 'no-active' | 'no-matches';

export interface OrderFilterState {
  segment: OrderFilterSegment;
  term: string;
  setSegment: (next: OrderFilterSegment) => void;
  setTerm: (next: string) => void;
  clearTerm: () => void;
  filtered: Order[];
  emptyKind: OrderEmptyKind;
}

// Insensible a mayúsculas y a acentos (FR-007a/FR-011b): normaliza a NFD y descarta las marcas diacríticas.
function normalize(s: string): string {
  return s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Campos PRESENTES en el payload del rol (FR-007a): id (código), title (nombre de orden) y assigned_to
// (técnico) cuando no es null. No hay campo «cliente» en el contrato (Order) — se busca solo sobre lo
// que exista, sin inventar datos.
function matchesTerm(order: Order, normalizedTerm: string): boolean {
  const haystack = normalize([order.id, order.title, order.assigned_to ?? ''].join(' '));
  return haystack.includes(normalizedTerm);
}

// FE-8 (022) · T011 · estado UI-local de filtro (FR-005a/FR-007a/FR-011b), derivado (`useMemo`) del
// listado ya cargado — sin llamada adicional al backend. Precedencia: escribir un término mueve el
// segmento a «Todas» automáticamente (nunca queda inerte); al borrar el término, el segmento permanece
// donde estaba (controlable de nuevo por el usuario). Se re-deriva en cada refetch (depende de `orders`).
export function useOrderFilter(orders: Order[]): OrderFilterState {
  const [segment, setSegmentState] = useState<OrderFilterSegment>('active');
  const [term, setTermState] = useState('');

  const setTerm = useCallback((next: string) => {
    setTermState(next);
    if (next.trim() !== '') setSegmentState('all');
  }, []);

  const setSegment = useCallback(
    (next: OrderFilterSegment) => {
      // Con término activo, el segmentado nunca oculta coincidencias (FR-011b): ignora el intento de
      // volver a «Activas» mientras haya un término (la búsqueda ya cubre `closed`).
      if (term.trim() !== '' && next === 'active') return;
      setSegmentState(next);
    },
    [term],
  );

  const clearTerm = useCallback(() => setTermState(''), []);

  const filtered = useMemo(() => {
    const trimmed = term.trim();
    if (trimmed !== '') {
      const normalized = normalize(trimmed);
      return orders.filter((o) => matchesTerm(o, normalized));
    }
    return segment === 'active' ? orders.filter((o) => o.status !== 'closed') : orders;
  }, [orders, term, segment]);

  const emptyKind = useMemo<OrderEmptyKind>(() => {
    if (filtered.length > 0) return 'none';
    if (orders.length === 0) return 'no-orders';
    if (term.trim() !== '') return 'no-matches';
    if (segment === 'active') return 'no-active';
    return 'no-orders';
  }, [filtered, orders, term, segment]);

  return { segment, term, setSegment, setTerm, clearTerm, filtered, emptyKind };
}
