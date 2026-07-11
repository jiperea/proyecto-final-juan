import type { OrderRecord } from './model';
import type { OrderScope } from './scope-policy';

// Puerto de repositorio de órdenes (Constitution III). El dominio no depende de Prisma.
export interface OrderRepositoryPort {
  /** Devuelve las órdenes del alcance, ordenadas por created_at desc, id desc (FR-012). */
  listForScope(scope: OrderScope): Promise<OrderRecord[]>;
}
