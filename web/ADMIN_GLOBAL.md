# Administrador global

## Cuenta autorizada

La migracion `20260801000100_014_global_admin_bootstrap.sql` registra
`leonelzc2005@gmail.com` en `smarttalk.platform_admin_allowlist`. Cuando ese
correo se registra o inicia sesion, el trigger lo promueve a:

- `is_super_admin = true`
- `role = admin`
- `member_type = agency_user`

No se almacena ninguna contrasena en la migracion. La cuenta debe crearse
desde el flujo normal de registro y despues iniciar sesion.

## Acceso

El panel global esta en `/admin` y contiene:

- Organizaciones, planes y estados de actividad.
- Suscripciones, pagos y pasarelas.
- Activacion, suspension, cancelacion y reactivacion de suscripciones.
- Revision global de usuarios, contactos y canales mediante RLS de superadmin.

## Sin limites comerciales

El backend reconoce `is_super_admin` antes de evaluar los limites de los
planes. El superadministrador puede conectar canales y crear recursos de
prueba sin consumir los cupos de una suscripcion de cliente.

## Validacion

1. Crear la cuenta con el correo autorizado.
2. Iniciar sesion nuevamente para establecer la sesion Supabase.
3. Abrir `/admin`.
4. Confirmar que aparecen organizaciones, planes, suscripciones y pagos.
5. Probar `/settings/channels` con una marca de la organizacion del admin.
