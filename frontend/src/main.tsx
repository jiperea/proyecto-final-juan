import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder de arranque (Phase 1 Setup). El árbol real (providers, router, shell)
// se monta en Foundational (T019/T020/T024).
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <main>
        <h1>FieldOps</h1>
      </main>
    </StrictMode>,
  );
}
