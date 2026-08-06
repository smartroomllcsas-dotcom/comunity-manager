// Integración QA · Requisito 2: ePayco aprobado, rechazado y pendiente.
// Ejercita la RUTA REAL POST /api/epayco/confirmation con una firma válida y
// verifica: (a) el mapeo de estado del pago, (b) el efecto sobre el checkout y
// (c) que el RPC de activación finalize_epayco_approved_payment se invoca
// EXCLUSIVAMENTE cuando el pago es aprobado. Supabase es un doble en memoria.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const CUSTOMER_ID = "qa-cust-id";
const P_KEY = "qa-p-key";

// Las claves ePayco se leen en el nivel de módulo de lib/epayco/client, por lo
// que deben existir ANTES de importar la ruta (vi.hoisted corre antes de los imports).
vi.hoisted(() => {
  process.env.EPAYCO_CUSTOMER_ID = "qa-cust-id";
  process.env.EPAYCO_P_KEY = "qa-p-key";
});

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { mapEpaycoStatus } from "@/lib/epayco/client";
import { POST as confirmation } from "@/app/api/epayco/confirmation/route";

const future = () => new Date(Date.now() + 3_600_000).toISOString();

function sign(p: { x_ref_payco: string; x_transaction_id: string; x_amount: string; x_currency_code: string }) {
  const raw = [CUSTOMER_ID, P_KEY, p.x_ref_payco, p.x_transaction_id, p.x_amount, p.x_currency_code].join("^");
  return createHash("sha256").update(raw).digest("hex");
}

function buildParams(codResponse: string, txnId: string) {
  const base = {
    x_cust_id_cliente: CUSTOMER_ID,
    x_ref_payco: "REF-PAYCO-1",
    x_transaction_id: txnId,
    x_amount: "59000.00",
    x_currency_code: "COP",
    x_cod_response: codResponse,
    x_response: codResponse,
    x_extra1: "cs-1",       // checkout_session_id
    x_extra2: "INV-1",      // internal_reference
    x_id_invoice: "INV-1",
    x_test_request: "true",
    x_franchise: "VISA",
  };
  return { ...base, x_signature: sign(base) };
}

// Objeto mínimo con la superficie de NextRequest que usa la ruta (POST + formData()).
function makeRequest(params: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) fd.set(k, v);
  return { method: "POST", formData: async () => fd } as unknown as Parameters<typeof confirmation>[0];
}

function seed() {
  H.current = createFakeSupabase({
    tables: {
      checkout_sessions: [
        {
          id: "cs-1", internal_reference: "INV-1", organization_id: "org-1",
          plan_id: "plan-1", plan_price_id: "pp-1", status: "pending",
          amount_minor: 5_900_000, currency: "COP", test_mode: true,
          environment: "sandbox", purpose: "subscription", expires_at: future(),
        },
      ],
      billing_webhook_events: [],
      payments: [],
    },
  });
}

const payments = () => H.current!.store.payments as Array<Record<string, unknown>>;
const checkout = () => (H.current!.store.checkout_sessions as Array<Record<string, unknown>>)[0];
const webhookEvents = () => H.current!.store.billing_webhook_events as Array<Record<string, unknown>>;
const rpcNames = () => H.current!.rpcCalls.map((c) => c.name);

describe("Integración QA · ePayco — mapeo de estado (función real)", () => {
  it.each([
    ["1", "approved"], ["2", "rejected"], ["3", "pending"], ["4", "failed"],
  ] as const)("x_cod_response=%s => %s", (code, expected) => {
    expect(mapEpaycoStatus(code)).toBe(expected);
  });
  it("código desconocido o vacío => pending (fail-safe)", () => {
    expect(mapEpaycoStatus("")).toBe("pending");
    expect(mapEpaycoStatus("99")).toBe("pending");
  });
});

describe("Integración QA · ePayco — POST /api/epayco/confirmation (ruta real)", () => {
  beforeEach(() => seed());

  it("APROBADO: registra pago approved, invoca finalize_epayco_approved_payment y procesa el evento", async () => {
    const res = await confirmation(makeRequest(buildParams("1", "TXN-APPROVED")));
    const body = (await res.json()) as { status?: string; ignored?: boolean; duplicate?: boolean };

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });

    // (a) estado del pago
    expect(payments()).toHaveLength(1);
    expect(payments()[0].status).toBe("approved");
    expect(payments()[0].approved_at).not.toBeNull();

    // (b) checkout: en aprobado la activación la hace el RPC (la ruta no cambia el estado aquí)
    expect(checkout().status).toBe("pending");

    // (c) RPC de activación invocado con los identificadores correctos
    expect(rpcNames()).toContain("finalize_epayco_approved_payment");
    const call = H.current!.rpcCalls.find((c) => c.name === "finalize_epayco_approved_payment")!;
    expect(call.args).toMatchObject({
      p_checkout_session_id: "cs-1",
      p_payment_id: payments()[0].id,
      p_event_key: "TXN-APPROVED",
    });

    // evento webhook procesado
    expect(webhookEvents()[0].status).toBe("processed");
  });

  it("RECHAZADO: registra pago rejected, marca el checkout rejected y NO invoca el RPC", async () => {
    const res = await confirmation(makeRequest(buildParams("2", "TXN-REJECTED")));
    const body = (await res.json()) as { status?: string };

    expect(body).toEqual({ status: "ok" });
    expect(payments()[0].status).toBe("rejected");
    expect(payments()[0].approved_at).toBeNull();
    expect(checkout().status).toBe("rejected");
    expect(checkout().completed_at).not.toBeNull();
    expect(rpcNames()).not.toContain("finalize_epayco_approved_payment");
  });

  it("PENDIENTE: registra pago pending, deja el checkout pending sin completar y NO invoca el RPC", async () => {
    const res = await confirmation(makeRequest(buildParams("3", "TXN-PENDING")));
    const body = (await res.json()) as { status?: string };

    expect(body).toEqual({ status: "ok" });
    expect(payments()[0].status).toBe("pending");
    expect(checkout().status).toBe("pending");
    expect(checkout().completed_at).toBeNull();
    expect(rpcNames()).not.toContain("finalize_epayco_approved_payment");
  });

  it("FIRMA INVÁLIDA: la ruta rechaza con 400 y no registra pago", async () => {
    const params = { ...buildParams("1", "TXN-BADSIG"), x_signature: "deadbeef" };
    const res = await confirmation(makeRequest(params));
    expect(res.status).toBe(400);
    expect(payments()).toHaveLength(0);
    expect(rpcNames()).not.toContain("finalize_epayco_approved_payment");
  });
});
