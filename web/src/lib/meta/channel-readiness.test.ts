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
