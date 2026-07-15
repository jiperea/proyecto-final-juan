import { beforeAll, describe, expect, it, vi } from 'vitest';
import { evidenceRefSchema } from '../../src/api/schemas';
import { makeEvidenceItem, resolveContentType } from '../../src/features/orders/evidence';

beforeAll(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:preview');
  global.URL.revokeObjectURL = vi.fn();
});

function file(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('FE-2 · evidencia (metadato, object_ref UUID)', () => {
  it('acepta una imagen válida y genera object_ref UUID que cumple el contrato', () => {
    const res = makeEvidenceItem(file('foto.jpg', 'image/jpeg', 1024), []);
    expect(res.ok).toBe(true);
    expect(res.item!.ref.content_type).toBe('image/jpeg');
    expect(res.item!.ref.size_bytes).toBe(1024);
    // object_ref = UUID → valida contra el schema del contrato (SC-005)
    expect(() => evidenceRefSchema.parse(res.item!.ref)).not.toThrow();
    expect(res.item!.ref.object_ref).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('HEIC con file.type vacío: fallback por extensión (H-007)', () => {
    expect(resolveContentType(file('IMG_0001.HEIC', '', 2048))).toBe('image/heic');
  });

  it('rechaza content_type fuera de allowlist (INVALID_EVIDENCE tipo)', () => {
    const res = makeEvidenceItem(file('doc.pdf', 'application/pdf', 1024), []);
    expect(res).toEqual({ ok: false, error: 'INVALID_EVIDENCE_TYPE' });
  });

  it('rechaza tamaño fuera de rango (0 y >25 MiB)', () => {
    expect(makeEvidenceItem(file('a.png', 'image/png', 0), []).error).toBe('INVALID_EVIDENCE_SIZE');
    expect(makeEvidenceItem(file('b.png', 'image/png', 26214401), []).error).toBe('INVALID_EVIDENCE_SIZE');
  });

  it('detecta el mismo fichero ya añadido (dedup best-effort)', () => {
    const f = file('foto.jpg', 'image/jpeg', 1024);
    const first = makeEvidenceItem(f, []);
    const second = makeEvidenceItem(f, [first.item!]);
    expect(second).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('dos ficheros distintos → object_ref distintos (sin colisión falsa, H-003)', () => {
    const a = makeEvidenceItem(file('a.jpg', 'image/jpeg', 1024), []);
    const b = makeEvidenceItem(file('b.jpg', 'image/jpeg', 1024), [a.item!]);
    expect(b.ok).toBe(true);
    expect(a.item!.ref.object_ref).not.toBe(b.item!.ref.object_ref);
  });

  it('rechaza al superar el máximo de 10', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeEvidenceItem(file(`f${i}.jpg`, 'image/jpeg', 10), []).item!);
    expect(makeEvidenceItem(file('extra.jpg', 'image/jpeg', 10), items).error).toBe('MAX_ITEMS');
  });
});
