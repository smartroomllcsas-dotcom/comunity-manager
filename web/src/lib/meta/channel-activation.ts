/**
 * Un canal sólo está «conectado» cuando el proveedor quedó suscrito.
 *
 * El problema
 * -----------
 * Crear la fila de `smarttalk.channels` deja el canal listo para **recibir**,
 * pero no hace que Meta **envíe** nada. Quien decide eso es
 * `POST /{activo}/subscribed_apps`. Hasta la iteración anterior esa llamada
 * vivía dentro de un `try { } catch { console.warn }`: si fallaba, la interfaz
 * mostraba «Facebook conectado: X», el canal quedaba `active` y no llegaba ni
 * un mensaje. Un fallo invisible, que sólo se descubría cuando el cliente
 * preguntaba por qué su bandeja estaba vacía.
 *
 * Qué hace este módulo
 * --------------------
 * Convierte la suscripción en **parte del éxito**. Tres decisiones deliberadas:
 *
 *   1. **El canal se crea `active` ANTES de suscribir, no después.** Parece al
 *      revés, pero es lo seguro: mientras el activo no esté suscrito el
 *      proveedor no envía nada, así que un canal `active` sin suscripción no
 *      puede perder mensajes. Al revés sí: suscribir primero y crear la fila
 *      después abre exactamente la ventana de §"defecto observado" —el webhook
 *      llega y no encuentra canal—.
 *
 *   2. **Si la suscripción falla, el canal NUEVO baja a `error`.** No se
 *      informa éxito, se guarda una causa saneada y queda disponible el
 *      reintento. `error` sigue reclamando el activo (`findAssetConflict` sólo
 *      libera `disconnected`): una conexión a medias no debe dejar la página
 *      suelta para que otra marca la reclame por accidente.
 *
 *   3. **Un canal que YA estaba activo no se degrada.** Reconectar sobre un
 *      canal operativo renueva el token; si la llamada de suscripción falla, la
 *      suscripción anterior sigue vigente y los mensajes siguen llegando.
 *      Bajarlo a `error` lo sacaría de `findMatchingChannel` —que filtra por
 *      `status = 'active'`— y provocaría la pérdida que se intenta evitar. Se
 *      anota la causa y se informa el fallo, pero no se rompe lo que funciona.
 *
 * Nunca se propaga la respuesta cruda del proveedor: `sanitizeProviderError`
 * recorta y limpia antes de que el texto llegue a una URL, a un log o a la base.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type MetaChannelAsset = "facebook_page" | "instagram_account" | "whatsapp_phone";

/** Nombre del canal tal y como lo lee un administrador. */
export const ACTIVATION_ASSET_LABEL: Record<MetaChannelAsset, string> = {
  facebook_page: "Messenger",
  instagram_account: "Instagram",
  whatsapp_phone: "WhatsApp",
};

/** Longitud máxima de la causa que se guarda y se muestra. */
const MAX_CAUSE_LENGTH = 160;

/**
 * Patrones que jamás deben salir de aquí.
 *
 * `subscribeWABAToApp` construye su mensaje con `JSON.stringify(error)`, así
 * que la respuesta completa de Meta —con `fbtrace_id` y, en algunas rutas, el
 * `access_token` reflejado— puede acabar dentro del texto.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/access_token=[^&\s"']+/gi, "access_token=[oculto]"],
  [/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[oculto]"'],
  [/\bEAA[A-Za-z0-9_-]{10,}/g, "[token]"],
  [/\bIGQ[A-Za-z0-9_-]{10,}/g, "[token]"],
  [/\b[A-Za-z0-9_-]{60,}\b/g, "[token]"],
];

/**
 * Causa legible, corta y sin secretos.
 *
 * Se usa en tres sitios a la vez —el parámetro `meta_error` de la redirección,
 * `config.activation_error` y el log del servidor— a propósito: si el
 * administrador y el operador leen textos distintos del mismo fallo, acaban
 * creyendo que son dos incidencias.
 */
export function sanitizeProviderError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Error desconocido del proveedor";

  let clean = raw;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    clean = clean.replace(pattern, replacement);
  }
  // Un JSON volcado entero no aporta nada al administrador y sí ruido: se deja
  // sólo la primera línea, ya sin llaves.
  clean = clean.replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();

  if (!clean) return "Error desconocido del proveedor";
  return clean.length > MAX_CAUSE_LENGTH ? `${clean.slice(0, MAX_CAUSE_LENGTH - 1)}…` : clean;
}

/**
 * ¿Este canal ya estaba operativo **con este mismo activo**?
 *
 * De esta pregunta depende si un fallo de suscripción puede dejar el canal en
 * `active`. La respuesta anterior miraba sólo el estado:
 *
 * ```ts
 * const wasActive = matches[0].status === "active"   // ← insuficiente
 * ```
 *
 * Y eso confundía dos casos que no tienen nada que ver:
 *
 *   - **Reconectar la Página A** sobre un canal que ya recibía por la Página A.
 *     Si la resuscripción falla, la anterior sigue vigente: degradar el canal lo
 *     sacaría de `findMatchingChannel` y provocaría la pérdida que se intenta
 *     evitar. Aquí conservar `active` es lo correcto.
 *   - **Conectar la Página B** sobre ese mismo canal. Es un activo **nuevo**:
 *     no existe ninguna suscripción previa que lo cubra. Si la de B falla, el
 *     canal apunta a B, no recibe nada por B, y quedarse en `active` era decir
 *     «conectado» sobre un canal mudo. Exactamente el defecto que esta serie de
 *     iteraciones persigue, colado por la puerta de la reconexión.
 *
 * Tres condiciones, todas obligatorias:
 *
 *   1. el canal estaba `active`;
 *   2. la suscripción anterior no estaba marcada como fallida
 *      (`config.webhook_subscribed === false`);
 *   3. **todos** los identificadores del activo coinciden. Para Messenger e
 *      Instagram es uno; para WhatsApp son dos —`phone_number_id` y el WABA—,
 *      porque la suscripción va contra el WABA y un número puede cambiar de
 *      cuenta.
 */
export interface OperationalAssetCheck {
  /** Estado del canal ANTES de esta conexión. */
  status: string | null | undefined;
  /** `config` del canal ANTES de esta conexión. */
  config?: Record<string, unknown> | null;
  /**
   * Identificadores emparejados `[anterior, nuevo]`. Todos deben coincidir y
   * ninguno puede estar vacío: un identificador ausente no demuestra identidad.
   */
  assetPairs: Array<[string | null | undefined, string | null | undefined]>;
}

export function wasAssetOperational({
  status,
  config,
  assetPairs,
}: OperationalAssetCheck): boolean {
  if (status !== "active") return false;

  // `false` explícito significa que la última activación no se completó: el
  // canal está `active` por inercia, no porque reciba. Un valor ausente es un
  // canal histórico, anterior a que se registrara el indicador, y se le concede
  // el beneficio de la duda.
  if ((config || {}).webhook_subscribed === false) return false;

  if (assetPairs.length === 0) return false;

  return assetPairs.every(([previous, next]) => {
    const before = (previous || "").trim();
    const after = (next || "").trim();
    return before.length > 0 && before === after;
  });
}

/**
 * Marca que se escribe **antes** de llamar al proveedor, sobre todo canal nuevo
 * o cuyo activo acaba de cambiar.
 *
 * El agujero que cierra
 * ---------------------
 * `webhook_subscribed` ausente significa «canal histórico, no se sabe», y por
 * compatibilidad el resumen de `/clients` lo muestra conectado. Eso deja una
 * ventana: entre que se crea la fila y que `persistActivation` escribe el
 * veredicto, el campo no existe. Si en ese intervalo el guardado final falla
 * —un `permission denied`, un timeout— la fila se queda en `active` **sin** el
 * campo, y la pantalla la pinta verde sobre un webhook que nunca se suscribió.
 *
 * Escribirlo en `false` de antemano invierte la carga de la prueba: el canal
 * nace no-conectado y sólo una suscripción confirmada lo asciende. Si algo se
 * rompe por el camino —el proveedor, la red o la propia base—, el estado que
 * queda es el prudente.
 *
 * `status` sigue siendo `active` desde el primer momento, y eso no cambia: es
 * lo que permite que un webhook inmediato encuentre su canal. Lo que cambia es
 * que la **interfaz** no lo da por conectado hasta ver `webhook_subscribed`
 * en `true`.
 */
export const PENDING_SUBSCRIPTION_CONFIG = {
  webhook_subscribed: false,
  webhook_subscribed_at: null,
} as const;

export interface ActivationTarget {
  channelId: string;
  asset: MetaChannelAsset;
  assetId: string;
  /**
   * El canal ya estaba operativo **con este mismo activo**. Lo calcula
   * `wasAssetOperational`; no basta con que el estado fuera `active`.
   */
  wasActive: boolean;
  /** Llamada real al proveedor. Debe lanzar si la suscripción no se completó. */
  subscribe: () => Promise<unknown>;
}

export interface ActivationFailure {
  channelId: string;
  asset: MetaChannelAsset;
  /** Causa saneada, apta para mostrar y para guardar. */
  cause: string;
  /** El canal quedó en `error` (conexión nueva) en vez de conservar `active`. */
  degraded: boolean;
  /**
   * El veredicto llegó a la base.
   *
   * `false` significa que ni siquiera se pudo dejar constancia de lo ocurrido:
   * el estado del canal puede no corresponderse con la realidad y hay que
   * reintentar. Nunca acompaña a un `ok: true`.
   */
  persisted: boolean;
}

export interface ActivationOutcome {
  ok: boolean;
  failures: ActivationFailure[];
}

interface PersistResult {
  /** El estado del canal quedó escrito tal y como manda el veredicto. */
  persisted: boolean;
  /** Causa saneada del fallo de persistencia, si lo hubo. */
  error?: string;
}

/**
 * Escribe el veredicto de la activación en el canal.
 *
 * Todos los errores —de lectura y de escritura— se comprueban y se propagan.
 * Antes se ignoraban, y eso creaba una variante del mismo defecto que este
 * módulo existe para cerrar: la suscripción fallaba, el UPDATE a `error`
 * también, y `activateChannels` respondía como si el canal hubiera quedado
 * marcado. La interfaz mostraba un fallo recuperable sobre una fila que seguía
 * diciendo `active`; peor aún, en el camino de éxito se informaba «conectado»
 * sin que el estado se hubiera guardado.
 */
async function persistActivation(
  channelId: string,
  patch: Record<string, unknown>,
  configPatch: Record<string, unknown>,
): Promise<PersistResult> {
  const smarttalk = createAdminClient("smarttalk");
  const { data, error: readError } = await smarttalk
    .from("channels")
    .select("config")
    .eq("id", channelId)
    .maybeSingle();

  if (readError) {
    // El estado tiene que escribirse igual: si la suscripción falló y el canal
    // se queda en `active`, vuelve el defecto original —una marca que dice
    // recibir y no recibe—. Pero NO se puede escribir `config` a ciegas: un
    // objeto vacío borraría `legacy_id`, del que depende el enrutamiento del
    // webhook. Se actualiza sólo el estado y se reporta el fallo igualmente:
    // el reintento es idempotente, así que pedirlo no cuesta nada y deja los
    // metadatos completos.
    const { error: statusError } = await smarttalk
      .from("channels")
      .update(patch)
      .eq("id", channelId);

    const cause = statusError
      ? `no se pudo guardar el estado del canal (${sanitizeProviderError(statusError.message)})`
      : `no se pudo leer la configuración del canal (${sanitizeProviderError(readError.message)})`;
    console.error(`[meta-activation] persistencia incompleta en ${channelId}: ${cause}`);
    return { persisted: false, error: cause };
  }

  const currentConfig = ((data as { config?: Record<string, unknown> } | null)?.config ||
    {}) as Record<string, unknown>;

  const { error: updateError } = await smarttalk
    .from("channels")
    .update({ ...patch, config: { ...currentConfig, ...configPatch } })
    .eq("id", channelId);

  if (updateError) {
    const cause = `no se pudo guardar el estado del canal (${sanitizeProviderError(updateError.message)})`;
    console.error(`[meta-activation] persistencia fallida en ${channelId}: ${cause}`);
    return { persisted: false, error: cause };
  }

  return { persisted: true };
}

/**
 * Suscribe cada activo y deja el estado del canal acorde al resultado.
 *
 * Secuencial a propósito: son dos o tres llamadas y un fallo de la primera
 * cambia el mensaje de la última. La concurrencia aquí no compra nada y sí
 * complica el orden de los `console.error`.
 */
export async function activateChannels(
  targets: ActivationTarget[],
): Promise<ActivationOutcome> {
  const failures: ActivationFailure[] = [];
  const activatedAt = new Date().toISOString();

  for (const target of targets) {
    let subscriptionError: unknown = null;
    try {
      await target.subscribe();
    } catch (error) {
      subscriptionError = error;
    }

    if (!subscriptionError) {
      const persistence = await persistActivation(
        target.channelId,
        { status: "active", updated_at: activatedAt },
        {
          webhook_subscribed: true,
          webhook_subscribed_at: activatedAt,
          activation_error: null,
          activation_failed_at: null,
          // Una activación correcta borra también la advertencia de un intento
          // anterior: ya no hay nada que avisar.
          activation_warning: null,
          activation_warning_at: null,
        },
      );

      // Suscripción correcta pero estado sin guardar: no es un éxito. Decir
      // «conectado» aquí sería afirmar algo que no se pudo comprobar ni dejar
      // escrito, que es la clase de mentira que esta iteración persigue.
      if (!persistence.persisted) {
        failures.push({
          channelId: target.channelId,
          asset: target.asset,
          cause: `La suscripción se completó pero ${persistence.error}`,
          degraded: false,
          persisted: false,
        });
      }
      continue;
    }

    const cause = sanitizeProviderError(subscriptionError);
    const degraded = !target.wasActive;

    console.error("[meta-activation] suscripción rechazada por el proveedor", {
      channelId: target.channelId,
      asset: target.asset,
      degraded,
      cause,
    });

    // Qué se escribe depende de si había una suscripción anterior que siga
    // funcionando.
    //
    //   - Activo nuevo (o canal que no estaba operativo): la suscripción que
    //     importa es la que acaba de fallar, así que el canal baja a `error` y
    //     `webhook_subscribed` pasa a `false`. No recibe, y así se dice.
    //   - Mismo activo ya operativo: la suscripción anterior sigue en pie y el
    //     canal sigue recibiendo. Escribir `webhook_subscribed: false` sería
    //     falso —y, con la regla de §B2, pintaría «pendiente de activación» un
    //     canal que funciona—. El fallo se guarda como **advertencia aparte**,
    //     sin tocar el indicador operativo.
    const persistence = await persistActivation(
      target.channelId,
      degraded ? { status: "error", updated_at: activatedAt } : { updated_at: activatedAt },
      degraded
        ? {
            webhook_subscribed: false,
            activation_error: cause,
            activation_failed_at: activatedAt,
            activation_warning: null,
            activation_warning_at: null,
          }
        : {
            activation_warning: cause,
            activation_warning_at: activatedAt,
          },
    );

    failures.push({
      channelId: target.channelId,
      asset: target.asset,
      cause: persistence.persisted ? cause : `${cause} · Además, ${persistence.error}`,
      degraded,
      persisted: persistence.persisted,
    });
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Mensaje único para el administrador cuando alguna suscripción falló.
 *
 * Dice las tres cosas que necesita: qué canal, por qué, y que puede reintentar
 * sin volver a pasar por el diálogo de Meta.
 */
export function activationErrorMessage(failures: ActivationFailure[]): string {
  const labels = [...new Set(failures.map((failure) => ACTIVATION_ASSET_LABEL[failure.asset]))];
  const cause = failures[0]?.cause || "Error desconocido del proveedor";
  return (
    `No se completó la suscripción al webhook de ${labels.join(" y ")}: ${cause}. ` +
    "El canal quedó pendiente de activación; usa «Reintentar activación» para completarla."
  );
}
