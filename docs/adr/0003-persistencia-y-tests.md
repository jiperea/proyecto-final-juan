# ADR-0003: PostgreSQL en Docker (todos los entornos) y BD de test independiente

- **Estado**: Aceptado
- **Fecha**: 2026-07-10
- **Decisores**: autor del proyecto

## Contexto

Con Docker en el stack (paridad de entornos) hay que decidir el motor de BD y cómo levantarla en tests.
La Constitution VII exige integración con **BD real** (no mocks del ORM). El brief pide "install+test en
máquina limpia" y que lo usen varias personas de forma estable.

## Decisión

**PostgreSQL 16 (Prisma) en todos los entornos vía Docker Compose** — dev = test = prod, sin divergencia
de motor. Los **tests de integración** usan un **Postgres de docker-compose en una BD de test
independiente**; los **datos semilla** sirven además para un **POV básico** de la app. Migraciones con
Prisma Migrate.

## Alternativas consideradas

- **SQLite dev/test → Postgres prod:** más ligero, pero dev≠prod (riesgo de sorpresas no vistas hasta prod).
- **Testcontainers:** aislamiento hermético por corrida; se pospone — para un proyecto pequeño, el
  servicio de docker-compose es suficiente y el cambio a Testcontainers es trivial mientras la BD de
  test sea independiente.

## Consecuencias

- **Positivas:** paridad total; "BD real" de VII cumplida; seed reutilizable para demo/POV; reproducible.
- **Negativas / coste:** arrancar Postgres en cada entorno (Docker); limpiar estado entre corridas de test.
- **Verificación:** `docker compose up` levanta la BD; los tests de integración corren contra la BD de
  test; migraciones aplicables en limpio.
