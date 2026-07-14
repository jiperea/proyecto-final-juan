// Skip-link (WCAG 2.4.1). Oculto salvo con foco de teclado; salta a <main id="main">.
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Saltar al contenido
    </a>
  );
}
