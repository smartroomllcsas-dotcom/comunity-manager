import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "@/qa-e2e/helpers/fake-supabase";
import { createFakeSupabase } from "@/qa-e2e/helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => H.current!.admin(),
}));

import { ensureMetaChannelsReady } from "./channel-readiness";

function input(brandId: string, pageId: string, instagramId: string) {
  return {
    organizationId: "org-1",
    brandId,
    legacyAccountId: `legacy-${brandId}`,
    page: { id: pageId, name: `Página ${brandId}` },
    instagram: { id: instagramId, username: `ig_${brandId}` },
    pageAccessTokenCiphertext: `cipher-${brandId}`,
    connectedAt: "2026-08-14T14:00:00.000Z",
    tokenExpiresAt: "2026-10-14T14:00:00.000Z",
    includeInstagram: true,
  };
}

describe("ensureMetaChannelsReady · aislamiento multimarcas", () => {
  beforeEach(() => {
    H.current = createFakeSupabase({ tables: { channels: [] } });
  });

  it("deja Facebook e Instagram listos antes de terminar el OAuth", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    expect(H.current!.store.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          brand_id: "brand-a",
          type: "facebook_messenger",
          status: "active",
          meta_business_id: "page-a",
        }),
        expect.objectContaining({
          brand_id: "brand-a",
          type: "instagram",
          status: "active",
          meta_business_id: "ig-a",
        }),
      ])
    );
  });

  it("mantiene activos distintos en marcas distintas de la misma agencia", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    await ensureMetaChannelsReady(input("brand-b", "page-b", "ig-b"));

    const channels = H.current!.store.channels;
    expect(channels).toHaveLength(4);
    expect(channels.filter((row) => row.brand_id === "brand-a")).toHaveLength(2);
    expect(channels.filter((row) => row.brand_id === "brand-b")).toHaveLength(2);
    expect(new Set(channels.map((row) => row.meta_business_id))).toEqual(
      new Set(["page-a", "ig-a", "page-b", "ig-b"])
    );
  });

  it("reconectar actualiza la marca correcta sin duplicar canales", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    await ensureMetaChannelsReady({
      ...input("brand-a", "page-a", "ig-a"),
      pageAccessTokenCiphertext: "cipher-renovado",
    });

    expect(H.current!.store.channels).toHaveLength(2);
    expect(H.current!.store.channels.every(
      (row) => row.access_token_ciphertext === "cipher-renovado"
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// El valor de retorno es el contrato con `activateChannels`: sin identificador
// no hay a qué canal aplicarle el veredicto del proveedor, y sin `wasActive` no
// se puede distinguir una conexión nueva —degradable a `error`— de una
// reconexión sobre un canal que ya recibía.
// ---------------------------------------------------------------------------
describe("ensureMetaChannelsReady · contrato con la activación", () => {
  beforeEach(() => {
    H.current = createFakeSupabase({ tables: { channels: [] } });
  });

  it("devuelve el identificador y el activo de cada canal preparado", async () => {
    const ready = await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    expect(ready).toHaveLength(2);
    expect(ready.map((channel) => [channel.type, channel.assetId])).toEqual([
      ["facebook_messenger", "page-a"],
      ["instagram", "ig-a"],
    ]);
    expect(ready.every((channel) => Boolean(channel.id))).toBe(true);
  });

  it("un canal nuevo se marca como no activo previamente", async () => {
    const ready = await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    expect(ready.every((channel) => channel.wasActive === false)).toBe(true);
  });

  it("un canal nuevo nace con webhook_subscribed en false", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    // Escrito ANTES de llamar a Meta: si el guardado del veredicto falla
    // después, lo que queda es `false` y la interfaz no lo da por conectado.
    expect(
      H.current!.store.channels.every(
        (row) => (row.config as Record<string, unknown>).webhook_subscribed === false,
      ),
    ).toBe(true);
  });

  /**
   * Emula lo que hace `activateChannels` tras una suscripción confirmada. Sin
   * este paso el canal existe pero nunca llegó a estar operativo, así que una
   * segunda pasada de `ensureMetaChannelsReady` NO puede declararlo `wasActive`:
   * es justamente la ventana que la iteración 25 cierra.
   */
  function marcarSuscrito() {
    H.current!.store.channels.forEach((row) => {
      (row.config as Record<string, unknown>).webhook_subscribed = true;
    });
  }

  it("una reconexión sobre un canal YA suscrito lo declara wasActive", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    marcarSuscrito();

    const ready = await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    expect(ready.every((channel) => channel.wasActive === true)).toBe(true);
  });

  it("una reconexión sobre un canal creado pero nunca suscrito NO es wasActive", async () => {
    // El canal quedó `active` para poder enrutar, pero su suscripción jamás se
    // confirmó. Tratarlo como operativo permitiría que un fallo posterior lo
    // dejara pareciendo conectado.
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    const ready = await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    expect(ready.every((channel) => channel.wasActive === false)).toBe(true);
  });

  it("una reconexión del mismo activo suscrito conserva el indicador", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    marcarSuscrito();

    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));

    // No se degrada a `false`: la suscripción anterior sigue vigente.
    expect(
      H.current!.store.channels.every(
        (row) => (row.config as Record<string, unknown>).webhook_subscribed === true,
      ),
    ).toBe(true);
  });

  it("cambiar de activo resetea el indicador a false", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    marcarSuscrito();

    await ensureMetaChannelsReady(input("brand-a", "page-NUEVA", "ig-NUEVA"));

    // Heredar el `true` de la página anterior haría pasar por operativa una
    // página que aún no tiene suscripción.
    expect(
      H.current!.store.channels.every(
        (row) => (row.config as Record<string, unknown>).webhook_subscribed === false,
      ),
    ).toBe(true);
  });

  it("un canal que estaba en error NO cuenta como activo previo", async () => {
    await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    H.current!.store.channels.forEach((row) => {
      row.status = "error";
    });

    const ready = await ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"));
    expect(ready.every((channel) => channel.wasActive === false)).toBe(true);
  });

  it("sin Instagram sólo prepara el canal de Messenger", async () => {
    const ready = await ensureMetaChannelsReady({
      ...input("brand-a", "page-a", "ig-a"),
      includeInstagram: false,
    });

    expect(ready).toHaveLength(1);
    expect(ready[0].type).toBe("facebook_messenger");
    expect(H.current!.store.channels).toHaveLength(1);
  });

  it("una violación de unicidad se traduce al mensaje de conflicto acordado", async () => {
    // El índice único de la migración 038: dos conexiones simultáneas sobre el
    // mismo activo. La segunda recibe 23505 y no debe propagar el texto de
    // PostgreSQL, que habla de un índice que el administrador no conoce.
    H.current = createFakeSupabase({
      tables: { channels: [] },
      uniqueIndexes: { channels: [["type", "meta_business_id"]] },
    });

    await ensureMetaChannelsReady({
      ...input("brand-a", "page-compartida", "ig-a"),
      includeInstagram: false,
    });

    await expect(
      ensureMetaChannelsReady({
        ...input("brand-b", "page-compartida", "ig-b"),
        includeInstagram: false,
      }),
    ).rejects.toThrow("ya está conectado a otra marca");

    expect(H.current!.store.channels).toHaveLength(1);
  });

  it("dos canales del mismo tipo en la marca bloquean en vez de elegir uno", async () => {
    H.current = createFakeSupabase({
      tables: {
        channels: [
          { id: "ch-1", organization_id: "org-1", brand_id: "brand-a", type: "facebook_messenger", status: "active" },
          { id: "ch-2", organization_id: "org-1", brand_id: "brand-a", type: "facebook_messenger", status: "active" },
        ],
      },
    });

    await expect(ensureMetaChannelsReady(input("brand-a", "page-a", "ig-a"))).rejects.toThrow(
      "enrutamiento ambiguo",
    );
  });
});
