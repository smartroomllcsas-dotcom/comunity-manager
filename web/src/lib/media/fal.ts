// Sprint 26 · Fal.ai HTTP client (sin SDK, fetch directo)
// ---------------------------------------------------------------------------
// Queue mode: submit -> poll status cada 3s -> get result.
//
// Endpoints:
//   POST https://queue.fal.run/{model}                        -> submit
//   GET  https://queue.fal.run/{model}/requests/{id}/status   -> poll
//   GET  https://queue.fal.run/{model}/requests/{id}          -> result
//
// Costos aprox (documentar cambios en la review de sprint):
//   - fal-ai/flux-pro/v1.1              ~ $0.05 por imagen
//   - fal-ai/kling-video/v2/master/text-to-video  ~ $0.50 por 5s de video
//   - fal-ai/veo/3/text-to-video        ~ $2.50 por 5s (mas caro, mejor calidad)
//   - fal-ai/creative-upscaler          ~ $0.05 por imagen
//   - fal-ai/aura-sr                    ~ $0.02 por imagen
//
// Timeout total: 180s para video (kling tarda 60-120s), 60s para imagen.
// API key via env FAL_KEY. Si falta -> { ok: false, error: 'FAL_KEY not configured' }.
//
// SEGURIDAD: nunca logear FAL_KEY. Nunca retornar el header Authorization al cliente.

const FAL_BASE = "https://queue.fal.run";

export type FalResult<T = FalOutput> =
  | { ok: true; data: T; requestId: string; elapsedMs: number }
  | { ok: false; error: string };

export type FalOutput = {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  raw?: unknown;
};

// --- Modelos por default -----------------------------------------------------

export const DEFAULT_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";
export const DEFAULT_VIDEO_MODEL = "fal-ai/kling-video/v2/master/text-to-video";
export const DEFAULT_UPSCALER = "fal-ai/creative-upscaler";

// Costo estimado en USD por generacion (para reportar al usuario).
export function estimateCostUsd(model: string, seconds?: number): number {
  const m = model.toLowerCase();
  if (m.includes("flux")) return 0.05;
  if (m.includes("kling")) return Math.max(0.5, ((seconds ?? 5) / 5) * 0.5);
  if (m.includes("veo")) return Math.max(2.5, ((seconds ?? 5) / 5) * 2.5);
  if (m.includes("creative-upscaler")) return 0.05;
  if (m.includes("aura-sr")) return 0.02;
  return 0.1;
}

function getKey(): string | null {
  const k = process.env.FAL_KEY;
  return k && k.trim() ? k.trim() : null;
}

function authHeaders(): Record<string, string> {
  const key = getKey();
  if (!key) throw new Error("FAL_KEY not configured");
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
}

// --- Aspect ratio helpers ----------------------------------------------------

const ASPECT_TO_SIZE: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "4:5": { width: 896, height: 1152 },
  "3:4": { width: 896, height: 1152 },
};

function sizeFromAspect(aspect?: string) {
  if (!aspect) return ASPECT_TO_SIZE["1:1"];
  return ASPECT_TO_SIZE[aspect] || ASPECT_TO_SIZE["1:1"];
}

// --- Queue primitives --------------------------------------------------------

async function submit(
  model: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${FAL_BASE}/${model}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `submit HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { request_id?: string };
    if (!json.request_id) {
      return { ok: false, error: "submit: falta request_id en la respuesta" };
    }
    return { ok: true, requestId: json.request_id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "submit failed",
    };
  }
}

async function pollUntilDone(
  model: string,
  requestId: string,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadline = Date.now() + timeoutMs;
  const pollEveryMs = 3000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `${FAL_BASE}/${model}/requests/${requestId}/status`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        // No abortar por 5xx transitorio; esperar y reintentar.
        await sleep(pollEveryMs);
        continue;
      }
      const status = (await res.json()) as { status?: string };
      const s = (status.status || "").toUpperCase();
      if (s === "COMPLETED") return { ok: true };
      if (s === "FAILED" || s === "CANCELED") {
        return { ok: false, error: `fal request ${s.toLowerCase()}` };
      }
      // IN_QUEUE / IN_PROGRESS -> sleep y reintentar
    } catch {
      // network hiccup, retry
    }
    await sleep(pollEveryMs);
  }
  return { ok: false, error: `polling timeout tras ${Math.round(timeoutMs / 1000)}s` };
}

async function getResult(
  model: string,
  requestId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${FAL_BASE}/${model}/requests/${requestId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `result HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "result fetch failed",
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Result parsing ----------------------------------------------------------

function parseFirstMediaUrl(raw: unknown): FalOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Casos comunes: { images: [{url, width, height, content_type}] }
  const images = r.images as unknown;
  if (Array.isArray(images) && images.length > 0) {
    const it = images[0] as Record<string, unknown>;
    if (typeof it.url === "string") {
      return {
        url: it.url,
        mimeType: typeof it.content_type === "string" ? it.content_type : undefined,
        width: typeof it.width === "number" ? it.width : undefined,
        height: typeof it.height === "number" ? it.height : undefined,
        raw,
      };
    }
  }

  // Video: { video: { url, content_type, duration } }
  const video = r.video as unknown;
  if (video && typeof video === "object") {
    const v = video as Record<string, unknown>;
    if (typeof v.url === "string") {
      return {
        url: v.url,
        mimeType: typeof v.content_type === "string" ? v.content_type : undefined,
        duration: typeof v.duration === "number" ? v.duration : undefined,
        raw,
      };
    }
  }

  // Image singular: { image: { url } }
  const image = r.image as unknown;
  if (image && typeof image === "object") {
    const im = image as Record<string, unknown>;
    if (typeof im.url === "string") {
      return {
        url: im.url,
        mimeType: typeof im.content_type === "string" ? im.content_type : undefined,
        width: typeof im.width === "number" ? im.width : undefined,
        height: typeof im.height === "number" ? im.height : undefined,
        raw,
      };
    }
  }

  return null;
}

// --- Public API --------------------------------------------------------------

export type GenerateImageInput = {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  seed?: number;
  style?: string;
};

/** Genera una imagen via Fal.ai. Timeout 60s. */
export async function generateImage(input: GenerateImageInput): Promise<FalResult> {
  if (!getKey()) return { ok: false, error: "FAL_KEY not configured" };
  const model = input.model || DEFAULT_IMAGE_MODEL;
  const size = sizeFromAspect(input.aspectRatio);
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: { width: size.width, height: size.height },
    num_images: 1,
    enable_safety_checker: true,
  };
  if (typeof input.seed === "number") payload.seed = input.seed;
  if (input.style) payload.style = input.style;

  return runQueueJob(model, payload, 60_000);
}

export type GenerateVideoInput = {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number; // seconds
};

/** Genera un video via Fal.ai. Timeout 180s (kling puede tardar 60-120s). */
export async function generateVideo(input: GenerateVideoInput): Promise<FalResult> {
  if (!getKey()) return { ok: false, error: "FAL_KEY not configured" };
  const model = input.model || DEFAULT_VIDEO_MODEL;
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio || "16:9",
    duration: input.duration || 5,
  };
  return runQueueJob(model, payload, 180_000);
}

export type EnhanceImageInput = {
  imageUrl: string;
  model?: string;
};

/** Mejora resolucion via creative-upscaler / aura-sr. */
export async function enhanceImage(input: EnhanceImageInput): Promise<FalResult> {
  if (!getKey()) return { ok: false, error: "FAL_KEY not configured" };
  const model = input.model || DEFAULT_UPSCALER;
  const payload: Record<string, unknown> = { image_url: input.imageUrl };
  return runQueueJob(model, payload, 90_000);
}

async function runQueueJob(
  model: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<FalResult> {
  const start = Date.now();
  const submitted = await submit(model, payload);
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const polled = await pollUntilDone(model, submitted.requestId, timeoutMs);
  if (!polled.ok) return { ok: false, error: polled.error };

  const result = await getResult(model, submitted.requestId);
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = parseFirstMediaUrl(result.data);
  if (!parsed) {
    return { ok: false, error: "fal: no se pudo extraer URL del resultado" };
  }
  return {
    ok: true,
    data: parsed,
    requestId: submitted.requestId,
    elapsedMs: Date.now() - start,
  };
}

/** True si FAL_KEY esta configurada. Uso: preflight check en /api/media/generate. */
export function isFalConfigured(): boolean {
  return getKey() !== null;
}
