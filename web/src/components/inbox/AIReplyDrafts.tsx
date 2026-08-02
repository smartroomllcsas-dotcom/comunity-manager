"use client";

/**
 * Sprint 26 · AIReplyDrafts — muestra los 3 drafts que devuelve draftResponse
 * (Agente M/Sprint 25). Cards con tone + confidence + tag RECOMENDADO en el
 * mejor. Warning si should_escalate=true con reasoning visible.
 */

export interface DraftPayload {
  mode?: "draft";
  drafts: Array<{
    text: string;
    tone: string;
    confidence: number;
  }>;
  recommended: number;
  should_escalate: boolean;
  reasoning: string;
  cost_estimate_usd?: number;
  skills_used?: string[];
}

interface Props {
  loading: boolean;
  payload: DraftPayload | null;
  onPick: (text: string) => void;
  onClose: () => void;
}

const TONE_COLOR: Record<string, string> = {
  empathetic: "#a78bfa",
  direct: "#60a5fa",
  playful: "#f472b6",
};

export function AIReplyDrafts({ loading, payload, onPick, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0f172a] border border-border/50 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-border/40 flex justify-between items-center">
          <div>
            <div className="font-semibold">Drafts de IA</div>
            <div className="text-xs text-muted-foreground">
              Elige uno para pre-llenar el composer.
            </div>
          </div>
          <button
            className="text-muted-foreground hover:text-white"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded bg-white/5 animate-pulse"
                />
              ))}
            </div>
          )}

          {!loading && !payload && (
            <div className="text-muted-foreground text-sm">
              No se pudieron generar drafts. Intenta de nuevo.
            </div>
          )}

          {!loading && payload?.should_escalate && (
            <div className="border border-red-500/60 bg-red-500/10 rounded p-3 text-sm">
              <div className="font-semibold text-red-300 mb-1">
                ⚠ Recomendación: escalar a supervisor
              </div>
              <div className="text-xs text-red-200/80 whitespace-pre-wrap">
                {payload.reasoning}
              </div>
            </div>
          )}

          {!loading &&
            payload?.drafts?.map((d, idx) => {
              const isRecommended = idx === payload.recommended;
              const toneColor = TONE_COLOR[d.tone] || "#94a3b8";
              return (
                <div
                  key={idx}
                  className={`border rounded p-3 space-y-2 ${
                    isRecommended
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-border/40"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="px-1.5 py-0.5 rounded text-white font-medium"
                      style={{ background: toneColor }}
                    >
                      {d.tone}
                    </span>
                    <span className="text-muted-foreground">
                      confidence {Math.round((d.confidence || 0) * 100)}%
                    </span>
                    {isRecommended && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{d.text}</div>
                  <div className="flex justify-end">
                    <button
                      className="text-xs px-2 py-1 rounded bg-sky-500 text-white"
                      onClick={() => onPick(d.text)}
                    >
                      Usar este draft
                    </button>
                  </div>
                </div>
              );
            })}

          {!loading && payload && (
            <div className="text-[10px] text-muted-foreground text-right">
              {payload.cost_estimate_usd !== undefined && (
                <>Costo estimado: ${payload.cost_estimate_usd.toFixed(4)}</>
              )}
              {payload.skills_used?.length ? (
                <> · skills: {payload.skills_used.join(", ")}</>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
