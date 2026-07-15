// FE-6 fixture (regla b): un useEffect con dependencias incompletas DEBE producir error de
// react-hooks/exhaustive-deps. NO es código de producción (ver README de esta carpeta).
import { useEffect, useState } from 'react';

export function BadDeps() {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(n + 1); // usa `n` pero el array de deps está vacío → falta `n`
  }, []);
  return n;
}
