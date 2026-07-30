"use client";
import { useState, useEffect } from "react";
import { Loader2, Plus, Save, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/types/database";

const emptyPlan = {
  name: "",
  max_agents: 2,
  max_contacts: 500,
  max_broadcasts_per_month: 5,
  max_chatbot_flows: 3,
  ai_enabled: false,
  price_monthly: 0,
  currency: "COP",
  provider: "epayco",
  max_brands: 1,
  max_channels: 3,
  max_messages_per_month: 1000,
  status: "draft",
  is_public: false,
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyPlan);
  const [saving, setSaving] = useState(false);

  async function loadPlans() {
    const response = await fetch("/api/admin/plans", { cache: "no-store" });
    const payload = await response.json();
    setPlans(response.ok ? (payload.plans as Plan[]) || [] : []);
    setLoading(false);
  }

  useEffect(() => { loadPlans(); }, []);

  function startEdit(plan: Plan) {
    const limitFor = (featureCode: string, fallback: number) => {
      const entitlement = plan.entitlements?.find(
        (item) => item.feature_code === featureCode
      );
      return entitlement
        ? entitlement.limit_value ?? -1
        : fallback;
    };
    const activePrice = plan.prices?.find(
      (price) => price.is_active && price.billing_interval === "month"
    );
    setEditing(plan.id);
    setCreating(false);
    setForm({
      name: plan.name,
      max_agents: plan.max_agents,
      max_contacts: plan.max_contacts,
      max_broadcasts_per_month: plan.max_broadcasts_per_month,
      max_chatbot_flows: plan.max_chatbot_flows,
      ai_enabled: plan.ai_enabled,
      price_monthly: activePrice
        ? Number(activePrice.amount_minor) / 100
        : plan.price_monthly,
      currency: activePrice?.currency || "COP",
      provider: activePrice?.provider || "epayco",
      max_brands: limitFor("brands.total", 1),
      max_channels: limitFor("channels.active", 3),
      max_messages_per_month: limitFor(
        "messages.outbound_month",
        1000
      ),
      status: plan.status || "draft",
      is_public: plan.is_public || false,
    });
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyPlan);
  }

  function cancel() {
    setEditing(null);
    setCreating(false);
    setForm(emptyPlan);
  }

  async function savePlan() {
    setSaving(true);
    const endpoint = creating ? "/api/admin/plans" : `/api/admin/plans/${editing}`;
    const response = await fetch(endpoint, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      alert(payload?.error || "No se pudo guardar el plan");
      setSaving(false);
      return;
    }
    setSaving(false);
    cancel();
    loadPlans();
  }

  async function deletePlan(id: string) {
    if (!confirm("Archivar este plan? Las suscripciones existentes conservaran su historial.")) return;
    await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived", is_public: false }),
    });
    loadPlans();
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando planes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Planes</h1>
          <p className="text-sm text-[#8b949e] mt-1">Gestiona los planes de suscripcion de la plataforma</p>
        </div>
        <Button
          onClick={startCreate}
          className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 px-3"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nuevo Plan
        </Button>
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{creating ? "Crear Plan" : "Editar Plan"}</h2>
            <button onClick={cancel} className="text-[#8b949e] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Precio mensual</label>
              <input
                type="number"
                value={form.price_monthly}
                onChange={(e) => setForm((f) => ({ ...f, price_monthly: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Moneda</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Pasarela del precio</label>
              <select
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              >
                <option value="epayco">ePayco</option>
                <option value="wompi">Wompi</option>
                <option value="payu">PayU</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Agentes (-1 = ilimitado)</label>
              <input
                type="number"
                value={form.max_agents}
                onChange={(e) => setForm((f) => ({ ...f, max_agents: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Contactos (-1 = ilimitado)</label>
              <input
                type="number"
                value={form.max_contacts}
                onChange={(e) => setForm((f) => ({ ...f, max_contacts: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Broadcasts/mes</label>
              <input
                type="number"
                value={form.max_broadcasts_per_month}
                onChange={(e) => setForm((f) => ({ ...f, max_broadcasts_per_month: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Flujos Chatbot</label>
              <input
                type="number"
                value={form.max_chatbot_flows}
                onChange={(e) => setForm((f) => ({ ...f, max_chatbot_flows: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Marcas (-1 = ilimitado)</label>
              <input
                type="number"
                value={form.max_brands}
                onChange={(e) => setForm((f) => ({ ...f, max_brands: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Max Canales (-1 = ilimitado)</label>
              <input
                type="number"
                value={form.max_channels}
                onChange={(e) => setForm((f) => ({ ...f, max_channels: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Mensajes salientes/mes</label>
              <input
                type="number"
                value={form.max_messages_per_month}
                onChange={(e) => setForm((f) => ({ ...f, max_messages_per_month: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#2d333b] rounded-md text-sm text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ai_enabled}
                  onChange={(e) => setForm((f) => ({ ...f, ai_enabled: e.target.checked }))}
                  className="rounded border-[#2d333b] bg-[#161b22]"
                />
                <span className="text-sm text-white">IA habilitada</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.status === "active"}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "active" : "draft" }))}
                  className="rounded border-[#2d333b] bg-[#161b22]"
                />
                <span className="text-sm text-white">Plan activo</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
                  className="rounded border-[#2d333b] bg-[#161b22]"
                />
                <span className="text-sm text-white">Visible para clientes</span>
              </label>
            </div>
            <div className="flex items-end">
              <Button
                onClick={savePlan}
                disabled={saving || !form.name}
                className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 px-4"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {creating ? "Crear" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Plans list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white capitalize">{plan.name}</h3>
                <span className="text-[10px] uppercase tracking-wide text-[#8b949e]">
                  {plan.status || "legacy"}{plan.is_public ? " · publico" : ""}
                </span>
              </div>
              <button
                onClick={() => startEdit(plan)}
                className="p-1 rounded hover:bg-[#1e2433] text-[#8b949e] hover:text-white transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-2xl font-bold text-white mb-4">
              {plan.price_monthly === 0 ? (
                "Gratis"
              ) : (
                <>
                  ${plan.price_monthly.toLocaleString("es-CO")}
                  <span className="text-sm font-normal text-[#8b949e]">/mes</span>
                </>
              )}
            </p>
            <div className="space-y-1.5 text-xs text-[#8b949e] flex-1 mb-4">
              <div>{plan.max_agents === -1 ? "Agentes ilimitados" : `${plan.max_agents} agentes`}</div>
              <div>{plan.max_contacts === -1 ? "Contactos ilimitados" : `${plan.max_contacts.toLocaleString()} contactos`}</div>
              <div>{plan.max_broadcasts_per_month === -1 ? "Broadcasts ilimitados" : `${plan.max_broadcasts_per_month} broadcasts/mes`}</div>
              <div>{plan.max_chatbot_flows === -1 ? "Flujos ilimitados" : `${plan.max_chatbot_flows} flujos`}</div>
              {plan.ai_enabled && <div className="text-blue-400">IA habilitada</div>}
              {plan.entitlements?.filter((item) =>
                ["brands.total", "channels.active", "messages.outbound_month"].includes(item.feature_code)
              ).map((item) => (
                <div key={item.feature_code}>
                  {item.feature_code}: {item.limit_value ?? "ilimitado"}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
