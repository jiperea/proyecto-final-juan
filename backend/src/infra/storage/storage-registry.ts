import type { PrismaClient } from '@prisma/client';
import type { StoragePort } from '../../domain/ports/storage';

// Registro auxiliar infra-only (024) que asocia el `StoragePort` construido por `container.ts` con el
// `PrismaClient` sobre el que se instancia (mismo proceso, misma BD). Permite que un repositorio
// instanciado FUERA del container (tests white-box, p. ej. `evidence-atomic-gc.spec.ts`) resuelva por
// defecto el MISMO almacenamiento que el container asoció a esa BD, sin tener que reconstruir config.
// Si no hay entrada (PrismaClient ajeno al container, p. ej. un Proxy de fault-injection en tests), el
// repositorio consumidor degrada con gracia (ver `order-write-side-repository.ts`).
const registry = new WeakMap<PrismaClient, StoragePort>();

export function registerStorageFor(prisma: PrismaClient, storage: StoragePort): void {
  registry.set(prisma, storage);
}

export function storageFor(prisma: PrismaClient): StoragePort | undefined {
  return registry.get(prisma);
}
