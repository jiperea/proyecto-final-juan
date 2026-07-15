# Exploración de diseño del front (referencia no vinculante)

Esta carpeta guarda la **exploración visual** que sirvió de referencia para el reskin del front. **No es
la spec del front ni se sirve en la app**: es material de apoyo versionado para no depender de una URL.

## `artifact-69806069.html`

Copia **verbatim** del artifact de exploración `69806069-4e8c-4b96-832b-fae4d23b3abe`
("FieldOps · Vistas mínimas del front"), sin el *frame-runtime* de claude.ai (envoltorio del visor, no
diseño). Ábrelo en el navegador para verlo en claro/oscuro (sigue `prefers-color-scheme`).

Es la **fuente visual** de:
- **FE-5 · `017-front-reskin`** (ya mergeado): acento naranja, paleta de estados, radios/sombras suaves,
  Stepper del FSM, tarjeta de resumen IA, tema oscuro.
- **FE-7 · `021-front-dual-accent`** (planificada): recuperar el naranja **vivo** del artifact
  (`--accent: #DC5A24` claro / `#FF7A45` oscuro) donde no lleva texto, manteniendo un acento accesible en
  botones (WCAG AA).

### Tokens de referencia (extraídos del artifact)

| Token | Claro | Oscuro |
|---|---|---|
| `--accent` | `#DC5A24` | `#FF7A45` |
| `--accent-ink` | `#FFFFFF` | `#1A1005` |
| `--accent-soft` | `#FBE7DD` | `#3A2015` |
| `--ground` / `--surface` | `#F4F6F8` / `#FFFFFF` | `#0E141A` / `#18212B` |
| `--ink` / `--ink-muted` | `#1A2430` / `#5C6B7A` | `#E7EDF3` / `#93A2B2` |
| estado draft/assigned/in_progress/pending_review/closed | `#64748B` / `#2563EB` / `#0E7C9B` / `#7C3AED` / `#178A4E` | `#94A3B4` / `#6FA0FF` / `#4FC2DE` / `#B896FF` / `#4FC98A` |
| `--radius` / `--radius-sm` | `14px` / `9px` | (igual) |
| `--shadow` | `0 1px 2px rgba(16,24,32,.05), 0 8px 24px rgba(16,24,32,.06)` | (igual) |

> **Aviso de fidelidad AA**: el reskin de FE-5 oscureció el acento a `#c2410c` en claro para cumplir
> contraste con texto blanco en botones. El `#DC5A24` del artifact es más vivo pero **falla AA con texto
> blanco**; por eso FE-7 usa **doble token** (vivo en superficies sin texto, accesible en botones). No
> copiar `#DC5A24` a un botón con texto blanco sin verificar el ratio.

El marco de móvil/navegador (`.phone`, `.browser`, `.chrome`) es **atrezzo de la maqueta**, no UI real de
la app; no se reproduce.
