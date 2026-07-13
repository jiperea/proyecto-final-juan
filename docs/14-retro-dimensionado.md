# 14 · Retro de dimensionado y eficiencia SDD

> Reflexión sobre **si el proyecto se pudo hacer más rápido / con menos specs**. Se **actualiza al cerrar**
> cada sesión relevante. Trazada a la evidencia de `docs/06-roadmap.md` y del historial de git.
> Última actualización: 2026-07-13 (tras mergear #010 en `develop`).

## Premisa

Esto es un proyecto de **aprendizaje de SDD**. El enunciado lo dice: *"mejor una feature bien especificada y
a medio implementar que cinco mal pensadas"*. Por tanto, **el grueso del tiempo (gates, revisión
adversarial, EARS, trazabilidad, constitución) NO es desperdicio: es el entregable.** "Menos specs" no es
automáticamente "mejor". La pregunta útil es: ¿dónde se perdió tiempo *evitable*?

## 3 causas evitables

### (a) 001 sobredimensionada
`001` juntó auth + refresh single-use + familias + gracia + reuso + CSRF + caché de revocación → **~10
rondas de gate, 66 tareas** (roadmap §"Retro de 001"). Clásico "spec demasiado grande". **Lección ya
extraída**: nació el Principio **XV** (specs pequeñas); se aplicó partiendo `002` de origen en `002a`/`002b`.

### (b) API-first sin decidir el front → bloqueante tardío #010 (ya resuelto)
Se construyó 001–009 **solo backend**. El hueco del **read-side del detalle** (notas + evidencia + **motivo
del rechazo**) no se descubrió hasta el **gate G1 de 006**, materializándose como feature **#010
`order-detalle-read`** + **BL-070** + una **enmienda de Constitution XI**. No fueron "demasiadas specs": fue
**una spec descubierta tarde**. → **Resuelto**: la enmienda **XI (v1.9.0)** y **#010** ya están mergeadas en
`develop` (G1/G2/G3 verde). Pero el coste (una feature entera + una enmienda) se habría evitado decidiendo
*quién consume qué* (el front) al dibujar el roadmap.

### (c) Carve-outs reactivos (#007–#009)
Sacar clusters a features propias es correcto (XV), pero se descubrieron *durante* la implementación, no al
planificar. Un pase temprano de "read-side + robustez" los habría anticipado.

## Autoría de contratos: dónde amplifica (hallazgo de la sesión)

Hipótesis del usuario: *¿delegar los contratos a Claude retrasó el desarrollo?* **Los datos**: de **20
commits que tocan `contracts/`, ~12 son remediación de gates (G2/G3)**, concentrados en **001
(sobredimensionada, ~4 rondas)** y **004 ('límite')**. → El churn de contrato **correlaciona con el
DIMENSIONADO**, no obviamente con la autoría. Pero delegar **sí amplifica**: el contrato es *fuente de
verdad* (contract-first); si Claude decide el **diseño** *además* de teclear el YAML, los desajustes con la
intención afloran tarde en los gates. **Regla adoptada**: el **usuario decide el diseño** (endpoints, modelo
de errores, read/write, semántica, **quién consume**); **Claude solo redacta el YAML** y lo mantiene limpio
(Spectral/oasdiff). Algo de churn en gates es *sano*; el problema es el churn *excesivo y repetido* en una
misma feature.

## Qué salió bien

- **XV aplicado tras 001**: `002` partido de origen; chequeo de tamaño al entrar cada feature.
- **Los gates funcionaron**: #010 lo **cazó el gate G1 de 006** (no llegó como deuda oculta). El
  `auditor-brief` lo re-confirmó al auditar la enmienda de front.
- **Trazabilidad** requisito→endpoint→tarea→test (`docs/traceability.md`).
- **Carve-outs registrados como features** (#007–#009), no como scope difuso.

## Reglas para lo que queda (front FE-1..4 + DevOps DO-1..7)

1. **Decidir los consumidores al planificar** (qué UI/cliente consume cada contrato) → evita bloqueantes
   read-side tardíos como #010.
2. **Contratos: el usuario diseña, Claude redacta** (ver arriba).
3. **Pase de read-side/robustez de origen** al dibujar el roadmap de una fase.
4. **Right-size de origen** (XV): si huele a "cluster", partir antes de `/specify`.
5. **No confundir rigor con lentitud**: se optimiza el *dimensionado* y el *orden de descubrimiento*, no la
   disciplina.

## Eventos anotados (sesión 2026-07-13)

- **#010 resuelto**: enmienda **XI v1.9.0** + feature **#010** mergeadas en `develop` (G1/G2/G3 verde). La
  cadena del front (FE-1) queda **desbloqueada**.
- **Descubrimiento de #010 vía auditor-brief**: al auditar la enmienda de front (v1.8.0), `auditor-brief`
  destapó (citando el roadmap) que FE-1 estaba bloqueada por #010 — validando la causa (b). Citas
  verificadas reales. *Lección: correr el auditor al tocar la constitución paga.*
- **Colisión de versión evitada**: se preparó una enmienda de front etiquetada "v1.8.0" en
  `chore/constitution-front`; en paralelo el usuario usó v1.8.0 (IX) y v1.9.0 (XI). No mergearla evitó un
  choque de versión en la constitución. Se regenerará sobre `develop` como **v1.10.0** al arrancar FE-1.
- **CI en rojo por falso positivo de gitleaks**: `password: 'incorrecta-<n>'` de fixtures; resuelto con
  `.gitleaks.toml` acotado. Coste de *configuración de gate*, no de dimensionado.
- **Insight de autoría de contratos** (sección propia arriba).

> Se actualizará de nuevo al cerrar la sesión / al avanzar FE y DevOps.
