"use client";
import { Sparkles, RotateCcw, Check, Loader2, X } from "lucide-react";

interface AIAssistPreviewProps {
  suggestion: string | null;
  loading: boolean;
  onUse: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}

export function AIAssistPreview({ suggestion, loading, onUse, onRegenerate, onClose }: AIAssistPreviewProps) {
  return (
    <div className="mx-4 mt-2 mb-0 rounded-lg border border-indigo-500/30 bg-indigo-500/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-indigo-500/20">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          <span className="text-[11px] font-medium text-indigo-300">Sugerencia IA</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-indigo-400/60 hover:text-indigo-300 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 min-h-[40px]">
        {loading ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            <div className="space-y-1.5 flex-1">
              <div className="h-2.5 bg-indigo-500/20 rounded animate-pulse w-[85%]" />
              <div className="h-2.5 bg-indigo-500/20 rounded animate-pulse w-[60%]" />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-indigo-100 leading-relaxed whitespace-pre-wrap">
            {suggestion}
          </p>
        )}
      </div>
      {!loading && suggestion && (
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <button
            onClick={onUse}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
          >
            <Check className="h-3 w-3" />
            Usar
          </button>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-400/70 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Regenerar
          </button>
        </div>
      )}
    </div>
  );
}

interface AIAssistButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function AIAssistButton({ onClick, disabled }: AIAssistButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-md text-indigo-400/60 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors shrink-0 mb-0.5 disabled:opacity-50"
      title="Sugerencia IA"
    >
      <Sparkles className="h-4.5 w-4.5" />
    </button>
  );
}
