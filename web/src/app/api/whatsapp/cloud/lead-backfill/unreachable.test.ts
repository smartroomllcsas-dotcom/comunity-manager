import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/cm-client-access", () => ({ getCmClientAccess: vi.fn() }));
vi.mock("@/lib/whatsapp/cloud/lead-engagement", () => ({ sendFirstTouchTemplate: vi.fn() }));
vi.mock("@/lib/smarttalk/lead-alerts", () => ({ notifyLeadNeedsManualContact: vi.fn() }));
import { isUnreachableReason } from "./route";

describe("isUnreachableReason", () => {
  it("never attempted / rate limited → retryable", () => {
    expect(isUnreachableReason(null, false)).toBe(false);
    expect(isUnreachableReason("no_enviado (rate_limited)", false)).toBe(false);
  });
  it("WhatsApp rejected the number → unreachable", () => {
    expect(isUnreachableReason("fallido (el número no tiene WhatsApp o no acepta mensajes)", false)).toBe(true);
    expect(isUnreachableReason("fallido (más de 24 h sin entregarse)", false)).toBe(true);
    expect(isUnreachableReason("no_enviado (invalid_phone)", false)).toBe(true);
  });
  it("Meta marketing limit → unreachable until the Utility template is approved", () => {
    const r = "fallido (Meta limitó los mensajes de marketing a este número)";
    expect(isUnreachableReason(r, false)).toBe(true);
    expect(isUnreachableReason(r, true)).toBe(false);
  });
});
