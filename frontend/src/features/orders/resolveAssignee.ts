// T003/FR-002 (023): resolución honesta del «técnico» en la fila de meta (lista) y en RBAC futuro.
// Puro: sin acceso a red/sesión; el llamador pasa `sessionUserId` desde `useSession().user?.userId`.
export function resolveAssignee(
  assignedTo: string | null,
  sessionUserId: string | undefined,
): string {
  if (!sessionUserId) return 'Sin asignar';
  if (assignedTo === null) return 'Sin asignar';
  if (assignedTo === sessionUserId) return 'Tú';
  return assignedTo.slice(0, 8);
}
