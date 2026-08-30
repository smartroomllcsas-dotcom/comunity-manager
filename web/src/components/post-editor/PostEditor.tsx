"use client";

// Sprint 24 · Editor WYSIWYG minimal tipo Buffer/Publer.
// Redacta UNA vez → preview por canal en vivo → guardar draft o programar.
// Al programar (status=scheduled) el backend emite el evento Inngest
// `cm/post.schedule.requested` que consume el worker de Sprint 22.

import * as React from "react";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Hash,
  Link as LinkIcon,
  Image as ImageIcon,
  Save,
  Send,
  Trash2,
  Loader2,
  UserCheck,
  Copy as CopyIcon,
} from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { PlatformPreview } from "./PlatformPreview";
import AssetBrowser from "@/components/media/AssetBrowser";
import { Sparkles } from "lucide-react";
import {
  PLATFORMS,
  PLATFORM_META,
  tightestLimit,
  type Platform,
} from "./platforms";

// -- Types --------------------------------------------------------------------

export type ClientOption = { id: string; name: string };

export type PostEditorProps = {
  initialClients?: ClientOption[];
  initialPost?: {
    id?: string;
    client_id?: string;
    content?: string;
    media_urls?: string[];
    platforms?: Platform[];
    scheduled_at?: string | null;
    timezone?: string;
  };
};

// -- Hook: useClients ---------------------------------------------------------

/**
 * Fetch de clientes desde /api/cm/clients (mismo endpoint del BrandSwitcher).
 * Usa `initialClients` (prefetch server-side) si viene; si no, consulta el API.
 * Sin marcas → lista vacía (el UI muestra estado honesto, nunca mock).
 */
function useClients(initial?: ClientOption[]) {
  const [clients, setClients] = React.useState<ClientOption[]>(initial ?? []);
  const [loading, setLoading] = React.useState(!initial || initial.length === 0);

  React.useEffect(() => {
    if (initial && initial.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cm/clients", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const raw = Array.isArray(json?.clients) ? json.clients : Array.isArray(json) ? json : [];
        const list: ClientOption[] = raw
          .filter((c: unknown): c is { id: string; name?: string | null } =>
            !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string",
          )
          .map((c: { id: string; name?: string | null }) => ({ id: c.id, name: c.name ?? "Sin nombre" }));
        if (!cancelled) setClients(list);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  return { clients, loading };
}

// -- Toolbar helper: aplicar markdown a la selección --------------------------

function wrapSelection(
  textarea: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string = prefix,
): { next: string; caret: number } | null {
  if (!textarea) return null;
  const { selectionStart, selectionEnd, value } = textarea;
  const before = value.slice(0, selectionStart);
  const middle = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const wrapped = `${prefix}${middle || "texto"}${suffix}`;
  const next = `${before}${wrapped}${after}`;
  const caret = before.length + prefix.length + (middle || "texto").length;
  return { next, caret };
}

// -- Component ---------------------------------------------------------------

export default function PostEditor({ initialClients, initialPost }: PostEditorProps) {
  const { clients, loading: clientsLoading } = useClients(initialClients);

  const [postId, setPostId] = React.useState<string | undefined>(initialPost?.id);
  const [clientId, setClientId] = React.useState<string>(initialPost?.client_id ?? "");
  const [content, setContent] = React.useState<string>(initialPost?.content ?? "");
  const [mediaUrls, setMediaUrls] = React.useState<string[]>(initialPost?.media_urls ?? []);
  const [selectedPlatforms, setSelectedPlatforms] = React.useState<Platform[]>(
    initialPost?.platforms ?? ["ig-feed"],
  );
  const [scheduledAt, setScheduledAt] = React.useState<string>(initialPost?.scheduled_at ?? "");
  const [timezone] = React.useState<string>(initialPost?.timezone ?? "America/Bogota");
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  // Sprint 25 · approval modal state
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [approvalSending, setApprovalSending] = React.useState(false);
  const [approvalEmail, setApprovalEmail] = React.useState("");
  const [approvalPhone, setApprovalPhone] = React.useState("");
  const [approvalNotifyEmail, setApprovalNotifyEmail] = React.useState(true);
  const [approvalNotifyWa, setApprovalNotifyWa] = React.useState(false);
  const [approvalUrl, setApprovalUrl] = React.useState<string | null>(null);

  // Auto-select first client cuando cargan.
  React.useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id);
  }, [clients, clientId]);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const limit = React.useMemo(() => tightestLimit(selectedPlatforms), [selectedPlatforms]);
  const overLimit = Number.isFinite(limit) && content.length > limit;

  // -- Toolbar actions --------------------------------------------------------

  function applyWrap(prefix: string, suffix?: string) {
    const result = wrapSelection(textareaRef.current, prefix, suffix ?? prefix);
    if (!result) return;
    setContent(result.next);
    // Restaurar caret en próximo tick
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.caret, result.caret);
      }
    });
  }

  function insertAtCaret(insert: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((c) => c + insert);
      return;
    }
    const { selectionStart, selectionEnd, value } = ta;
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    setContent(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = selectionStart + insert.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }

  // Sprint 26: reemplazado por AssetBrowser (upload a Supabase Storage +
  // generacion con IA via Fal.ai). Los assets seleccionados llegan por callback.
  const [assetBrowserOpen, setAssetBrowserOpen] = React.useState(false);
  const [aiBrowserOpen, setAiBrowserOpen] = React.useState(false);

  function handleAssetsSelected(urls: string[]) {
    if (!urls.length) return;
    setMediaUrls((m) => Array.from(new Set([...m, ...urls])));
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  // -- Save / Schedule --------------------------------------------------------

  function validate(status: "draft" | "scheduled"): string | null {
    if (!clientId) return "Selecciona un cliente";
    if (selectedPlatforms.length === 0) return "Selecciona al menos un canal";
    if (!content.trim()) return "El contenido no puede estar vacío";
    if (status === "scheduled") {
      if (!scheduledAt) return "Selecciona fecha/hora para programar";
      const t = Date.parse(scheduledAt);
      if (Number.isNaN(t)) return "Fecha/hora inválida";
      if (t < Date.now()) return "La fecha debe ser futura";
    }
    if (overLimit) return `El texto excede ${limit} chars del canal más restrictivo`;
    return null;
  }

  async function submit(status: "draft" | "scheduled") {
    const err = validate(status);
    if (err) {
      toast.error(err);
      return;
    }

    const isScheduling = status === "scheduled";
    if (isScheduling) setScheduling(true);
    else setSavingDraft(true);

    try {
      const payload = {
        id: postId,
        client_id: clientId,
        platforms: selectedPlatforms,
        content,
        media_urls: mediaUrls,
        scheduled_at: isScheduling
          ? new Date(scheduledAt).toISOString()
          : null,
        status,
        timezone,
      };
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json?.error ?? `Error HTTP ${res.status}`);
        return;
      }
      setPostId(json.id);
      toast.success(
        isScheduling ? "Post programado" : "Draft guardado",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSavingDraft(false);
      setScheduling(false);
    }
  }

  // -- Sprint 25 · Send to client for approval --------------------------------

  async function sendForApproval() {
    if (!postId) {
      toast.error("Guarda el draft antes de enviar a aprobación");
      return;
    }
    if (!clientId) {
      toast.error("Selecciona un cliente");
      return;
    }
    const notify: ("email" | "whatsapp")[] = [];
    if (approvalNotifyEmail && approvalEmail.trim()) notify.push("email");
    if (approvalNotifyWa && approvalPhone.trim()) notify.push("whatsapp");
    setApprovalSending(true);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          client_id: clientId,
          notify_channels: notify,
          recipient_email: approvalEmail.trim() || undefined,
          recipient_phone: approvalPhone.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json?.error ?? `Error HTTP ${res.status}`);
        return;
      }
      setApprovalUrl(json.url ?? null);
      toast.success("Enlace de aprobación generado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setApprovalSending(false);
    }
  }

  async function copyApprovalLink() {
    if (!approvalUrl) return;
    try {
      await navigator.clipboard.writeText(approvalUrl);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  // -- Render -----------------------------------------------------------------

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6">
      {/* Panel izquierdo: editor */}
      <div className="space-y-4">
        {/* Cliente */}
        <div className="space-y-1.5">
          <Label htmlFor="post-client">Cliente</Label>
          <Select
            value={clientId}
            onValueChange={(v) => setClientId(v ?? "")}
            disabled={clientsLoading}
          >
            <SelectTrigger id="post-client" aria-label="Cliente" className="w-full">
              <SelectValue placeholder={clientsLoading ? "Cargando…" : "Elige un cliente"} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Canales */}
        <div className="space-y-1.5">
          <Label>Canales</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Canales de destino">
            {PLATFORMS.map((p) => {
              const active = selectedPlatforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition-colors",
                    active
                      ? "bg-[#3b82f6] text-white border-[#3b82f6]"
                      : "bg-transparent text-[#7d8590] border-[#2d333b] hover:bg-[#1a1f2e] hover:text-[#e6edf3]",
                  )}
                >
                  {PLATFORM_META[p].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-[#2d333b] bg-[#0d1117] p-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Negrita"
            onClick={() => applyWrap("**")}
            type="button"
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cursiva"
            onClick={() => applyWrap("*")}
            type="button"
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hashtag"
            onClick={() => insertAtCaret(" #")}
            type="button"
          >
            <Hash className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Enlace"
            onClick={() => {
              const url = window.prompt("URL del enlace:");
              if (url) insertAtCaret(` ${url} `);
            }}
            type="button"
          >
            <LinkIcon className="size-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAssetBrowserOpen(true)}
            type="button"
            disabled={!clientId}
            title={!clientId ? "Selecciona un cliente primero" : undefined}
          >
            <ImageIcon className="size-3.5" /> Media
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAiBrowserOpen(true)}
            type="button"
            disabled={!clientId}
            title={!clientId ? "Selecciona un cliente primero" : "Generar con IA (Fal.ai)"}
          >
            <Sparkles className="size-3.5" /> Generar con IA
          </Button>
          {clientId && (
            <>
              <AssetBrowser
                clientId={clientId}
                open={assetBrowserOpen}
                onOpenChange={setAssetBrowserOpen}
                onSelect={handleAssetsSelected}
                initialTab="all"
              />
              <AssetBrowser
                clientId={clientId}
                open={aiBrowserOpen}
                onOpenChange={setAiBrowserOpen}
                onSelect={handleAssetsSelected}
                initialTab="ai"
                seedPrompt={content}
              />
            </>
          )}
        </div>

        {/* Textarea */}
        <div className="space-y-1.5">
          <Label htmlFor="post-content">Contenido</Label>
          <Textarea
            id="post-content"
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe una vez. Se verá en cada canal 👉"
            className="min-h-40"
            aria-describedby="char-counter"
          />
          <div id="char-counter" className="flex items-center justify-between text-xs">
            <span className={cn(overLimit ? "text-[#f85149]" : "text-[#7d8590]")}>
              {content.length}
              {Number.isFinite(limit) && ` / ${limit}`} caracteres
              {overLimit && " · excede el canal más restrictivo"}
            </span>
            {selectedPlatforms.length > 0 && Number.isFinite(limit) && (
              <span className="text-[#7d8590]">
                Límite del canal más estrecho
              </span>
            )}
          </div>
        </div>

        {/* Media list */}
        {mediaUrls.length > 0 && (
          <div className="space-y-1.5">
            <Label>Adjuntos ({mediaUrls.length})</Label>
            <ul className="space-y-1">
              {mediaUrls.map((u, i) => (
                <li
                  key={`${u}-${i}`}
                  className="flex items-center gap-2 text-xs bg-[#0d1117] border border-[#2d333b] rounded-md px-2 py-1"
                >
                  <ImageIcon className="size-3 text-[#7d8590] shrink-0" />
                  <span className="truncate text-[#e6edf3]">{u}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Quitar adjunto ${i + 1}`}
                    onClick={() => setMediaUrls((m) => m.filter((_, idx) => idx !== i))}
                    type="button"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Programación */}
        <div className="space-y-1.5">
          <Label htmlFor="post-scheduled">
            Programar para <Badge variant="secondary">{timezone}</Badge>
          </Label>
          <Input
            id="post-scheduled"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        {/* Botones */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={() => submit("draft")}
            disabled={savingDraft || scheduling}
            type="button"
          >
            {savingDraft ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Guardar draft
          </Button>
          <Button
            onClick={() => submit("scheduled")}
            disabled={savingDraft || scheduling || !scheduledAt}
            type="button"
          >
            {scheduling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Programar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setApprovalUrl(null);
              setApprovalOpen(true);
            }}
            disabled={savingDraft || scheduling || !postId}
            type="button"
            title={!postId ? "Guarda el draft primero" : "Enviar a cliente para aprobación"}
          >
            <UserCheck className="size-3.5" />
            Enviar a cliente para aprobación
          </Button>
        </div>

        {/* Sprint 25 · Modal aprobación (inline, sin dep de Dialog para reducir riesgo) */}
        {approvalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-modal-title"
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setApprovalOpen(false);
            }}
          >
            <div className="w-full max-w-md rounded-lg border border-[#2d333b] bg-[#0d1117] p-5 space-y-4">
              <div>
                <h3 id="approval-modal-title" className="text-base font-semibold text-[#e6edf3]">
                  Enviar a cliente para aprobación
                </h3>
                <p className="text-xs text-[#7d8590] mt-1">
                  Se genera un enlace único (7 días) para que el cliente revise sin necesidad de login.
                </p>
              </div>

              {approvalUrl ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-[#2d333b] bg-[#010409] p-2 text-xs text-[#e6edf3] break-all">
                    {approvalUrl}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={copyApprovalLink} className="flex-1">
                      <CopyIcon className="size-3.5" />
                      Copiar enlace
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setApprovalOpen(false)}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="approval-email">Email del cliente</Label>
                    <Input
                      id="approval-email"
                      type="email"
                      value={approvalEmail}
                      onChange={(e) => setApprovalEmail(e.target.value)}
                      placeholder="cliente@empresa.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="approval-phone">Teléfono WhatsApp (opcional)</Label>
                    <Input
                      id="approval-phone"
                      value={approvalPhone}
                      onChange={(e) => setApprovalPhone(e.target.value)}
                      placeholder="+57 300 000 0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-[#e6edf3]">
                      <input
                        type="checkbox"
                        checked={approvalNotifyEmail}
                        onChange={(e) => setApprovalNotifyEmail(e.target.checked)}
                      />
                      Notificar por email
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#e6edf3]">
                      <input
                        type="checkbox"
                        checked={approvalNotifyWa}
                        onChange={(e) => setApprovalNotifyWa(e.target.checked)}
                      />
                      Notificar por WhatsApp
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setApprovalOpen(false)}
                      disabled={approvalSending}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={sendForApproval}
                      disabled={approvalSending}
                      className="flex-1"
                    >
                      {approvalSending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      Enviar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Panel derecho: preview */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-[#e6edf3]">Preview</div>
        <div className="text-xs text-[#7d8590] mb-2">Vista real por canal seleccionado.</div>
        <PlatformPreview
          platforms={selectedPlatforms}
          content={content}
          media={mediaUrls}
        />
      </div>
    </div>
  );
}
