"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GatewayRow {
  gateway: "epayco" | "wompi" | "payu";
  display_name: string;
  is_enabled: boolean;
  checkout_enabled: boolean;
  environment: "sandbox" | "production";
  renewal_mode: "manual" | "automatic";
  priority: number;
  runtime?: {
    configured: boolean;
    activationReady: boolean;
    capabilities: {
      hostedCheckout: boolean;
      paymentSources: boolean;
      automaticRenewal: boolean;
    };
  };
  runtime_environment: "sandbox" | "production";
}

export default function PaymentGatewaysPage() {
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadGateways() {
    setLoading(true);
    const response = await fetch("/api/admin/payment-gateways", {
      cache: "no-store",
    });
    const payload = await response.json();
    setGateways(response.ok ? payload.gateways || [] : []);
    setLoading(false);
  }

  useEffect(() => {
    void loadGateways();
  }, []);

  async function updateGateway(
    gateway: GatewayRow["gateway"],
    changes: Partial<GatewayRow>
  ) {
    setSaving(gateway);
    const response = await fetch("/api/admin/payment-gateways", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gateway, ...changes }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      alert(payload?.error || "No se pudo actualizar la pasarela");
    }
    await loadGateways();
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8b949e]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Pasarelas de pago</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Configuracion operativa. Las credenciales se administran en variables de entorno.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadGateways}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        La renovacion permanece manual. Activar una pasarela no habilita cobros
        automaticos ni guarda tarjetas.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {gateways.map((item) => {
          const busy = saving === item.gateway;
          const environmentMatches =
            item.environment === item.runtime_environment;
          return (
            <section
              key={item.gateway}
              className="rounded-xl border border-[#1e2433] bg-[#0d1117] p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">
                      {item.display_name}
                    </h2>
                    <p className="text-xs text-[#8b949e] uppercase">
                      {item.gateway}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    item.runtime?.configured
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {item.runtime?.configured ? "Credenciales listas" : "Faltan variables"}
                </span>
              </div>

              <label className="flex items-center justify-between text-sm text-white">
                Pasarela habilitada
                <input
                  type="checkbox"
                  checked={item.is_enabled}
                  disabled={
                    busy ||
                    (!item.runtime?.configured && !item.is_enabled)
                  }
                  onChange={(event) =>
                    void updateGateway(item.gateway, {
                      is_enabled: event.target.checked,
                      checkout_enabled: event.target.checked
                        ? item.checkout_enabled
                        : false,
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between text-sm text-white">
                Checkout habilitado
                <input
                  type="checkbox"
                  checked={item.checkout_enabled}
                  disabled={
                    busy ||
                    !item.is_enabled ||
                    (!item.runtime?.activationReady &&
                      !item.checkout_enabled)
                  }
                  onChange={(event) =>
                    void updateGateway(item.gateway, {
                      checkout_enabled: event.target.checked,
                    })
                  }
                />
              </label>

              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  Ambiente
                </label>
                <select
                  value={item.environment}
                  disabled={busy}
                  onChange={(event) =>
                    void updateGateway(item.gateway, {
                      environment: event.target.value as "sandbox" | "production",
                    })
                  }
                  className="w-full bg-[#161b22] border border-[#2d333b] rounded-md px-3 py-2 text-sm text-white"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Produccion</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck
                  className={`h-4 w-4 ${
                    environmentMatches ? "text-emerald-400" : "text-red-400"
                  }`}
                />
                <span
                  className={
                    environmentMatches ? "text-emerald-300" : "text-red-300"
                  }
                >
                  Runtime: {item.runtime_environment}
                  {environmentMatches ? " coincide" : " no coincide"}
                </span>
              </div>

              <div className="border-t border-[#1e2433] pt-3 text-xs text-[#8b949e] space-y-1">
                <p>
                  Activacion por webhook:{" "}
                  {item.runtime?.activationReady
                    ? "operativa"
                    : "pendiente de implementacion y certificacion"}
                </p>
                <p>Renovacion: manual</p>
                <p>
                  Fuentes de pago:{" "}
                  {item.runtime?.capabilities.paymentSources ? "preparado" : "no"}
                </p>
                <p>
                  Cobro automatico:{" "}
                  {item.runtime?.capabilities.automaticRenewal
                    ? "arquitectura preparada"
                    : "no soportado"}
                </p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
