// Sprint 26 · AssetBrowser (modal picker)
// ---------------------------------------------------------------------------
// Cierra la deuda del Sprint 24: PostEditor recibia URLs via window.prompt.
// Este modal:
//   * lista assets del cliente activo (thumbnails, hover)
//   * tabs: Todos / Uploads / IA / Recientes
//   * busqueda por texto en origin_metadata.prompt (IA)
//   * subir nuevo (POST /api/media/upload con progress via XHR)
//   * generar con IA (POST /api/media/generate, loading 30-90s)
//   * seleccion multiple (checkboxes), retorna urls[] al parent

"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Upload,
  Sparkles,
  Loader2,
  Trash2,
  ImageIcon,
  Video as VideoIcon,
  Search,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// -- Types --------------------------------------------------------------------

export type Asset = {
  id: string;
  client_id: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  origin: "upload" | "fal-flux" | "fal-kling" | "fal-veo" | "other-ai" | "import";
  origin_metadata?: Record<string, unknown> | null;
  created_at: string;
};

type BrowserTab = "all" | "uploads" | "ai" | "recent";

export type AssetBrowserProps = {
  clientId: string;
  /** Se llama con las URLs publicas seleccionadas al confirmar. */
  onSelect: (urls: string[]) => void;
  /** Contenido del post actual — se usa como prompt-base sugerido. */
  seedPrompt?: string;
  /** Tab por defecto al abrir (util para "Generar con IA" directo). */
  initialTab?: BrowserTab;
  /** Elemento clickeable que abre el modal. Si no se provee, se pinta un botón default. */
  children?: React.ReactNode;
  /** Control externo del open state (opcional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Solo permitir 1 asset (para casos donde el editor no soporta multi). */
  maxSelect?: number;
};

// -- Component ---------------------------------------------------------------

export default function AssetBrowser({
  clientId,
  onSelect,
  seedPrompt,
  initialTab = "all",
  children,
  open: openProp,
  onOpenChange,
  maxSelect,
}: AssetBrowserProps) {
  const [openInternal, setOpenInternal] = React.useState(false);
  const open = openProp ?? openInternal;
  const setOpen = React.useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      if (openProp === undefined) setOpenInternal(v);
    },
    [openProp, onOpenChange],
  );

  const [tab, setTab] = React.useState<BrowserTab>(initialTab);
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Uploader state
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadPct, setUploadPct] = React.useState<number | null>(null);

  // AI generator state
  const [aiPrompt, setAiPrompt] = React.useState(seedPrompt ?? "");
  const [aiType, setAiType] = React.useState<"image" | "video">("image");
  const [aiAspect, setAiAspect] = React.useState<string>("1:1");
  const [aiDuration, setAiDuration] = React.useState<number>(5);
  const [generating, setGenerating] = React.useState(false);

  // Reset seedPrompt cuando cambia (post editor lo alimenta)
  React.useEffect(() => {
    if (seedPrompt && !aiPrompt) setAiPrompt(seedPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  // -- Fetch listing ---------------------------------------------------------

  const fetchAssets = React.useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ client_id: clientId, limit: "100" });
      if (tab === "uploads") params.set("origin", "upload");
      else if (tab === "ai") params.set("origin", "ai");
      const res = await fetch(`/api/media?${params}`, { credentials: "same-origin" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      let list: Asset[] = Array.isArray(json.assets) ? json.assets : [];
      if (tab === "recent") {
        // los 20 mas recientes (list ya viene ordenado desc)
        list = list.slice(0, 20);
      }
      setAssets(list);
    } catch (err) {
      toast.error(`No pude cargar assets: ${err instanceof Error ? err.message : "error"}`);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, tab]);

  React.useEffect(() => {
    if (open) {
      fetchAssets();
      setSelected(new Set());
    }
  }, [open, fetchAssets]);

  // -- Filtered view (search) -----------------------------------------------

  const filteredAssets = React.useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      const prompt = (a.origin_metadata as Record<string, unknown> | null)?.prompt;
      if (typeof prompt === "string" && prompt.toLowerCase().includes(q)) return true;
      if (a.storage_path.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [assets, search]);

  // -- Selection helpers -----------------------------------------------------

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (maxSelect && next.size >= maxSelect) {
          // reemplaza el primer seleccionado si max=1
          if (maxSelect === 1) next.clear();
          else return next;
        }
        next.add(id);
      }
      return next;
    });
  }

  function confirmSelection() {
    const urls = assets.filter((a) => selected.has(a.id)).map((a) => a.public_url);
    if (urls.length === 0) {
      toast.warning("Selecciona al menos un asset");
      return;
    }
    onSelect(urls);
    setOpen(false);
  }

  // -- Upload flow (XHR con progress) ---------------------------------------

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChosen(file: File) {
    if (!clientId) {
      toast.error("Selecciona un cliente antes de subir");
      return;
    }
    setUploadPct(0);
    const form = new FormData();
    form.append("file", file);
    form.append("client_id", clientId);
    form.append("filename", file.name);

    try {
      const result = await uploadWithProgress("/api/media/upload", form, (pct) => setUploadPct(pct));
      if (!result.ok) throw new Error(result.error || "upload fallo");
      toast.success("Asset subido");
      await fetchAssets();
      // auto-seleccionar el nuevo asset
      if (result.id) {
        const newId = result.id;
        setSelected((s) => new Set(s).add(newId));
      }
    } catch (err) {
      toast.error(`Upload fallo: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // -- AI generation flow ----------------------------------------------------

  async function handleGenerate() {
    if (!aiPrompt.trim()) {
      toast.warning("Escribe un prompt");
      return;
    }
    if (!clientId) {
      toast.error("Selecciona un cliente");
      return;
    }
    setGenerating(true);
    const toastId = toast.loading(
      aiType === "video"
        ? "Generando video con Fal.ai — puede tardar 60-120s..."
        : "Generando imagen con Fal.ai...",
    );
    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          type: aiType,
          prompt: aiPrompt.trim(),
          aspectRatio: aiAspect,
          duration: aiType === "video" ? aiDuration : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success(
        `Generado en ${json.generation_time_s ?? "?"}s (~$${(json.cost_usd_estimate ?? 0).toFixed(3)})`,
        { id: toastId },
      );
      // Refrescar y auto-seleccionar
      setTab("ai");
      await fetchAssets();
      if (json.id) setSelected((s) => new Set(s).add(json.id));
    } catch (err) {
      toast.error(
        `Generacion fallo: ${err instanceof Error ? err.message : "error"}`,
        { id: toastId },
      );
    } finally {
      setGenerating(false);
    }
  }

  // -- Delete ---------------------------------------------------------------

  async function handleDelete(assetId: string) {
    if (!window.confirm("Borrar este asset permanentemente?")) return;
    try {
      const res = await fetch(`/api/media?id=${encodeURIComponent(assetId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      toast.success("Asset borrado");
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    } catch (err) {
      toast.error(`Borrado fallo: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  // -- Render ---------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger render={<span />}>{children}</DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" type="button">
              <ImageIcon className="size-3.5" /> Media
            </Button>
          }
        />
      )}
      <DialogContent className="max-w-4xl w-[min(96vw,64rem)] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Biblioteca de media</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as BrowserTab)} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="uploads">Uploads</TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="size-3.5" /> IA
              </TabsTrigger>
              <TabsTrigger value="recent">Recientes</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#7d8590]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por prompt..."
                  className="pl-7 h-8 w-56"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={triggerFilePicker}
                disabled={uploadPct !== null}
              >
                {uploadPct !== null ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> {uploadPct}%
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" /> Subir
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/mov,video/quicktime"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                }}
              />
            </div>
          </div>

          {/* Grid tabs (all, uploads, recent) */}
          {(["all", "uploads", "recent"] as const).map((t) => (
            <TabsContent key={t} value={t} className="flex-1 overflow-auto mt-3">
              <AssetGrid
                assets={filteredAssets}
                loading={loading}
                selected={selected}
                onToggle={toggleSelected}
                onDelete={handleDelete}
              />
            </TabsContent>
          ))}

          {/* AI tab: generador + grid */}
          <TabsContent value="ai" className="flex-1 overflow-auto mt-3">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
              <div className="space-y-3 bg-[#0d1117] border border-[#2d333b] rounded-md p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[#f0b429]" />
                  <span className="text-sm font-semibold">Generar con IA</span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-prompt" className="text-xs">
                    Prompt
                  </Label>
                  <Textarea
                    id="ai-prompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe la imagen/video..."
                    rows={4}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={aiType === "image" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setAiType("image")}
                  >
                    <ImageIcon className="size-3.5" /> Imagen
                  </Button>
                  <Button
                    type="button"
                    variant={aiType === "video" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setAiType("video")}
                  >
                    <VideoIcon className="size-3.5" /> Video
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Aspect ratio</Label>
                  <Select value={aiAspect} onValueChange={(v) => v && setAiAspect(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">1:1 (cuadrado)</SelectItem>
                      <SelectItem value="16:9">16:9 (horizontal)</SelectItem>
                      <SelectItem value="9:16">9:16 (vertical / reel)</SelectItem>
                      <SelectItem value="4:5">4:5 (feed IG)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {aiType === "video" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duracion (s)</Label>
                    <Select
                      value={String(aiDuration)}
                      onValueChange={(v) => v && setAiDuration(parseInt(v, 10))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5s (~$0.50)</SelectItem>
                        <SelectItem value="10">10s (~$1.00)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="text-[10px] text-[#7d8590]">
                  {aiType === "image"
                    ? "flux-pro/v1.1 · ~$0.05/imagen · ~5-15s"
                    : "kling-video v2 · ~$0.50/5s · 60-120s de generacion"}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={generating || !aiPrompt.trim()}
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Generando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" /> Generar
                    </>
                  )}
                </Button>
              </div>
              <div className="min-h-40">
                <AssetGrid
                  assets={filteredAssets}
                  loading={loading}
                  selected={selected}
                  onToggle={toggleSelected}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="justify-between border-t border-[#2d333b] pt-3">
          <div className="text-xs text-[#7d8590]">
            {selected.size > 0
              ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
              : "Selecciona uno o mas assets"}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmSelection} disabled={selected.size === 0}>
              Insertar seleccionados
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Grid subcomponent -------------------------------------------------------

function AssetGrid({
  assets,
  loading,
  selected,
  onToggle,
  onDelete,
}: {
  assets: Asset[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#7d8590] text-sm">
        <Loader2 className="size-4 animate-spin mr-2" /> Cargando...
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#7d8590] text-sm gap-2">
        <ImageIcon className="size-8 opacity-40" />
        <span>Sin assets aun</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {assets.map((a) => {
        const isVideo = a.mime_type.startsWith("video/");
        const isSelected = selected.has(a.id);
        const prompt = (a.origin_metadata as Record<string, unknown> | null)?.prompt;
        const originLabel = a.origin === "upload" ? "Upload" : "IA";
        return (
          <div
            key={a.id}
            className={cn(
              "group relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer bg-[#0d1117]",
              isSelected ? "border-[#238636]" : "border-[#2d333b] hover:border-[#7d8590]",
            )}
            onClick={() => onToggle(a.id)}
          >
            {isVideo ? (
              <video
                src={a.public_url}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.public_url}
                alt={typeof prompt === "string" ? prompt : "asset"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
            {/* checkbox visual */}
            <div
              className={cn(
                "absolute top-1.5 left-1.5 size-5 rounded border flex items-center justify-center text-xs bg-black/60",
                isSelected ? "border-[#238636] text-[#238636]" : "border-white/50 text-transparent",
              )}
              aria-hidden
            >
              ✓
            </div>
            {/* badge origen */}
            <Badge
              variant="outline"
              className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 border-white/20"
            >
              {isVideo ? <VideoIcon className="size-2.5" /> : <Sparkles className="size-2.5" />}
              {originLabel}
            </Badge>
            {/* hover overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-white/80 truncate">
                  {typeof prompt === "string" ? prompt.slice(0, 40) : new Date(a.created_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(a.id);
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-red-400"
                  aria-label="Borrar asset"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -- Upload con progress via XHR (fetch no expone progress de upload) --------

function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; id?: string; publicUrl?: string; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = 30_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          resolve({ ok: true, id: json.id, publicUrl: json.publicUrl });
        } else {
          resolve({ ok: false, error: json?.error || `HTTP ${xhr.status}` });
        }
      } catch {
        resolve({ ok: false, error: `HTTP ${xhr.status}` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "network error" });
    xhr.ontimeout = () => resolve({ ok: false, error: "timeout" });
    xhr.send(form);
  });
}

// Also export helper to control the AI-only opening from parent
export { AssetBrowser };
