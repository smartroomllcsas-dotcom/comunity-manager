# Reglas obligatorias para agentes

Este repositorio es una aplicación multiagencia y multimarca en producción.
Lee estas reglas antes de analizar, editar o ejecutar código. También consulta
`CLAUDE.md`, `PLAN_TRABAJO_CODEX_AGENTE.md` y, para el estado técnico reciente,
`web/AGENT_NEXT_PHASE_IMPLEMENTATION.md`.

## Responsabilidad de integración

- Codex es el único responsable de revisar, integrar, hacer commit, fusionar,
  subir a `master` y desplegar en Vercel o Supabase.
- Los demás agentes pueden investigar, implementar cambios locales y documentar
  resultados, pero no deben hacer `push`, fusionar ramas, desplegar, cambiar
  secretos ni ejecutar migraciones en Production.
- No sobrescribas, reviertas ni elimines cambios que no hayas creado. El árbol
  puede contener trabajo de otro agente.

## Aislamiento que nunca debe romperse

- Toda lectura y escritura debe quedar limitada por `organization_id` y, cuando
  aplique, por `client_id`/marca y por la asignación del usuario o asesor.
- Una organización no puede ver ni modificar datos de otra organización.
- Un asesor de marca solo puede acceder a las marcas asignadas. Los roles
  administrativos conservan únicamente los permisos globales definidos por el
  sistema; no introduzcas bypasses nuevos en el navegador.
- Un mismo contacto puede existir en varias marcas porque puede consultar
  productos distintos. No dedupliques contactos entre marcas ni muevas una
  conversación de marca por coincidencia de teléfono, correo o identificador.
- Facebook/Messenger, Instagram y WhatsApp deben asociarse al canal y a la marca
  seleccionados. Un activo externo no puede quedar activo en dos marcas a la
  vez, salvo que el modelo lo permita expresamente.
- Los webhooks deben resolver primero el activo externo (`page_id`, cuenta de
  Instagram, WABA o número), después el canal, la marca y la organización. No
  uses una marca predeterminada ni la primera coincidencia disponible.
- Tokens, archivos adjuntos, mensajes, conversaciones, contactos e historial de
  WhatsApp se sirven desde backend con autorización; no se consultan ni se
  exponen directamente desde el navegador.

## Cambios en vistas y acciones

- Antes de editar, identifica la ruta de UI, sus endpoints, tablas, roles,
  límites de plan y pruebas relacionadas. Corrige el flujo completo, no solo la
  apariencia.
- Mantén compatibles los flujos que ya funcionan: conexión y reconexión de
  canales, recepción y respuesta de mensajes, filtros por marca, adjuntos,
  facturación y límites atómicos.
- Toda acción destructiva o de desactivación debe advertir su efecto, conservar
  historial y ser reversible cuando el producto así lo define.
- Una marca inactiva no consume cupo activo ni recibe eventos nuevos, pero su
  información histórica no se elimina.
- El superadministrador puede estar exento de límites comerciales solo mediante
  reglas del backend ya definidas. No implementes excepciones solo en la UI.
- No cambies contratos públicos de API, nombres de campos, estados ni migraciones
  existentes sin revisar todos sus consumidores.
- Evita valores fijos de organizaciones, marcas, usuarios, canales, dominios,
  fechas, tokens o IDs de QA.

## Migraciones y datos

- Las migraciones son nuevas, ordenadas, idempotentes cuando sea razonable y con
  rollback documentado. Nunca edites una migración que ya fue aplicada.
- No desactives RLS ni debilites políticas para hacer pasar una prueba.
- No borres datos reales. Las pruebas deben usar fixtures identificables y
  limpiar únicamente los datos que ellas crearon.
- No imprimas secretos, tokens, credenciales ni datos personales en código,
  documentación, terminal o logs.

## Verificación mínima antes de entregar

1. Revisa `git status`, el diff completo y los cambios concurrentes.
2. Ejecuta las pruebas específicas del flujo modificado.
3. Ejecuta la suite completa y `npm run build` dentro de `web` si el cambio
   afecta código ejecutable.
4. Ejecuta `git diff --check` y confirma que no se agregaron secretos.
5. Prueba autorización positiva y negativa: otra organización, otra marca,
   usuario no asignado, marca inactiva y rol administrativo cuando aplique.
6. Documenta archivos modificados, causa, pruebas, resultados, riesgos y pasos
   manuales en `web/AGENT_NEXT_PHASE_IMPLEMENTATION.md`.

No declares una tarea terminada si faltan código, pruebas o evidencia. Al final,
deja los cambios locales para revisión de Codex y reporta explícitamente que no
hiciste push ni despliegue.
