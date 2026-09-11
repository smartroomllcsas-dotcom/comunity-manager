"use client";
/**
 * Comentarios de publicaciones y pautas, por empresa: responder en público,
 * escribirle al interno al lead y seguir la conversación en el Inbox.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  RefreshCw,
  EyeOff,
  ExternalLink,
  Megaphone,
  Settings2,
  Check,
  Lock,
} from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { BrandPicker } from "@/components/broadcasts/BrandPicker";
import { formatBogotaDateTime } from "@/lib/inbox/time";
import { FacebookGlyph, InstagramGlyph } from "@/components/inbox/ChannelBadge";

export const dynamic = "force-dynamic";

type Rules = {
  enabled: boolean;
  auto_public_reply: boolean;
  public_reply_mode: "ai" | "texts";
  ai_reply_instructions: string;
  max_public_replies_per_hour: number;
  public_reply_texts: string[];
  auto_dm: boolean;
  dm_text: string;
  only_first_per_author: boolean;
  ignore_keywords: string[];
  only_keywords: string[];
};

type Comment = {
  id: string;
  platform: "facebook" | "instagram";
  comment_id: string;
  post_permalink: string | null;
  is_ad: boolean;
  author_name: string | null;
  message: string;
  commented_at: string | null;
  status: string;
  public_reply_text: string | null;
  public_replied_at: string | null;
  dm_text: string | null;
  dm_sent_at: string | null;
  conversation_id: string | null;
  contact_id: string | null;
  handled_by: string | null;
  last_error: string | null;
  dm_allowed: boolean;
  dm_blocked_reason: string | null;
};

type ChannelInfo = { id: string; type: string; name: string; connected: boolean };

const STATUS: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Sin responder", cls: "bg-amber-500/20 text-amber-300" },
  respondido: { label: "Respondido", cls: "bg-green-500/20 text-green-300" },
  ignorado: { label: "Ignorado", cls: "bg-zinc-500/20 text-zinc-400" },
  fallido: { label: "Falló", cls: "bg-red-500/20 text-red-300" },
};

const FILTERS = [
  { id: "nuevo", label: "Sin responder" },
  { id: "respondido", label: "Respondidos" },
  { id: "ignorado", label: "Ignorados" },
  { id: "all", label: "Todos" },
];

const input = "w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white";
const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-[#2d333b] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#21262d] disabled:opacity-50";

export default function CommentsPage() {
  const { activeClientId, activeClient } = useActiveBrand();
  const [comments, setComments] = useState<Comment[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [filter, setFilter] = useState("nuevo");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { reply: string; dm: string }>>({});

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/social/comments?clientId=${activeClientId}&status=${filter}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los comentarios");
      setComments(data.comments || []);
      setRules(data.rules);
      setChannels(data.channels || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeClientId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRules(patch: Partial<Rules>) {
    if (!activeClientId || !rules) return;
    setSaving(true);
    try {
      const res = await fetch("/api/social/comments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, rules: { ...rules, ...patch } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setRules(data.rules);
      toast.success("Configuración guardada");
      for (const n of (data.notices || []) as string[]) toast.warning(n);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function act(row: Comment, action: "reply" | "dm" | "both" | "ignore") {
    if (!activeClientId) return;
    setBusy(row.id);
    try {
      const d = drafts[row.id] || { reply: "", dm: "" };
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: activeClientId,
          id: row.id,
          action,
          text: d.reply || undefined,
          dmText: d.dm || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar");
      toast.success(action === "ignore" ? "Comentario ignorado" : data.detail || "Listo");
      if (data.warning) toast.warning(data.warning);
      setDrafts((p) => ({ ...p, [row.id]: { reply: "", dm: "" } }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!activeClientId) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-[#8b949e]">Elige la empresa para ver sus comentarios.</p>
        <BrandPicker />
      </div>
    );
  }

  const pending = comments.filter((c) => c.status === "nuevo").length;

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-300" /> Comentarios
          </h1>
          <p className="text-xs text-[#8b949e]">
            Comentarios en publicaciones y pautas de <span className="text-white">{activeClient?.name}</span>. Respóndelos y
            escríbeles al interno para convertirlos en leads.
          </p>
        </div>
        <BrandPicker />
        <button onClick={() => void load()} className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] hover:text-white" title="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={() => setShowSettings((v) => !v)} className={btn}>
          <Settings2 className="h-3.5 w-3.5" /> Configurar
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Estado del módulo */}
        {rules && (
          <div className={`rounded-xl border p-4 ${rules.enabled ? "border-green-500/30 bg-green-500/5" : "border-[#2d333b] bg-[#161b22]"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={rules.enabled} onChange={(e) => void saveRules({ enabled: e.target.checked })} disabled={saving} />
                Atender comentarios automáticamente
              </label>
              <span className="text-xs text-[#8b949e]">
                {rules.enabled
                  ? `${rules.auto_public_reply ? (rules.public_reply_mode === "ai" ? "Responde en público (la IA redacta)" : "Responde en público (textos fijos)") : "No responde en público"} · ${rules.auto_dm ? "escribe al interno" : "no escribe al interno"}`
                  : "Apagado: los comentarios se guardan y los respondes tú desde aquí."}
              </span>
              <div className="ml-auto flex items-center gap-2 text-xs text-[#8b949e]">
                {channels.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-[#2d333b] px-2 py-0.5">
                    {c.type === "instagram" ? <InstagramGlyph className="h-3 w-3" /> : <FacebookGlyph className="h-3 w-3" />}
                    {c.connected ? <Check className="h-3 w-3 text-green-400" /> : <span className="text-red-300">sin conectar</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Configuración */}
        {showSettings && rules && (
          <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4 space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={rules.auto_public_reply} onChange={(e) => setRules({ ...rules, auto_public_reply: e.target.checked })} />
                Responder el comentario en público
              </label>
              <div className="my-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRules({ ...rules, public_reply_mode: "ai" })}
                  className={`rounded-full border px-3 py-1 text-xs ${rules.public_reply_mode === "ai" ? "border-blue-500/50 bg-blue-500/20 text-blue-200" : "border-[#2d333b] text-[#8b949e]"}`}
                >
                  La IA la escribe leyendo el comentario
                </button>
                <button
                  type="button"
                  onClick={() => setRules({ ...rules, public_reply_mode: "texts" })}
                  className={`rounded-full border px-3 py-1 text-xs ${rules.public_reply_mode === "texts" ? "border-blue-500/50 bg-blue-500/20 text-blue-200" : "border-[#2d333b] text-[#8b949e]"}`}
                >
                  Textos fijos que rotan
                </button>
              </div>
              {rules.public_reply_mode === "ai" ? (
                <div className="mb-3">
                  <p className="text-[11px] text-[#6e7681] mb-1">
                    Cada respuesta habla de lo que la persona preguntó y sale distinta, que es lo que evita que Meta la marque como spam.
                    Nunca incluye precios ni enlaces. Si la IA falla, se usa uno de los textos de abajo.
                  </p>
                  <textarea
                    rows={2}
                    className={input}
                    placeholder="Indicaciones para la IA (tono, qué no decir)"
                    value={rules.ai_reply_instructions}
                    onChange={(e) => setRules({ ...rules, ai_reply_instructions: e.target.value })}
                  />
                </div>
              ) : null}
              <p className="text-[11px] text-[#6e7681] mb-2">
                {rules.public_reply_mode === "ai" ? "Textos de respaldo" : "Se elige uno de estos textos"}, sin repetir el anterior. Usa {"{{nombre}}"} y {"{{empresa}}"}.
              </p>
              {rules.public_reply_texts.map((t, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input
                    className={input}
                    value={t}
                    onChange={(e) => setRules({ ...rules, public_reply_texts: rules.public_reply_texts.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  {rules.public_reply_texts.length > 1 && (
                    <button className={`${btn} text-[#f85149]`} onClick={() => setRules({ ...rules, public_reply_texts: rules.public_reply_texts.filter((_, j) => j !== i) })}>
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {rules.public_reply_texts.length < 10 && (
                <button className="text-xs text-[#58a6ff] hover:underline" onClick={() => setRules({ ...rules, public_reply_texts: [...rules.public_reply_texts, ""] })}>
                  + Agregar variante
                </button>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={rules.auto_dm} onChange={(e) => setRules({ ...rules, auto_dm: e.target.checked })} />
                Escribirle al interno a quien comenta
              </label>
              <p className="text-[11px] text-[#6e7681] mb-2">
                Meta permite un solo mensaje al interno por comentario y dentro de los 7 días. Si responde, el chat queda en la Bandeja y lo sigue el agente.
              </p>
              <textarea rows={3} className={input} value={rules.dm_text} onChange={(e) => setRules({ ...rules, dm_text: e.target.value })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Sólo si el comentario contiene (separadas por coma)</label>
                <input
                  className={input}
                  placeholder="precio, info, cómo compro"
                  value={rules.only_keywords.join(", ")}
                  onChange={(e) => setRules({ ...rules, only_keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Ignorar si contiene</label>
                <input
                  className={input}
                  placeholder="estafa, spam"
                  value={rules.ignore_keywords.join(", ")}
                  onChange={(e) => setRules({ ...rules, ignore_keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#8b949e]">
              <input type="checkbox" checked={rules.only_first_per_author} onChange={(e) => setRules({ ...rules, only_first_per_author: e.target.checked })} />
              Sólo el primer comentario de cada persona (no responder cada comentario suyo)
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#8b949e]">
              <span>Máximo</span>
              <input
                type="number"
                min={1}
                max={120}
                className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                value={rules.max_public_replies_per_hour}
                onChange={(e) => setRules({ ...rules, max_public_replies_per_hour: Math.max(1, Number(e.target.value) || 1) })}
              />
              <span>respuestas públicas por hora. Pasado el tope se guardan para responderlas a mano, para que Meta no lo lea como spam.</span>
            </div>

            <div className="flex justify-end">
              <button disabled={saving} onClick={() => void saveRules({})} className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs ${filter === f.id ? "bg-blue-500/20 text-blue-300" : "text-[#8b949e] hover:text-white"}`}
            >
              {f.label}
              {f.id === "nuevo" && pending > 0 ? ` (${pending})` : ""}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading && comments.length === 0 ? (
          <p className="text-sm text-[#8b949e]">Cargando…</p>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2d333b] p-12 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-[#2d333b]" />
            <p className="mt-3 text-sm font-medium text-white">Sin comentarios por aquí</p>
            <p className="text-xs text-[#8b949e]">
              Aparecen solos cuando alguien comenta una publicación o una pauta de esta empresa. Actívalo arriba para que Meta nos avise.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => {
              const st = STATUS[c.status] || STATUS.nuevo;
              const d = drafts[c.id] || { reply: "", dm: "" };
              return (
                <div key={c.id} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {c.platform === "instagram" ? <InstagramGlyph className="h-4 w-4 text-pink-300" /> : <FacebookGlyph className="h-4 w-4 text-blue-400" />}
                    <span className="text-sm font-medium text-white">{c.author_name || "Sin nombre"}</span>
                    {c.is_ad && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                        <Megaphone className="h-3 w-3" /> Pauta
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                    {c.handled_by === "auto" && <span className="text-[10px] text-[#6e7681]">automático</span>}
                    <span className="ml-auto text-[11px] text-[#8b949e]">{c.commented_at ? formatBogotaDateTime(c.commented_at) : ""}</span>
                  </div>

                  <p className="text-sm text-white whitespace-pre-wrap">{c.message || "(sin texto)"}</p>

                  {(c.public_reply_text || c.dm_text) && (
                    <div className="mt-2 space-y-1 rounded-md border border-[#2d333b] bg-[#0d1117] p-2 text-xs">
                      {c.public_reply_text && (
                        <p className="text-[#8b949e]">
                          <span className="text-green-300">Respuesta pública:</span> {c.public_reply_text}
                        </p>
                      )}
                      {c.dm_text && (
                        <p className="text-[#8b949e]">
                          <span className="text-blue-300">Al interno:</span> {c.dm_text}
                        </p>
                      )}
                    </div>
                  )}
                  {c.last_error && <p className="mt-1 text-[11px] text-red-300">{c.last_error}</p>}

                  {c.status === "nuevo" ? (
                    <div className="mt-3 space-y-2">
                      <input
                        className={input}
                        placeholder={rules?.public_reply_mode === "ai" ? "Respuesta pública (vacío = la escribe la IA leyendo el comentario)" : "Respuesta pública (vacío = el texto configurado)"}
                        value={d.reply}
                        onChange={(e) => setDrafts((p) => ({ ...p, [c.id]: { ...d, reply: e.target.value } }))}
                      />
                      {c.dm_allowed ? (
                        <input
                          className={input}
                          placeholder="Mensaje al interno (vacío = el texto configurado)"
                          value={d.dm}
                          onChange={(e) => setDrafts((p) => ({ ...p, [c.id]: { ...d, dm: e.target.value } }))}
                        />
                      ) : (
                        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {c.dm_blocked_reason} Escríbele respondiendo su comentario o espera a que te escriba.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busy === c.id || !c.dm_allowed}
                          title={c.dm_allowed ? undefined : c.dm_blocked_reason || ""}
                          onClick={() => act(c, "both")}
                          className={`${btn} border-blue-500/40 bg-blue-600/20 text-blue-100`}
                        >
                          <Send className="h-3.5 w-3.5" /> Responder y escribir al interno
                        </button>
                        <button disabled={busy === c.id} onClick={() => act(c, "reply")} className={btn}>
                          Sólo responder
                        </button>
                        <button
                          disabled={busy === c.id || !c.dm_allowed}
                          title={c.dm_allowed ? undefined : c.dm_blocked_reason || ""}
                          onClick={() => act(c, "dm")}
                          className={btn}
                        >
                          Sólo al interno
                        </button>
                        <button disabled={busy === c.id} onClick={() => act(c, "ignore")} className={`${btn} text-[#8b949e]`}>
                          <EyeOff className="h-3.5 w-3.5" /> Ignorar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                      {/*
                        Un comentario atendido a medias seguía sin botones: si la
                        respuesta pública salía y el mensaje al interno fallaba, la
                        ficha quedaba como "Respondido", mostraba el error en rojo y
                        no daba forma de reintentar. Aquí está lo que falta.
                      */}
                      {c.status !== "ignorado" && !c.public_replied_at && (
                        <button
                          disabled={busy === c.id}
                          onClick={() => act(c, "reply")}
                          className={`${btn} border-green-500/40 bg-green-600/15 text-green-100`}
                        >
                          Reintentar la respuesta pública
                        </button>
                      )}
                      {c.status !== "ignorado" && !c.dm_sent_at && (
                        <button
                          disabled={busy === c.id || !c.dm_allowed}
                          title={c.dm_allowed ? undefined : c.dm_blocked_reason || ""}
                          onClick={() => act(c, "dm")}
                          className={`${btn} border-blue-500/40 bg-blue-600/20 text-blue-100`}
                        >
                          <Send className="h-3.5 w-3.5" /> Reintentar el mensaje al interno
                        </button>
                      )}
                      {c.conversation_id && (
                        <Link href="/inbox" className="text-blue-300 hover:underline">
                          Ver chat en la Bandeja
                        </Link>
                      )}
                      {c.contact_id && (
                        <Link href={`/contacts/${c.contact_id}`} className="text-blue-300 hover:underline">
                          Ver contacto
                        </Link>
                      )}
                      {c.post_permalink && (
                        <a href={c.post_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#8b949e] hover:text-white">
                          <ExternalLink className="h-3 w-3" /> Ver publicación
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
