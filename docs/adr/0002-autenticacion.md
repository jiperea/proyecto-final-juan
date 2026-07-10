# ADR-0002: Autenticación con JWT access + refresh (argon2id)

- **Estado**: Aceptado
- **Fecha**: 2026-07-10
- **Decisores**: autor del proyecto

## Contexto

La feature de fundación (001) necesita auth + ciclo de sesión para el RBAC (Constitution IV: sesión con
expiración/revocación, 401 al caducar). El brief no fija mecanismo ("stack libre").

## Decisión

**JWT access token** de vida corta (en memoria del cliente) + **refresh token opaco** almacenado en
cookie **HttpOnly/SameSite=Strict** y **revocable** en servidor; hashing de contraseñas con **argon2id**.

## Alternativas consideradas

- **Sesión en servidor (cookie + store):** revocación trivial, pero requiere store de sesiones y menos
  alineado con el estándar del curso.
- **OAuth2/OIDC (IdP externo):** realista en enterprise pero mucho montaje; excesivo para el slice.

## Consecuencias

- **Positivas:** access corto limita exposición; refresh revocable cumple el ciclo de sesión (IV);
  argon2id es el estándar OWASP; alineado con el curso (field-ops).
- **Negativas / coste:** hay que gestionar rotación/revocación del refresh y su almacenamiento hasheado.
- **Verificación:** test de sesión caducada/revocada → 401; test de que el refresh es HttpOnly y revocable.
