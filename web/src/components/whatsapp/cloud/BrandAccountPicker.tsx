"use client";
import { useEffect, useState } from "react";

interface Client { id: string; name?: string | null; nombre?: string | null }
interface Account { id: string; waba_id: string; phone_number_id: string; display_phone_number: string | null; verified_name: string | null }

/**
 * Selector combinado marca + WABA. Emite (clientId, accountId).
 * Lee `/api/cm/clients` para las marcas y `/api/whatsapp/cloud/business-accounts?clientId=X` para cuentas.
 */
export function BrandAccountPicker({
  clientId,
  accountId,
  onChange,
}: {
  clientId: string | null;
  accountId: string | null;
  onChange: (clientId: string | null, accountId: string | null) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetch("/api/cm/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? d ?? []))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (!clientId) {
      setAccounts([]);
      return;
    }
    fetch(`/api/whatsapp/cloud/business-accounts?clientId=${clientId}`)
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => setAccounts([]));
  }, [clientId]);

  return (
    <div className="flex gap-2 items-end">
      <label className="block">
        <span className="block text-xs text-[#8b949e] mb-1">Empresa / Marca</span>
        <select
          className="input min-w-[220px]"
          value={clientId ?? ""}
          onChange={(e) => onChange(e.target.value || null, null)}
        >
          <option value="">— seleccionar —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.nombre ?? c.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs text-[#8b949e] mb-1">Cuenta WhatsApp</span>
        <select
          className="input min-w-[220px]"
          value={accountId ?? ""}
          onChange={(e) => onChange(clientId, e.target.value || null)}
          disabled={!clientId}
        >
          <option value="">
            {accounts.length === 0 ? (clientId ? "— sin cuentas —" : "— elige marca —") : "— todas —"}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_phone_number ?? a.phone_number_id} {a.verified_name ? `— ${a.verified_name}` : ""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
