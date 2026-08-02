"use client";

// Sprint 26 · Agente P — ReportBuilder UI.
//
// Un solo componente con:
//   - Selector de cliente
//   - Selector de rango (semana anterior | mes anterior | trimestre | custom)
//   - Preview de branding (colores + logo URL)
//   - Toggle "Incluir insights IA"
//   - Toggle "Enviar por email" + input destinatario
//   - Botón "Generar" (POST /api/reports)
//   - Historial de últimos reports abajo (GET /api/reports)
//
// Estados: "idle" | "loading" | "success" | "error".

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Palette, Sparkles, Mail, Download, Trash2, RefreshCw } from "lucide-react";

interface Client { id: string; name: string }

interface ReportRow {
  id: string;
  client_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
  public_url: string | null;
  size_bytes: number | null;
  sent_to_email: string | null;
  sent_at: string | null;
  created_at: string;
}

type PeriodPreset = "last_week" | "last_month" | "last_quarter" | "custom";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(preset: PeriodPreset): { start: string; end: string; type: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preset === "last_week") {
    const end = new Date(today); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
    return { start: isoDate(start), end: isoDate(end), type: "weekly" };
  }
  if (preset === "last_month") {
    const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const end = new Date(firstOfMonth); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return { start: isoDate(start), end: isoDate(end), type: "monthly" };
  }
  if (preset === "last_quarter") {
    const end = new Date(today); end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 89);
    return { start: isoDate(start), end: isoDate(end), type: "quarterly" };
  }
  const end = new Date(today); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  return { start: isoDate(start), end: isoDate(end), type: "custom" };
}

export default function ReportBuilder() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [preset, setPreset] = useState<PeriodPreset>("last_month");
  const [customStart, setCustomStart] = useState<string>(computeRange("last_month").start);
  const [customEnd, setCustomEnd] = useState<string>(computeRange("last_month").end);

  const [agencyName, setAgencyName] = useState<string>("Community Manager Platform");
  const [agencyFooter, setAgencyFooter] = useState<string>("Reporte automático · Confidencial");
  const [primaryColor, setPrimaryColor] = useState<string>("#1f2937");
  const [secondaryColor, setSecondaryColor] = useState<string>("#3b82f6");
  const [logoUrl, setLogoUrl] = useState<string>("");

  const [includeInsights, setIncludeInsights] = useState<boolean>(true);
  const [sendEmail, setSendEmail] = useState<boolean>(false);
  const [emailTo, setEmailTo] = useState<string>("");

  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null);
  const [lastReportId, setLastReportId] = useState<string | null>(null);

  const [history, setHistory] = useState<ReportRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // -------- Cargar clientes --------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/cm/clients", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j?.clients)) setClients(j.clients);
        else if (Array.isArray(j)) setClients(j);
      } catch { /* noop */ }
    })();
  }, []);

  // -------- Cargar historial --------
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const url = clientId
        ? `/api/reports?client_id=${encodeURIComponent(clientId)}&limit=20`
        : `/api/reports?limit=20`;
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setHistory(Array.isArray(j?.reports) ? j.reports : []);
      }
    } catch { /* noop */ }
    setLoadingHistory(false);
  }, [clientId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // -------- Update customStart/End cuando cambia preset --------
  useEffect(() => {
    if (preset !== "custom") {
      const { start, end } = computeRange(preset);
      setCustomStart(start);
      setCustomEnd(end);
    }
  }, [preset]);

  const range = useMemo(() => {
    if (preset === "custom") return { start: customStart, end: customEnd, type: "custom" };
    return computeRange(preset);
  }, [preset, customStart, customEnd]);

  // -------- Generate --------
  const handleGenerate = useCallback(async () => {
    if (!clientId) { setState("error"); setMessage("Selecciona un cliente."); return; }
    if (sendEmail && !emailTo.includes("@")) { setState("error"); setMessage("Email destinatario inválido."); return; }

    setState("loading");
    setMessage("Generando PDF...");
    setLastPdfUrl(null);
    setLastReportId(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          period_type: range.type,
          period_start: range.start,
          period_end: range.end,
          branding: {
            logo_url: logoUrl || undefined,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            agency_name: agencyName,
            agency_footer: agencyFooter,
          },
          include_insights: includeInsights,
          send_to_email: sendEmail ? emailTo : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setState("success");
      setMessage(
        `PDF generado (${((j.size_bytes ?? 0) / 1024).toFixed(0)} KB)` +
        (j.insights_included ? ` · ${j.insights_included} insights IA` : "") +
        (j.status === "sent" ? ` · enviado a ${emailTo}` : ""),
      );
      setLastPdfUrl(j.public_url || `/api/reports/${j.id}`);
      setLastReportId(j.id);
      loadHistory();
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [clientId, range, logoUrl, primaryColor, secondaryColor, agencyName, agencyFooter, includeInsights, sendEmail, emailTo, loadHistory]);

  // -------- Resend --------
  const handleResend = useCallback(async () => {
    if (!lastReportId || !emailTo.includes("@")) return;
    setState("loading");
    setMessage("Re-generando y enviando...");
    // Simple: llamamos POST de nuevo con send_to_email. Genera un nuevo PDF/row.
    await handleGenerate();
  }, [lastReportId, emailTo, handleGenerate]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar este reporte?")) return;
    const r = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (r.ok) loadHistory();
  }, [loadHistory]);

  // -------- Render --------
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 text-[#e6edf3]">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-blue-400" />
        <h1 className="text-2xl font-semibold">Generar reporte PDF</h1>
      </div>

      {/* ----- Config ----- */}
      <section className="grid gap-6 md:grid-cols-2 p-5 rounded-xl bg-[#1a1f2e] border border-[#2d333b]">
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#8b949e] mb-2">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2 text-sm"
            >
              <option value="">— seleccionar —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[#8b949e] mb-2">Período</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { k: "last_week", l: "Semana anterior" },
                { k: "last_month", l: "Mes anterior" },
                { k: "last_quarter", l: "Trimestre" },
                { k: "custom", l: "Personalizado" },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPreset(k as PeriodPreset)}
                  className={`px-3 py-1.5 rounded-md text-xs border ${
                    preset === k
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-[#0d1117] border-[#2d333b] text-[#8b949e] hover:bg-[#242a37]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customStart}
                disabled={preset !== "custom"}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-[#0d1117] border border-[#2d333b] rounded-md px-2 py-1.5 text-xs disabled:opacity-50"
              />
              <input
                type="date"
                value={customEnd}
                disabled={preset !== "custom"}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-[#0d1117] border border-[#2d333b] rounded-md px-2 py-1.5 text-xs disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="insights"
              type="checkbox"
              checked={includeInsights}
              onChange={(e) => setIncludeInsights(e.target.checked)}
              className="accent-blue-500"
            />
            <label htmlFor="insights" className="text-sm flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-yellow-400" />
              Incluir insights IA (Claude · ~$0.01 por reporte)
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="email"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="accent-blue-500"
              />
              <label htmlFor="email" className="text-sm flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-green-400" />
                Enviar por email
              </label>
            </div>
            {sendEmail && (
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="destinatario@empresa.com"
                className="w-full bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-1.5 text-sm"
              />
            )}
          </div>
        </div>

        {/* ----- Branding ----- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[#8b949e]">
            <Palette className="h-4 w-4" /> Branding
          </div>

          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Nombre de la agencia</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Footer</label>
            <input
              value={agencyFooter}
              onChange={(e) => setAgencyFooter(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Logo (URL pública)</label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://.../logo.png"
              className="w-full bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Color primario</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-14 bg-transparent border border-[#2d333b] rounded"
                />
                <input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 bg-[#0d1117] border border-[#2d333b] rounded-md px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Color secundario</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-14 bg-transparent border border-[#2d333b] rounded"
                />
                <input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 bg-[#0d1117] border border-[#2d333b] rounded-md px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div
            className="mt-2 h-10 rounded-md flex items-center px-3 text-xs"
            style={{ background: primaryColor, borderLeft: `4px solid ${secondaryColor}`, color: "#fff" }}
          >
            Preview branding — {agencyName}
          </div>
        </div>
      </section>

      {/* ----- CTA ----- */}
      <section className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={state === "loading" || !clientId}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          {state === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {state === "loading" ? "Generando..." : "Generar reporte"}
        </button>
        {lastPdfUrl && (
          <a
            href={lastPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1a1f2e] border border-[#2d333b] hover:bg-[#242a37] text-sm"
          >
            <Download className="h-4 w-4" /> Descargar PDF
          </a>
        )}
        {lastReportId && sendEmail && emailTo && (
          <button
            type="button"
            onClick={handleResend}
            disabled={state === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1a1f2e] border border-[#2d333b] hover:bg-[#242a37] text-sm"
          >
            <Mail className="h-4 w-4" /> Enviar de nuevo
          </button>
        )}
      </section>

      {message && (
        <div
          className={`text-sm px-4 py-2.5 rounded-md border ${
            state === "success"
              ? "bg-green-900/20 border-green-700 text-green-200"
              : state === "error"
                ? "bg-red-900/20 border-red-700 text-red-200"
                : "bg-blue-900/20 border-blue-700 text-blue-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* ----- History ----- */}
      <section className="p-5 rounded-xl bg-[#1a1f2e] border border-[#2d333b]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Reportes generados</h2>
          <button
            type="button"
            onClick={loadHistory}
            className="text-xs text-[#8b949e] hover:text-white flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loadingHistory ? "animate-spin" : ""}`} /> Recargar
          </button>
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-[#8b949e] py-6 text-center">Sin reportes previos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[#8b949e] uppercase">
                <tr className="border-b border-[#2d333b]">
                  <th className="text-left py-2 px-3">Creado</th>
                  <th className="text-left py-2 px-3">Período</th>
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-right py-2 px-3">Tamaño</th>
                  <th className="text-left py-2 px-3">Email</th>
                  <th className="text-right py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-[#2d333b]/50">
                    <td className="py-2 px-3 text-xs text-[#8b949e]">
                      {new Date(r.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 px-3 text-xs">{r.period_start} → {r.period_end}</td>
                    <td className="py-2 px-3 text-xs">{r.period_type}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          r.status === "sent"
                            ? "bg-green-900/40 text-green-300"
                            : r.status === "generated"
                              ? "bg-blue-900/40 text-blue-300"
                              : r.status === "failed"
                                ? "bg-red-900/40 text-red-300"
                                : "bg-[#0d1117] text-[#8b949e]"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-right">
                      {r.size_bytes ? `${(r.size_bytes / 1024).toFixed(0)} KB` : "—"}
                    </td>
                    <td className="py-2 px-3 text-xs text-[#8b949e]">{r.sent_to_email ?? "—"}</td>
                    <td className="py-2 px-3 text-right">
                      <a
                        href={r.public_url || `/api/reports/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mr-3"
                      >
                        <Download className="h-3 w-3" /> ver
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline"
                      >
                        <Trash2 className="h-3 w-3" /> borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
