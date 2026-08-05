# Equipo por marca y aislamiento de datos

## Objetivo

Una organizacion (agencia) administra varias marcas. Cada marca mantiene sus
canales, contactos y conversaciones separados. La agencia puede delegar la
operacion de una marca sin dar visibilidad sobre las demas.

## Roles

| Tipo de miembro | Alcance | Puede administrar equipo | Puede crear marcas |
| --- | --- | --- | --- |
| Usuario de agencia | Todas las marcas de su organizacion | Si, si tiene rol `admin` | Si, si tiene rol `admin` |
| Administrador de marca | Una sola marca asignada | Solo asesores de su marca | No |
| Asesor de marca | Una o varias marcas asignadas | No | No |

Un administrador de marca puede conectar, editar y desconectar canales de su
marca. Un asesor solo opera los leads y conversaciones que pertenezcan a las
marcas asignadas.

## Limites de planes

- La cantidad de marcas sigue controlada por `BRANDS_TOTAL`.
- Cada marca admite un unico administrador de marca. El administrador no
  consume un cupo adicional: queda limitado de forma natural por el numero de
  marcas contratadas.
- Los asesores consumen `BRAND_ADVISORS_TOTAL` y
  `BRAND_ADVISORS_PER_BRAND`.
- Los usuarios internos de la agencia consumen `AGENCY_USERS`.

Las validaciones se ejecutan en las rutas de backend de invitaciones y equipo.
Ocultar un boton en el frontend no se considera una medida de seguridad.

## Aislamiento aplicado

El acceso se filtra en backend para:

- Marcas y sus canales.
- Contactos, conversaciones y mensajes del inbox.
- Conteos y badges del inbox.
- Acciones de resolver, posponer, notas y envio de mensajes.
- Conexiones Meta y WhatsApp por marca.
- Equipo e invitaciones visibles para un administrador de marca.

Las politicas RLS de Supabase tambien restringen `channels`, `contacts` y
`conversations` mediante la marca asignada. Un asesor no puede obtener datos de
otra marca modificando una URL o llamando una API manualmente.

## Migracion requerida

Aplicar primero, una sola vez, en el proyecto Supabase de CommunityManager:

`web/supabase/migrations/20260804000000_026_brand_administrators.sql`

La migracion:

1. Agrega `brand_admin` como tipo de miembro.
2. Reutiliza las asignaciones existentes por marca.
3. Garantiza un administrador por marca.
4. Amplia las politicas de acceso por marca para el nuevo rol.

No ejecutar esta migracion en otro proyecto ni cambiar manualmente las
politicas RLS mientras se esta aplicando.

## Flujo operativo

1. Ingresar como administrador de agencia.
2. Crear la marca desde `Marcas` si aun no existe.
3. Abrir `Equipo` en el menu lateral.
4. Invitar una persona y elegir `Administrador de marca`.
5. Seleccionar exactamente una marca y enviar la invitacion.
6. El administrador acepta la invitacion y entra a `Equipo`.
7. Desde ese mismo modulo invita `Asesores de marca` para su marca.
8. Probar que cada asesor ve solo sus leads, canales y conversaciones.

En el menu compacto, `Equipo` se identifica con el icono de usuario con
engranaje. Al pasar el cursor se muestra el texto `Equipo`.

## Pruebas de aceptacion

1. Crear dos marcas en la misma agencia, cada una con un canal conectado.
2. Crear un administrador para la primera marca y un asesor para esa marca.
3. Iniciar sesion como el asesor y confirmar que no aparecen datos de la
   segunda marca en `Marcas`, `Inbox`, `Leads` ni `Canales`.
4. Intentar abrir una conversacion de la segunda marca cambiando su id en la
   URL o desde una llamada API: debe responder `404` o `403`.
5. Confirmar que el administrador de marca solo puede invitar asesores de su
   propia marca.
6. Intentar asignar un segundo administrador a la misma marca: debe ser
   rechazado.
7. Probar el limite de asesores definido en el plan contratado.
8. Verificar que el administrador de agencia conserva la vista completa.

## Despliegue y reversa

Orden seguro:

1. Respaldar la base de datos desde Supabase.
2. Aplicar la migracion indicada.
3. Desplegar el codigo que contiene este documento y la migracion.
4. Ejecutar las pruebas de aceptacion en una agencia de prueba.
5. Activar `BILLING_ENFORCEMENT_MODE=hard` solo despues de validar los limites.

Si aparece una incidencia, revertir primero el despliegue de aplicacion a la
version anterior. No eliminar a mano la migracion ni las politicas RLS. Para
recuperar temporalmente a un miembro, un administrador de agencia puede volver
a clasificarlo como `Usuario de agencia` desde `Equipo`.
