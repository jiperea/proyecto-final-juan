# 00 · Brief original (fuente de verdad)

> Este documento captura el brief **tal cual llegó de negocio**, sin interpretar ni editar.
> Es la fuente de verdad contra la que contrastamos todo lo demás. Cualquier decisión posterior
> (constitution, spec) debe poder rastrearse hasta aquí.

## Escenario

**FieldOps** es una plataforma de gestión de órdenes de trabajo para técnicos de campo.

Una orden pasa por estos estados:

```
draft → assigned → in_progress → pending_review → closed
```

## Roles

- **Dispatcher:** organiza el trabajo y **reasigna órdenes** entre técnicos.
- **Technician:** ejecuta la orden en campo y **registra la ejecución** (con evidencia fotográfica).
- **Supervisor:** revisa el trabajo en `pending_review` y puede **aprobar o rechazar**.

## Notas literales del product owner (reunión rápida)

> *"Necesitamos que el técnico pueda registrar la ejecución de una orden y que el dispatcher pueda
> reasignarla si hace falta. Cuando el técnico envía la ejecución, debe adjuntar al menos una foto de
> evidencia. Luego el supervisor revisa y aprueba o rechaza. El usuario puede ver sus órdenes. Ah, y
> esto tiene que ser rápido y seguro, que manejamos datos de clientes. Sería ideal también tener un
> pequeño asistente que resuma la incidencia de cada orden a partir de las notas del técnico, para que
> el supervisor no tenga que leérselo todo. Y ya puestos, estaría genial un dashboard de métricas de
> productividad y notificaciones push a los técnicos… pero bueno, eso lo vemos."*

## Alcance funcional que pide el enunciado (slice mínimo)

1. **Reasignación de orden** por parte del dispatcher.
2. **Registro de ejecución** por parte del técnico, con al menos una foto de evidencia.
3. **Aprobación / rechazo** por parte del supervisor en `pending_review`.
4. **RBAC:** cada acción solo la puede hacer el rol correcto; el resto recibe un rechazo explícito.
5. **Componente con IA:** asistente/tool que **resume la incidencia** de una orden a partir de sus
   notas. Regla dura: **si no hay evidencia/nota suficiente, debe decirlo y no inventar**.

## Frases del brief que huelen a ambigüedad (a atacar por el revisor cínico)

- *"reasignarla **si hace falta**"* — ¿en qué estados se permite reasignar?
- *"**al menos una** foto de evidencia"* — ¿enviar sin foto es bloqueante? ¿formato/tamaño/cantidad máx.?
- *"el usuario puede ver **sus** órdenes"* — ¿cada rol ve solo las suyas? ¿el supervisor ve todas?
- *"tiene que ser **rápido y seguro**"* — sin umbral cuantificado ni definición de "seguro".
- *"evidencia/nota **suficiente**"* (IA) — ¿cuál es el umbral para aceptar resumir?
- *"dashboard de métricas"* y *"notificaciones push"* — marcadas por el PO como *"eso lo vemos"* → señal de **fuera de alcance**.
