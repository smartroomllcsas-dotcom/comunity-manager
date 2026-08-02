"use client";

/**
 * Sprint 26 · InboxView — cliente cross-source (cm_mentions + smarttalk).
 *
 * Layout 4-columnas:
 *   [Sidebar filtros/counters 240px] [Conversation list 360px]
 *   [Thread + reply composer flex-1] [Contact context 300px]
 *
 * Keyboard nav:
 *   ↑ / ↓  → navegar conversaciones
 *   r      → focus reply composer
 *   a      → archive conversación seleccionada
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIReplyDrafts, type DraftPayload } from "./AIReplyDrafts";

interface ClientLite {
  id: string;
  name: string;
  language: string | null;
}

interface Conversation {
  id: string;
  client_id: string;
  platform: string;
  source_type: string;
  author: { handle: string; followers: number | null; avatar_url: string | null };
  last_message: { content: string; at: string; sentiment: string | null };
  unread_count: number;
  urgency_max: number;
  assigned_to: string | null;
  status: "unread" | "read" | "archived";
  source: "cm_mentions" | "smarttalk";
  mention_ids: string[];
}

interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  at: string;
  sentiment_label?: string | null;
  urgency_score?: number | null;
  source_type?: string;
  source_url?: string | null;
  media_url?: string | null;
}

interface ThreadPayload {
  conversation: {
    id: string;
    source: "cm_mentions" | "smarttalk";
    client_id: string;
    platform: string;
    author: { handle: string | null; followers: number | null; avatar_url: string | null };
    assigned_to?: string | null;
    status?: string;
  };
  messages: ThreadMessage[];
}

const PLATFORMS = [
  "instagram",
  "facebook",
  "whatsapp",
  "twitter",
  "linkedin",
  "tiktok",
] as const;

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "#E4405F",
  facebook: "#1877F2",
  whatsapp: "#25D366",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  tiktok: "#000000",
};

function sentimentDot(s: string | null | undefined) {
  if (s === "positive") return "#22c55e";
  if (s === "negative") return "#ef4444";
  return "#94a3b8";
}

function formatAt(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = (now.getTime() - d.getTime()) / 60000;
    if (diffMin < 1) return "ahora";
    if (diffMin < 60) return `${Math.floor(diffMin)}m`;
    if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function InboxView({ initialClients }: { initialClients: ClientLite[] }) {
  const [selectedClient, setSelectedClient] = useState<string | null>(
    initialClients[0]?.id ?? null,
  );
  const [platform, setPlatform] = useState<string>("");
  const [status, setStatus] = useState<"unread" | "read" | "archived" | "">("unread");
  const [sentiment, setSentiment] = useState<string>("");
  const [urgencyMin, setUrgencyMin] = useState<number>(0);
  const [search, setSearch] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [countsByStatus, setCountsByStatus] = useState<Record<string, number>>({
    unread: 0,
    read: 0,
    archived: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [aiDrafts, setAiDrafts] = useState<DraftPayload | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // --- Fetch lista ---
  const fetchConversations = useCallback(async () => {
    if (!selectedClient) return;
    setLoadingList(true);
    const sp = new URLSearchParams({ client_id: selectedClient, limit: "50" });
    if (platform) sp.set("platform", platform);
    if (status) sp.set("status", status);
    if (sentiment) sp.set("sentiment", sentiment);
    if (search.trim()) sp.set("search", search.trim());
    try {
      const res = await fetch(`/api/inbox?${sp.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        conversations: Conversation[];
        counts_by_status: Record<string, number>;
      };
      const filtered = urgencyMin
        ? data.conversations.filter((c) => c.urgency_max >= urgencyMin)
        : data.conversations;
      setConversations(filtered);
      setCountsByStatus(data.counts_by_status);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, [selectedClient, platform, status, sentiment, urgencyMin, search]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // --- Fetch thread ---
  const fetchThread = useCallback(
    async (id: string) => {
      if (!selectedClient) return;
      setLoadingThread(true);
      setThread(null);
      try {
        const res = await fetch(
          `/api/inbox/${encodeURIComponent(id)}?client_id=${selectedClient}`,
          { credentials: "same-origin" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ThreadPayload;
        setThread(data);
      } catch {
        setThread(null);
      } finally {
        setLoadingThread(false);
      }
    },
    [selectedClient],
  );

  useEffect(() => {
    if (selectedId) void fetchThread(selectedId);
  }, [selectedId, fetchThread]);

  // --- Acciones optimistas ---
  const patchStatus = useCallback(
    async (id: string, next: "unread" | "read" | "archived") => {
      const prev = conversations;
      setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, status: next } : c)));
      try {
        await fetch(
          `/api/inbox/${encodeURIComponent(id)}?client_id=${selectedClient}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ status: next }),
          },
        );
      } catch {
        setConversations(prev); // rollback
      }
    },
    [conversations, selectedClient],
  );

  // --- Draft con IA ---
  const requestAIDraft = useCallback(async () => {
    if (!selectedId || !selectedClient) return;
    setAiLoading(true);
    setAiOpen(true);
    setAiDrafts(null);
    try {
      const res = await fetch(
        `/api/inbox/${encodeURIComponent(selectedId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            client_id: selectedClient,
            use_ai_draft: true,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) setAiDrafts(data as DraftPayload);
    } finally {
      setAiLoading(false);
    }
  }, [selectedId, selectedClient]);

  // --- Enviar reply ---
  const sendReply = useCallback(async () => {
    if (!selectedId || !selectedClient || !composerValue.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/inbox/${encodeURIComponent(selectedId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            client_id: selectedClient,
            content: composerValue.trim(),
          }),
        },
      );
      if (res.ok) {
        setComposerValue("");
        await fetchThread(selectedId);
        await fetchConversations();
      }
    } finally {
      setSending(false);
    }
  }, [selectedId, selectedClient, composerValue, fetchThread, fetchConversations]);

  // --- Keyboard nav ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // No interceptar cuando el usuario está tipeando en un input/textarea.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!conversations.length) return;
      const idx = conversations.findIndex((c) => c.id === selectedId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = conversations[Math.min(conversations.length - 1, idx + 1)];
        if (next) setSelectedId(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = conversations[Math.max(0, idx - 1)];
        if (prev) setSelectedId(prev.id);
      } else if (e.key === "r" && selectedId) {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === "a" && selectedId) {
        e.preventDefault();
        void patchStatus(selectedId, "archived");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conversations, selectedId, patchStatus]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  return (
    <div className="flex h-full w-full bg-[var(--surface-canvas,#0b1020)] text-sm">
      {/* -------- Sidebar filtros + counters (240px) -------- */}
      <aside className="w-[240px] shrink-0 border-r border-border/40 flex flex-col gap-3 p-3 overflow-y-auto">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Cliente
          </label>
          <select
            className="w-full bg-transparent border border-border/40 rounded px-2 py-1.5"
            value={selectedClient ?? ""}
            onChange={(e) => setSelectedClient(e.target.value || null)}
          >
            <option value="">— seleccionar —</option>
            {initialClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Canales
          </div>
          <div className="flex flex-col gap-1">
            <button
              className={`text-left px-2 py-1 rounded ${!platform ? "bg-white/5" : ""}`}
              onClick={() => setPlatform("")}
            >
              Todos
            </button>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                className={`text-left px-2 py-1 rounded flex items-center gap-2 ${
                  platform === p ? "bg-white/5" : ""
                }`}
                onClick={() => setPlatform(p)}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: PLATFORM_COLOR[p] }}
                />
                <span className="capitalize">{p}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Estado
          </div>
          <div className="flex flex-col gap-1">
            {(["unread", "read", "archived", ""] as const).map((s) => (
              <label key={s || "all"} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                <span>
                  {s || "Todos"}
                  {s && (
                    <span className="ml-1 text-muted-foreground">
                      ({countsByStatus[s] ?? 0})
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Sentiment
          </div>
          <div className="flex flex-col gap-1">
            {["", "positive", "neutral", "negative"].map((s) => (
              <label key={s || "all"} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sentiment"
                  checked={sentiment === s}
                  onChange={() => setSentiment(s)}
                />
                <span>{s || "Todos"}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Urgencia mínima: {urgencyMin}
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={urgencyMin}
            onChange={(e) => setUrgencyMin(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </aside>

      {/* -------- Lista de conversaciones (360px) -------- */}
      <section className="w-[360px] shrink-0 border-r border-border/40 flex flex-col">
        <div className="p-3 border-b border-border/40">
          <input
            className="w-full bg-transparent border border-border/40 rounded px-2 py-1.5"
            placeholder="Buscar por contenido o handle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded bg-white/5 animate-pulse"
                />
              ))}
            </div>
          )}
          {!loadingList && conversations.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">
              <div className="text-4xl mb-2">✨</div>
              <div>Bandeja al día</div>
              <div className="text-xs mt-1">
                No hay conversaciones que coincidan con estos filtros.
              </div>
            </div>
          )}
          {!loadingList &&
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/20 hover:bg-white/5 flex items-start gap-2 ${
                  selectedId === c.id ? "bg-white/10" : ""
                }`}
              >
                <div className="w-8 h-8 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold">
                  {c.author.handle.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-xs">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: PLATFORM_COLOR[c.platform] || "#888" }}
                    />
                    <span className="truncate font-medium">{c.author.handle}</span>
                    {c.urgency_max >= 4 && (
                      <span title="urgente" className="text-amber-400">
                        ⚡
                      </span>
                    )}
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full ml-auto"
                      style={{ background: sentimentDot(c.last_message.sentiment) }}
                    />
                    <span className="text-muted-foreground shrink-0">
                      {formatAt(c.last_message.at)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {c.last_message.content}
                  </div>
                  {c.unread_count > 0 && (
                    <div className="text-[10px] mt-0.5 inline-block bg-sky-500/20 text-sky-300 rounded px-1.5">
                      {c.unread_count} nuevo{c.unread_count > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </button>
            ))}
        </div>
      </section>

      {/* -------- Thread + composer (flex-1) -------- */}
      <section className="flex-1 flex flex-col min-w-0">
        {!selectedConversation && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-5xl mb-3">💬</div>
              <div>Selecciona una conversación para verla.</div>
              <div className="text-xs mt-2">
                Usa ↑/↓ para navegar, r para responder, a para archivar.
              </div>
            </div>
          </div>
        )}
        {selectedConversation && (
          <>
            <header className="border-b border-border/40 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                {selectedConversation.author.handle.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {selectedConversation.author.handle}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {selectedConversation.platform} · {selectedConversation.source_type}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-2 py-1 text-xs rounded border border-border/40 hover:bg-white/5"
                  onClick={() => patchStatus(selectedConversation.id, "read")}
                >
                  Marcar leído
                </button>
                <button
                  className="px-2 py-1 text-xs rounded border border-border/40 hover:bg-white/5"
                  onClick={() => patchStatus(selectedConversation.id, "archived")}
                >
                  Archivar
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread && (
                <div className="text-muted-foreground text-xs">Cargando thread…</div>
              )}
              {!loadingThread && thread?.messages.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  No hay mensajes en este thread.
                </div>
              )}
              {thread?.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    m.direction === "outbound"
                      ? "ml-auto bg-sky-500/20 border border-sky-500/40"
                      : "bg-white/5"
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex gap-2">
                    <span>{formatAt(m.at)}</span>
                    {m.sentiment_label && <span>{m.sentiment_label}</span>}
                    {m.source_url && (
                      <a
                        href={m.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        origen
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <button
                  className="px-2 py-1 rounded border border-border/40 hover:bg-white/5"
                  onClick={requestAIDraft}
                  disabled={aiLoading}
                >
                  {aiLoading ? "Generando…" : "✨ Draft con IA"}
                </button>
                <span className="text-muted-foreground">
                  atajos: ↑/↓ navegar · r componer · a archivar
                </span>
              </div>
              <textarea
                ref={composerRef}
                className="w-full min-h-[80px] bg-transparent border border-border/40 rounded p-2 text-sm"
                value={composerValue}
                onChange={(e) => setComposerValue(e.target.value)}
                placeholder="Escribe tu respuesta…"
              />
              <div className="flex justify-end">
                <button
                  className="px-3 py-1.5 rounded bg-sky-500 text-white text-xs disabled:opacity-40"
                  onClick={sendReply}
                  disabled={sending || !composerValue.trim()}
                >
                  {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* -------- Contexto de contacto (300px) -------- */}
      <aside className="w-[300px] shrink-0 border-l border-border/40 p-4 overflow-y-auto">
        {!selectedConversation && (
          <div className="text-muted-foreground text-xs">
            Selecciona una conversación para ver contexto del contacto.
          </div>
        )}
        {selectedConversation && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-lg font-semibold">
                {selectedConversation.author.handle.slice(0, 2).toUpperCase()}
              </div>
              <div className="font-medium">{selectedConversation.author.handle}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {selectedConversation.platform}
              </div>
            </div>

            <dl className="space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Seguidores</dt>
                <dd>{selectedConversation.author.followers ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sentiment último</dt>
                <dd className="capitalize">
                  {selectedConversation.last_message.sentiment ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Urgencia máx</dt>
                <dd>{selectedConversation.urgency_max}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Mensajes hilo</dt>
                <dd>{thread?.messages.length ?? "…"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fuente</dt>
                <dd>{selectedConversation.source}</dd>
              </div>
            </dl>

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">
                Tags manuales
              </div>
              <div className="text-xs text-muted-foreground italic">
                (próximamente — Sprint 27)
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* -------- AI Drafts popover -------- */}
      {aiOpen && (
        <AIReplyDrafts
          loading={aiLoading}
          payload={aiDrafts}
          onClose={() => setAiOpen(false)}
          onPick={(text) => {
            setComposerValue(text);
            setAiOpen(false);
            composerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
