"use client";
import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClosingCategory } from "@/types/database";

interface ClosingDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (category: string | null, notes: string | null) => Promise<void>;
  organizationId: string;
}

export function ClosingDialog({ open, onClose, onConfirm, organizationId }: ClosingDialogProps) {
  const [categories, setCategories] = useState<ClosingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;
    // Reset state
    setSelectedCategory("");
    setNewCategory("");
    setNotes("");
    setClosing(false);

    // Fetch categories
    supabase
      .from("closing_categories")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name")
      .then(({ data }) => {
        setCategories(data || []);
      });
  }, [open, organizationId, supabase]);

  if (!open) return null;

  async function handleConfirm() {
    setClosing(true);
    try {
      const category = newCategory.trim() || selectedCategory || null;

      // If new category, create it
      if (newCategory.trim() && !categories.some((c) => c.name === newCategory.trim())) {
        await supabase.from("closing_categories").insert({
          organization_id: organizationId,
          name: newCategory.trim(),
        });
      }

      await onConfirm(category, notes.trim() || null);
    } finally {
      setClosing(false);
    }
  }

  async function handleCloseWithoutNotes() {
    setClosing(true);
    try {
      await onConfirm(null, null);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-[#1a1f2e] border border-[#2d333b] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d333b]">
          <h3 className="text-sm font-semibold text-white">Cerrar Conversacion</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#484f58] hover:text-white hover:bg-[#2d333b] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Category */}
          <div>
            <label className="block text-[11px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
              Categoria
            </label>
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setNewCategory("");
                }}
                className="w-full h-9 rounded-md bg-[#0d1117] border border-[#2d333b] text-sm text-[#c9d1d9] px-3 focus:outline-none focus:border-[#388bfd] transition-colors mb-2"
              >
                <option value="">Seleccionar categoria...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="O escribe una nueva categoria..."
              value={newCategory}
              onChange={(e) => {
                setNewCategory(e.target.value);
                setSelectedCategory("");
              }}
              className="w-full h-9 rounded-md bg-[#0d1117] border border-[#2d333b] text-sm text-[#c9d1d9] placeholder:text-[#484f58] px-3 focus:outline-none focus:border-[#388bfd] transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
              Resumen (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escribe un resumen de la conversacion..."
              rows={3}
              className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] text-sm text-[#c9d1d9] placeholder:text-[#484f58] px-3 py-2 resize-none focus:outline-none focus:border-[#388bfd] transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#2d333b]">
          <button
            onClick={handleCloseWithoutNotes}
            disabled={closing}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium text-[#8b949e] hover:text-white hover:bg-[#2d333b] transition-colors disabled:opacity-50"
          >
            Cerrar sin notas
          </button>
          <button
            onClick={handleConfirm}
            disabled={closing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-medium bg-[#4f46e5] text-white hover:bg-[#6366f1] transition-colors disabled:opacity-50"
          >
            {closing && <Loader2 className="h-3 w-3 animate-spin" />}
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
