# Guia operativa: Fase 2, Supabase y despliegue

Proyecto: CommunityManager (esquema tecnico heredado `smarttalk`)
Fecha de revision: 2026-07-30
Directorio de aplicacion: `web`  
Estado: migraciones aplicadas; codigo publicado y despliegue Production verificado

Actualizacion Vercel 2026-07-30:

- Se valido acceso administrativo a `cg-moda/comunityagent`.
- Se conservaron todas las variables existentes.
- Se agregaron solo en `Production`: `BILLING_ENFORCEMENT_MODE=off`,
  `BILLING_GRACE_DAYS=3`, `EPAYCO_TEST=true`,
  `PAYMENT_GATEWAY_DEFAULT=epayco`, `PAYMENT_ENVIRONMENT=sandbox`,
  `PAYMENT_RENEWAL_MODE=manual` y
  `PAYMENT_AUTO_RENEWAL_APPROVED=false`.
- `CRON_SECRET` ya existia y no fue reemplazado.
- La rama `codex/billing-subscriptions` fue publicada en GitHub.
- El deployment de Vercel `dpl_7PTKhjKJPae3jucjVmamFx6yGUnk` quedo
  `Ready` el 2026-07-30.
- Dominio principal verificado: `https://www.comunitymanager.io`.
- El despliegue conserva billing en `off`, ePayco en sandbox y renovacion
  manual. No se habilitaron cobros reales.

## 1. Resultado de la revision

| Componente | Estado | Puede aprobarse ahora |
|---|---|---:|
| Arquitectura multiempresa por organizacion | Aplicada | Si, tecnicamente |
| Catalogo de planes y beneficios | Aplicado | Si, tecnicamente |
| Precios por pasarela | Aplicado | Si, tecnicamente |
| Panel de planes | Aplicado, compilado y revisado visualmente | Validado en QA autenticado |
| Panel de pasarelas | Aplicado, compilado y revisado visualmente | Validado en QA autenticado |
| Checkout generico e idempotente | Aplicado y probado en sandbox | Validado para los tres planes ePayco |
| ePayco | Confirmacion y activacion implementadas | Sandbox end-to-end validado para los tres planes |
| Wompi | Configuracion, checkout y firmas preparados | No; webhook de activacion pendiente |
| PayU | Configuracion, WebCheckout y firmas preparados | No; confirmacion pendiente |
| Renovacion manual | Implementada para ePayco | Pendiente prueba específica antes/después del vencimiento |
| Renovacion automatica | Solo infraestructura de datos | No habilitar |
| Limites backend | Integrados, con reservas atómicas desplegadas | Falta ejecutar dos altas simultáneas en QA |
| Cron de vencimiento y gracia | Desplegado, ejecucion diaria y acceso protegido | Pendiente ejecucion autenticada |
| Outbox y cola | Migración `032`, worker y cron desplegados | Falta evidencia de procesamiento real |
| Notificaciones de billing | Worker, reintentos y backoff implementados | Falta evidencia de envío idempotente |
| Cambios programados de plan | Campos preparados | No; orquestacion pendiente |
| Servicios de dominio Fase 2 | Contratos documentados; implementacion parcial | No aprobar como completos |
| Migraciones `009` y `010` | Aplicadas y verificadas en Supabase `smartmedia` | Completo |
| Build, lint y pruebas unitarias | Aprobados localmente | Si |

Actualización 2026-08-09: el propietario confirmó que ePayco sandbox fue
configurado, que Demo Inicial, Demo Crecimiento y Demo Escala se compraron y se
llevaron hasta sus límites, y que se revisaron `/admin/plans`,
`/admin/payment-gateways` y `/settings/billing`. Esta validación no cubre aún
renovación, suspensión/reactivación, concurrencia ni procesamiento de outbox.

## 2. Decisiones de seguridad vigentes

- La suscripcion pertenece a la organizacion, no a un usuario individual.
- El frontend oculta opciones, pero las APIs vuelven a validar permisos,
  precio, pasarela, ambiente e idempotencia.
- `BILLING_ENFORCEMENT_MODE=off` evita bloquear funciones existentes durante
  el primer despliegue.
- Toda renovacion permanece en `manual`.
- `PAYMENT_AUTO_RENEWAL_APPROVED=false` es obligatorio.
- Wompi y PayU no pueden habilitar checkout aunque sus credenciales existan.
- Ninguna clave privada se almacena en PostgreSQL.
- No se debe usar `NEXT_PUBLIC_` para secretos.

## 3. Requisitos antes de comenzar

Necesitas:

1. Acceso de administrador al proyecto Supabase correcto.
2. Access token personal para Supabase CLI.
3. Password de la base, si la CLI lo solicita.
4. Acceso al proyecto Vercel `comunityagent`.
5. Acceso al dominio HTTPS definitivo.
6. Credenciales sandbox de ePayco.
7. Un usuario existente en `smarttalk.agents` que pueda marcarse como
   superadministrador.
8. Backup descargado o recuperable de la base antes de migrar.

El proyecto local ya contiene enlace de Supabase y Vercel, pero la revision no
pudo consultar el historial remoto porque Supabase CLI no tiene una sesion
iniciada. Debes autenticarte antes de cualquier `db push`.

## 4. Variables de entorno

Usa como base:

- `web/.env.production.example` para Vercel Production.
- `web/.env.example` para desarrollo local.

### 4.1 Obligatorias para aplicacion y Supabase

```env
NEXT_PUBLIC_APP_URL=https://tu-dominio-final.com
INTERNAL_APP_URL=https://tu-dominio-final.com
NEXT_PUBLIC_DB_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Reglas:

- `NEXT_PUBLIC_APP_URL` no debe terminar en `/`.
- `SUPABASE_SERVICE_ROLE_KEY` solo se configura en Vercel, nunca en frontend,
  capturas, tickets o repositorio.
- Preview debe usar una base staging diferente. No apuntes previews a
  produccion si vas a probar pagos o migraciones.

### 4.2 Billing seguro para primer despliegue

```env
BILLING_ENFORCEMENT_MODE=off
BILLING_GRACE_DAYS=3
PAYMENT_GATEWAY_DEFAULT=epayco
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_RENEWAL_MODE=manual
PAYMENT_AUTO_RENEWAL_APPROVED=false
CRON_SECRET=VALOR_ALEATORIO_DE_32_O_MAS_CARACTERES
```

No cambiar a `observe`, `soft` o `hard` durante la migracion inicial.

### 4.3 ePayco sandbox

```env
NEXT_PUBLIC_EPAYCO_PUBLIC_KEY=...
EPAYCO_PRIVATE_KEY=...
EPAYCO_CUSTOMER_ID=...
EPAYCO_P_KEY=...
EPAYCO_TEST=true
```

URLs generadas por la aplicacion:

```text
Confirmacion: https://tu-dominio-final.com/api/epayco/confirmation
Respuesta:    https://tu-dominio-final.com/settings/billing?payment=success
```

La URL de confirmacion debe ser publica, HTTPS y no debe requerir login.

### 4.4 Wompi, solo preparacion

```env
WOMPI_PUBLIC_KEY=...
WOMPI_PRIVATE_KEY=...
WOMPI_INTEGRITY_SECRET=...
WOMPI_EVENTS_SECRET=...
WOMPI_ENVIRONMENT=sandbox
```

Puedes guardar las variables y habilitar la pasarela como configurada. No
intentes habilitar su checkout: el backend lo bloquea hasta completar el
webhook de activacion.

### 4.5 PayU, solo preparacion

```env
PAYU_API_LOGIN=...
PAYU_API_KEY=...
PAYU_MERCHANT_ID=...
PAYU_ACCOUNT_ID=...
PAYU_ENVIRONMENT=sandbox
```

Puedes guardar las variables y configurar precios. No intentes habilitar
checkout hasta implementar y certificar la confirmacion PayU.

### 4.6 Variables existentes de canales

No reemplaces ni elimines las variables actuales de Meta, Facebook,
Instagram, WhatsApp, Anthropic o Respond.io. Antes de desplegar verifica como
minimo:

```env
NEXT_PUBLIC_META_APP_ID=
NEXT_PUBLIC_META_CONFIG_ID=
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
FACEBOOK_APP_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
NEXT_PUBLIC_FACEBOOK_APP_ID=
NEXT_PUBLIC_WHATSAPP_CONFIG_ID=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
ANTHROPIC_API_KEY=
RESPOND_IO_API_BASE=https://api.respond.io/v2
```

Usa los valores que ya funcionan en produccion. Este despliegue no requiere
rotarlos.

## 5. Preparar Supabase

### 5.1 Confirmar el proyecto

Desde `web`:

```bash
cd web
npx supabase login
npx supabase projects list
npx supabase migration list --linked
```

Antes de continuar:

- Confirma visualmente que el proyecto marcado como enlazado es staging.
- Compara columnas `LOCAL` y `REMOTE`.
- No uses `migration repair` sin entender y respaldar la diferencia.
- Si hay migraciones locales anteriores pendientes, detente. El `db push`
  aplica todas las migraciones pendientes, no solo `009` y `010`.

### 5.2 Backup

Antes del primer push:

1. Genera backup lógico de `public`, `smarttalk` y del historial de
   migraciones.
2. Conserva una copia fuera del proyecto.
3. Verifica que existe un procedimiento de restauracion.
4. Registra fecha, proyecto, responsable y archivo del backup.

No uses `supabase db reset --linked` en produccion. Ese comando elimina datos.

### 5.3 Exponer el esquema

En Supabase Dashboard:

1. Abre Project Settings.
2. Abre Data API o API Settings.
3. Busca `Exposed schemas`.
4. Confirma que incluye `smarttalk`.
5. Conserva `public`, `storage` y otros esquemas que ya use el proyecto.

La migracion base ya concede permisos de esquema a `anon`, `authenticated` y
`service_role`; no elimines esos permisos. La proteccion de datos se mantiene
mediante RLS.

### 5.4 Validar qué se aplicará

Desde `web`:

```bash
npx supabase db push --dry-run
```

El resultado esperado para esta entrega es que las nuevas migraciones sean:

```text
20260729000100_009_agency_billing_foundation.sql
20260729000200_010_multi_gateway_manual_renewal.sql
```

Si aparecen migraciones antiguas no aplicadas, no ejecutes el push. Primero
debes reconciliar el historial y el esquema con un responsable de base de
datos.

### 5.5 Aplicar en staging

Solo después de backup y `dry-run` aprobado:

```bash
npx supabase db push
npx supabase migration list --linked
```

No pegues las migraciones en SQL Editor. Eso ejecuta SQL pero omite el flujo
normal de historial y puede desincronizar futuros `db push`.

### 5.6 Consultas de validacion

Estas consultas sí pueden ejecutarse en SQL Editor después del push:

```sql
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260729000100', '20260729000200')
ORDER BY version;

SELECT gateway, is_enabled, checkout_enabled, environment, renewal_mode
FROM smarttalk.payment_gateway_settings
ORDER BY priority;

SELECT COUNT(*) AS automatic_organizations
FROM smarttalk.organizations
WHERE renewal_mode = 'automatic';

SELECT COUNT(*) AS automatic_subscriptions
FROM smarttalk.subscriptions
WHERE renewal_mode = 'automatic';

SELECT COUNT(*) AS duplicate_current_subscriptions
FROM (
  SELECT organization_id
  FROM smarttalk.subscriptions
  WHERE status IN ('trial', 'active', 'past_due', 'suspended')
  GROUP BY organization_id
  HAVING COUNT(*) > 1
) duplicated;
```

Resultado esperado:

- Aparecen las versiones `009` y `010`.
- ePayco: habilitada, checkout habilitado, sandbox, manual.
- Wompi y PayU: deshabilitadas, checkout deshabilitado, sandbox, manual.
- Organizaciones automaticas: `0`.
- Suscripciones automaticas: `0`.
- Suscripciones actuales duplicadas: `0`.

## 6. Configurar superadministrador

El panel `/admin` exige `smarttalk.agents.is_super_admin=true`.

Usa el correo de un usuario real ya autenticado:

```sql
UPDATE smarttalk.agents
SET is_super_admin = TRUE
WHERE email = 'TU_CORREO_ADMIN';

SELECT id, email, role, is_super_admin
FROM smarttalk.agents
WHERE email = 'TU_CORREO_ADMIN';
```

No uses el archivo `supabase/admin_user.sql` en produccion: contiene
credenciales de desarrollo heredadas.

## 7. Probar localmente antes de desplegar

Desde `web`:

```bash
npm ci
npm test
npm run lint -- --quiet
npm run build
```

Estado registrado en esta revision:

- 99 pruebas aprobadas: 93 Vitest y 6 Node.
- Lint sin errores.
- Build Next.js 16.2.12 y TypeScript aprobado.
- 96 rutas compiladas.
- `git diff --check` aprobado.
- Validacion PostgreSQL local pendiente por falta de Docker/Podman.
- El equipo tiene cliente `psql`, pero no el binario servidor `postgres`.
- La revision visual autenticada quedó pendiente porque `localhost:3000`
  corresponde a otro proyecto local, no a CommunityManager.

Para revisar los diseños sin interferir con el otro proyecto:

```bash
cd web
npm run dev -- -p 3010
```

Después ingresa con un superadmin en:

```text
http://localhost:3010/admin/plans
http://localhost:3010/admin/payment-gateways
http://localhost:3010/settings/billing
```

## 8. Configurar Vercel

El proyecto está enlazado localmente con Vercel bajo el nombre
`comunityagent`.

En Vercel:

1. Abre el proyecto.
2. Confirma `Root Directory = web`.
3. Confirma framework `Next.js`.
4. Abre Settings > Environment Variables.
5. Carga las variables de las secciones 4.1, 4.2, 4.3 y 4.6.
6. Usa credenciales sandbox para el primer despliegue.
7. Marca secretos como sensibles cuando la interfaz lo permita.
8. No agregues valores reales al repositorio.

Los cambios de variables solo aplican a nuevos deployments. Después de
modificarlas debes volver a desplegar.

### Procedimiento obligatorio para no desplegar el directorio equivocado

Este repositorio es un monorepo. El proyecto Vercel `cg-moda/comunityagent`
usa **`web` como Root Directory**. Por eso no se debe ejecutar `vercel deploy`
desde la raíz del repositorio: Vercel puede no detectar Next.js o puede tomar
una configuración distinta.

Usa siempre este flujo desde un checkout limpio de `master`:

```bash
git fetch origin
git worktree add --detach /tmp/comunity-manager-master origin/master
cd /tmp/comunity-manager-master/web
npx vercel link --yes --project comunityagent --scope cg-moda
npx vercel deploy --prod --yes --force --logs
```

La salida válida debe incluir `Detected Next.js version`, `Build Completed`,
`readyState: READY` y el alias de Production. Comprueba después:

```bash
npx vercel inspect <DEPLOYMENT_ID> --scope cg-moda
curl -sS -o /dev/null -w 'status=%{http_code} url=%{url_effective}\n' https://www.comunitymanager.io/
```

Esperado: estado `Ready` y HTTP `200`. El worktree temporal debe eliminarse
cuando termine la verificación:

```bash
cd <REPOSITORIO>
git worktree remove --force /tmp/comunity-manager-master
```

En el Dashboard, si se usa la interfaz, filtra por la rama `master` y confirma
el commit antes de pulsar **Redeploy**. No redeployes el deployment superior si
pertenece a `codex/*`; esa acción reconstruye ese branch, no `master`.

### Estado Production verificado el 2026-07-30

- Proyecto Vercel: `cg-moda/comunityagent`.
- Deployment: `dpl_7PTKhjKJPae3jucjVmamFx6yGUnk`.
- Estado: `Ready`.
- URL principal: `https://www.comunitymanager.io`.
- `/`, `/login` y `/api/health`: HTTP `200`.
- `/admin/plans`, `/admin/payment-gateways` y `/settings/billing`: redireccion
  HTTP `307` a `/login` sin sesion, comportamiento esperado.
- `/api/cron/billing-lifecycle`: HTTP `401` sin `CRON_SECRET`, comportamiento
  esperado y seguro.
- Health de base de datos: `ok`.
- Webhooks al verificar: `pending=0`, `failed=0`, `dead=0`.
- Las siete variables operativas de billing aparecen configuradas en
  `Production`; Vercel mantiene sus valores cifrados.

### Estado Production verificado el 2026-08-06

- `BILLING_ENFORCEMENT_MODE=hard` quedó configurado en `Production`.
- Deployment desde `origin/master` (`1ec490d`):
  `dpl_CtXr95p4vkJaTypfy3uW9zY1DdJ2`.
- Estado: `Ready`; alias activo: `https://www.comunitymanager.io`.
- Smoke test de `/`: HTTP `200`.
- El primer intento desde la raíz falló por el Root Directory incorrecto; no
  fue promovido. El deployment válido se ejecutó desde `web/` con build limpio.

### Cron configurado

`web/vercel.json` registra:

```text
/api/cron/refresh-tokens      03:00 UTC diario
/api/cron/billing-lifecycle   04:15 UTC diario
```

El cron diario funciona en Vercel Hobby, Pro y Enterprise. Para ejecución
horaria de billing se requiere Vercel Pro o Enterprise y una modificación
posterior aprobada de `vercel.json`.

Vercel enviará `Authorization: Bearer $CRON_SECRET`. La API falla cerrada si el
secreto falta o no coincide.

## 9. Orden de despliegue

Orden recomendado:

1. Crear backup.
2. Aplicar `009` y `010` en staging.
3. Ejecutar consultas de validacion.
4. Cargar variables sandbox en Vercel Preview/staging.
5. Desplegar una preview desde una rama.
6. Probar login, paneles, planes y ePayco sandbox.
7. Probar Messenger, WhatsApp e Instagram.
8. Aprobar la preview.
9. Repetir backup y `db push --dry-run` contra produccion.
10. Aplicar migraciones en produccion.
11. Cargar variables en Vercel Production.
12. Desplegar produccion manteniendo billing `off` y ePayco sandbox.
13. Ejecutar smoke tests.
14. Autorizar por separado el cambio a ePayco real.

No despliegues la aplicacion nueva antes de tener las tablas nuevas en la base
del mismo ambiente.

## 10. Configuracion funcional posterior

### Planes

1. Ingresa como superadmin.
2. Abre `/admin/plans`.
3. Crea o edita un plan.
4. Define limites y acceso a IA.
5. Selecciona moneda, pasarela y precio.
6. Para registrar precios de otra pasarela, edita nuevamente el plan,
   selecciona la otra pasarela y guarda.
7. Publica el plan solo cuando tenga precio ePayco sandbox probado.

### Pasarelas

1. Abre `/admin/payment-gateways`.
2. Confirma `Runtime: sandbox coincide`.
3. Confirma `Credenciales listas` para ePayco.
4. Mantén renovacion manual.
5. Mantén Wompi y PayU con checkout deshabilitado.

### Agencia

1. Ingresa con un usuario `admin` de una organizacion de prueba.
2. Abre `/settings/billing`.
3. Verifica plan, consumo, suscripcion e historial.
4. Ejecuta un pago ePayco sandbox.
5. Verifica que el webhook active exactamente una suscripcion.

## 11. Pruebas obligatorias

### Pago

- Aprobado activa una vez.
- Pendiente no activa.
- Rechazado no activa.
- Firma invalida se rechaza.
- Monto, moneda o referencia alterados se rechazan.
- Webhook duplicado no duplica pago ni periodo.
- Sandbox no se mezcla con produccion.
- Renovar antes del vencimiento suma el periodo al final vigente.

### Regresion

- Login y registro.
- Conectar y recibir Messenger.
- Responder Messenger.
- Conectar y recibir WhatsApp.
- Responder WhatsApp.
- Conectar y recibir Instagram.
- Responder Instagram.
- Publicacion social.
- Broadcast.
- IA, si está habilitada.

### Cron

Prueba manual autenticada:

```bash
curl -i \
  -H "Authorization: Bearer TU_CRON_SECRET" \
  https://tu-dominio-final.com/api/cron/billing-lifecycle
```

Esperado: HTTP `200` y JSON con `ok: true`.

## 12. Paso a cobro real

Solo después de aprobar sandbox:

1. Cambia credenciales ePayco por producción.
2. Cambia `EPAYCO_TEST=false`.
3. Cambia `PAYMENT_ENVIRONMENT=production`.
4. En `/admin/payment-gateways`, cambia ePayco a `production`.
5. Confirma que panel indica que runtime y base coinciden.
6. Redeploy de Vercel.
7. Ejecuta una compra real de valor controlado.
8. Verifica pago, suscripcion, webhook y conciliacion bancaria.

No cambies:

```env
PAYMENT_RENEWAL_MODE=manual
PAYMENT_AUTO_RENEWAL_APPROVED=false
BILLING_ENFORCEMENT_MODE=off
```

## 13. Reversion

Si aparece un problema:

1. Deshabilita checkout en `/admin/payment-gateways`.
2. Mantén `BILLING_ENFORCEMENT_MODE=off`.
3. Mantén renovación manual.
4. Haz rollback del deployment en Vercel.
5. No borres tablas, pagos, webhooks o suscripciones.
6. Corrige el esquema con una migracion `011` hacia adelante.
7. Si hay afectacion de datos, detén operaciones y restaura siguiendo el
   procedimiento de backup aprobado.

Un rollback de Vercel no revierte la base de datos ni actualiza automáticamente
los crons del deployment anterior. Verifica ambos componentes.

## 14. Matriz de aprobacion

### Aprobado localmente

- [x] Arquitectura multi-pasarela desacoplada.
- [x] Renovacion manual como valor por defecto.
- [x] Wompi/PayU bloqueadas hasta completar webhooks.
- [x] Build de produccion.
- [x] TypeScript.
- [x] Lint.
- [x] 99 pruebas automatizadas.
- [x] Firmas ePayco, Wompi y PayU.
- [x] Documentacion de variables y despliegue.
- [x] Cron compatible con Vercel Hobby.
- [x] Deployment Production `Ready`.
- [x] Smoke test publico y proteccion de rutas.

### Debes aprobar en staging

- [ ] Backup y restauracion disponibles.
- [ ] Historial local/remoto de Supabase reconciliado.
- [ ] `db push --dry-run` muestra solo migraciones esperadas.
- [x] Migraciones `009` y `010` aplicadas el 2026-07-30.
- [ ] Esquema `smarttalk` expuesto.
- [ ] RLS validado con dos organizaciones.
- [x] Panel de planes validado visualmente el 2026-08-09.
- [x] Panel de pasarelas validado visualmente el 2026-08-09.
- [x] ePayco sandbox aprobado end-to-end para Demo Inicial, Demo Crecimiento
  y Demo Escala, llevados hasta sus límites.
- [x] Alta manual de contacto abre el modal en Production y rechaza con el
  límite esperado cuando la cuenta ya alcanzó `contacts.total`.
- [x] Deployment manual Production `Ready` con `BILLING_ATOMIC_QUOTA_MODE=on`.
- [ ] Renovacion manual aprobada.
- [ ] Webhook duplicado aprobado.
- [ ] Cron aprobado.
- [ ] Regresion multicanal aprobada.

### Debes aprobar antes de producción

- [x] Variables operativas de billing presentes en Production.
- [ ] Valores y alcance de variables revisados por dos personas.
- [ ] Preview aprobada.
- [ ] Backup de produccion.
- [x] Migraciones `009` y `010` aplicadas en la base conectada.
- [x] Smoke test tecnico de produccion.
- [x] Compra ePayco sandbox end-to-end para los tres planes.
- [ ] Logs y responsable operativo definidos.
- [ ] Plan de rollback comprobado.

### No aprobado todavía

- [ ] Checkout Wompi.
- [ ] Activacion por webhook Wompi.
- [ ] Checkout PayU.
- [ ] Confirmacion PayU.
- [ ] Tokenizacion.
- [ ] Renovacion automatica.
- [ ] Reintentos automaticos de cobro.
- [ ] Conciliacion automatica multi-pasarela.
- [x] Worker de `billing_outbox_jobs` implementado y desplegado; falta prueba
  operativa de un job real.
- [ ] Envio real desde `notification_logs`.
- [x] Rate limiting específico para checkout y webhooks implementado y probado;
  falta validación de carga en entorno desplegado.
- [ ] Orquestacion completa de upgrade/downgrade.
- [ ] `BILLING_ENFORCEMENT_MODE=observe`.
- [x] `BILLING_ENFORCEMENT_MODE=hard` y `BILLING_ATOMIC_QUOTA_MODE=on` activos
  en Production; quedan pendientes las pruebas operativas de concurrencia,
  outbox y resiliencia.

## 15. Referencias

- Supabase migrations:
  https://supabase.com/docs/guides/deployment/database-migrations
- Supabase custom schemas:
  https://supabase.com/docs/guides/api/using-custom-schemas
- Vercel environment variables:
  https://vercel.com/docs/environment-variables
- Vercel cron security:
  https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Vercel cron limits:
  https://vercel.com/docs/cron-jobs/usage-and-pricing
