# Datos de prueba de billing

Proyecto: CommunityManager
Ambiente: Production con pasarela ePayco en `sandbox`
Fecha de creacion y validacion: 2026-07-30

## Proposito

Estos registros permiten validar la administracion de planes, cuentas,
suscripciones y facturacion sin habilitar cobros reales ni restricciones sobre
los canales existentes.

## Usuario administrativo

- Correo: `admin.billing@comunitymanager.io`
- Rol CommunityManager: `admin`
- Rol de agencia: `admin`
- Superadministrador: `true`
- Auth user ID: `98eb9cf6-b59f-4e4b-8bd5-f8b319829a34`
- La contrasena temporal no se almacena en Git.
- Debe cambiarse o rotarse despues de completar las pruebas.

## Organizacion y suscripcion

- Organizacion: `Agencia Demo Billing`
- Organization ID: `ff09ad0a-2803-4271-89b8-64acfe1e4d22`
- Cuenta vinculada: `Cuenta Demo Billing`
- Plan asignado: `Demo Crecimiento`
- Subscription ID: `48262e69-afcd-4d82-bcab-01e2148451ff`
- Estado: `trial`
- Fin del trial: `2026-08-13T16:23:08.083Z`
- Renovacion: `manual`
- Pasarela preferida: `epayco`
- Enforcement: `off`

La suscripcion de prueba no contiene un pago aprobado ficticio. Un pago solo
debe registrarse mediante el checkout y la confirmacion sandbox.

## Planes de ejemplo

| Codigo | Nombre | Precio COP | Usuarios agencia | Asesores | Por marca | Marcas | Canales |
|---|---|---:|---:|---:|---:|---:|---:|
| `demo-inicial-2026` | Demo Inicial | 59.000 | 2 | 5 | 2 | 5 | 3 |
| `demo-crecimiento-2026` | Demo Crecimiento | 149.000 | 5 | 20 | 5 | 15 | 10 |
| `demo-escala-2026` | Demo Escala | 299.000 | 15 | 75 | 15 | 50 | 30 |

Cada plan:

- Esta en estado `active`.
- Es publico.
- Tiene 15 beneficios configurados, incluidos los tres limites nuevos.
- Tiene limites separados para usuarios de agencia y asesores de marca.
- Tiene un precio mensual COP activo para ePayco.
- Usa ePayco sandbox y renovacion manual.

## Usuario de prueba del onboarding publico

- Correo: `cliente.prueba.planes@comunitymanager.io`
- Nombre: `Cliente Prueba Planes`
- Agencia: `Agencia Prueba Onboarding`
- Organization ID: `3b3f344a-a546-48de-a796-b9313c849ec7`
- Rol: `admin`
- Tipo: `agency_user`
- Plan activo inicial: `free`
- Plan elegido: `demo-inicial-2026`
- Estado de onboarding: `pending_payment`
- Suscripciones antes del pago: `0`
- La contrasena temporal no se almacena en Git.

## Evidencia de validacion

- Login de produccion: HTTP `200`.
- API `/api/admin/plans` con la sesion creada: HTTP `200`.
- Planes demo encontrados: `3`.
- Precio ePayco activo por plan: `1`.
- Beneficios por plan demo: `15`.
- La migracion `011` agrega `agency.users`, `brand.advisors_total` y
  `brand.advisors_per_brand`.
- ePayco: habilitada en `sandbox`.
- Checkout de onboarding: bloqueado correctamente por credenciales ePayco
  pendientes (`PAYMENT_GATEWAY_NOT_CONFIGURED`).
- Renovacion automatica: no habilitada.
- `BILLING_ENFORCEMENT_MODE`: `off`.

## Pruebas manuales

1. Iniciar sesion en `https://www.comunitymanager.io/login`.
2. Abrir `/admin/plans` y revisar los tres planes.
3. Abrir `/admin/organizations` y localizar `Agencia Demo Billing`.
4. Abrir `/admin/subscriptions` y localizar la suscripcion `trial`.
5. Abrir `/settings/billing` y verificar el plan asignado.
6. Probar cambios de limites o precios solo sobre planes con prefijo `Demo`.
7. Ejecutar checkout ePayco unicamente con credenciales sandbox.
8. Confirmar que un pago pendiente o rechazado no activa ni renueva.
9. Confirmar que un pago aprobado renueva exactamente una vez.
10. Repetir el webhook y confirmar que no duplica el periodo.

## Limpieza posterior

No eliminar pagos, webhooks o eventos de auditoria que se hayan producido
durante las pruebas. Para retirar el catalogo demo:

1. Desactivar checkout.
2. Cancelar o finalizar la suscripcion demo.
3. Archivar los planes con prefijo `demo-`.
4. Desactivar el usuario administrativo de prueba.
5. Conservar eventos y pagos para trazabilidad.
