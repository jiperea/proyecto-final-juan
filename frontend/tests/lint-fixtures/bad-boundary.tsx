// FE-6 fixture (regla j): una vista que importa `apiFetch` del cliente api DEBE producir error de
// no-restricted-imports. NO es código de producción (ver README de esta carpeta). El tipo `ApiError` sí
// se permitiría; aquí se importa apiFetch a propósito para disparar la regla.
import { apiFetch } from '../../api/client';

export function BadView() {
  void apiFetch;
  return null;
}
