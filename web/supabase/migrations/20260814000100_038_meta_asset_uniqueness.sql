-- 038 · Unicidad del activo de Meta en smarttalk.channels
-- ===========================================================================
-- PROPUESTA. NO EJECUTADA. Pendiente de revisión de Codex.
--
-- Por qué hace falta
-- ------------------
-- `findAssetConflict` comprueba en la aplicación que una página, una cuenta de
-- Instagram o un número de WhatsApp no queden en dos marcas activas. Esa
-- comprobación es un SELECT seguido de un INSERT: entre los dos hay una ventana
-- en la que una segunda petición lee lo mismo y concluye lo mismo. Con dos
-- pestañas —o dos administradores— reclamando la misma página a la vez, ambas
-- ganan y `findMatchingChannel` acaba rechazando el evento por ambigüedad:
--
--     [meta-webhook] ambiguous channel routing; refusing event
--
-- Es decir: la carrera no produce un error visible en la conexión, produce la
-- pérdida silenciosa de TODOS los mensajes de esa página. La única forma de
-- cerrarla es que la base rechace la segunda escritura.
--
-- WhatsApp ya está cubierto por `uq_channels_whatsapp_phone` (migración 013).
-- Messenger e Instagram no tienen nada equivalente: esta migración lo añade.
--
-- Decisiones
-- ----------
--   * **Índice parcial por `status`.** Un canal `disconnected` no reclama el
--     activo —es la misma regla que aplica `findAssetConflict`—, así que queda
--     fuera del índice y su página se puede reasignar. Un canal en `error` SÍ
--     cuenta: es una conexión existente pendiente de activación, no una
--     liberada.
--   * **Global, no por organización.** Meta enruta los webhooks por el activo,
--     no por la agencia, y `findMatchingChannel` no filtra por organización. Si
--     dos agencias conectaran la misma página, la ambigüedad sería idéntica.
--     Es también el criterio que ya sigue `uq_channels_whatsapp_phone`.
--   * **Incluye `type`.** Una cuenta de Instagram y una página son activos
--     distintos que comparten columna; sin `type` en la tupla, un identificador
--     que coincidiera entre ambos espacios bloquearía sin motivo.
--
-- Antes de aplicar
-- ----------------
-- El bloque de comprobación aborta si ya existen duplicados en producción. Es
-- deliberado: crear el índice con datos sucios fallaría a mitad y dejaría la
-- migración marcada como fallida. Para ver qué hay que limpiar, y sin escribir
-- nada:
--
--     node scripts/audit-meta-duplicates.mjs
--
-- Reversión
-- ---------
--     DROP INDEX IF EXISTS smarttalk.ux_channels_meta_asset_active;
--
-- Idempotente: se puede volver a ejecutar sin efecto.

SET search_path TO smarttalk, public, extensions;

DO $$
DECLARE
  duplicated_assets TEXT;
BEGIN
  SELECT string_agg(format('%s:%s (%s canales)', type, meta_business_id, total), ', ')
  INTO duplicated_assets
  FROM (
    SELECT type, meta_business_id, COUNT(*) AS total
    FROM smarttalk.channels
    WHERE meta_business_id IS NOT NULL
      AND status <> 'disconnected'
    GROUP BY type, meta_business_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicated_assets IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede imponer la unicidad del activo: hay activos en más de un canal activo (%). Ejecuta scripts/audit-meta-duplicates.mjs y desconecta el canal sobrante antes de reintentar.',
      duplicated_assets;
  END IF;
END $$;

-- Un activo de Meta pertenece a un solo canal operativo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_channels_meta_asset_active
  ON smarttalk.channels(type, meta_business_id)
  WHERE meta_business_id IS NOT NULL
    AND status <> 'disconnected';

COMMENT ON INDEX smarttalk.ux_channels_meta_asset_active IS
  'Una página de Facebook o cuenta de Instagram sólo puede estar en un canal no desconectado. Cierra la carrera entre dos conexiones simultáneas que findAssetConflict no puede cerrar desde la aplicación.';
