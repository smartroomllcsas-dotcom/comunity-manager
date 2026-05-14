"use client";
import { useState, useEffect } from "react";
import { useContactFields } from "@/hooks/useContactFields";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users } from "lucide-react";

interface SegmentCondition {
  field: string;
  operator: string;
  value: string;
}

interface SegmentBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSegment?: {
    id: string;
    name: string;
    conditions: SegmentCondition[];
  } | null;
}

const BUILT_IN_FIELDS = [
  { key: "name", label: "Nombre", type: "text" },
  { key: "wa_id", label: "Telefono", type: "text" },
  { key: "tags", label: "Etiquetas", type: "tags" },
  { key: "lifecycle_stage_id", label: "Ciclo de vida", type: "text" },
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "es", label: "Es" },
    { value: "no_es", label: "No es" },
    { value: "contiene", label: "Contiene" },
    { value: "no_contiene", label: "No contiene" },
    { value: "definido", label: "Esta definido" },
    { value: "no_definido", label: "No esta definido" },
  ],
  number: [
    { value: "es", label: "Es" },
    { value: "no_es", label: "No es" },
    { value: "mayor_que", label: "Mayor que" },
    { value: "menor_que", label: "Menor que" },
    { value: "definido", label: "Esta definido" },
    { value: "no_definido", label: "No esta definido" },
  ],
  tags: [
    { value: "contiene", label: "Contiene" },
    { value: "no_contiene", label: "No contiene" },
  ],
  list: [
    { value: "es", label: "Es" },
    { value: "no_es", label: "No es" },
    { value: "definido", label: "Esta definido" },
    { value: "no_definido", label: "No esta definido" },
  ],
  checkbox: [
    { value: "es", label: "Es" },
    { value: "no_es", label: "No es" },
  ],
  date: [
    { value: "es", label: "Es" },
    { value: "mayor_que", label: "Despues de" },
    { value: "menor_que", label: "Antes de" },
    { value: "definido", label: "Esta definido" },
    { value: "no_definido", label: "No esta definido" },
  ],
  default: [
    { value: "es", label: "Es" },
    { value: "no_es", label: "No es" },
    { value: "definido", label: "Esta definido" },
    { value: "no_definido", label: "No esta definido" },
  ],
};

const NO_VALUE_OPERATORS = ["definido", "no_definido"];

export function SegmentBuilder({ open, onOpenChange, editingSegment }: SegmentBuilderProps) {
  const queryClient = useQueryClient();
  const { data: customFields } = useContactFields();

  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<SegmentCondition[]>([
    { field: "name", operator: "contiene", value: "" },
  ]);
  const [matchType, setMatchType] = useState<"and" | "or">("and");
  const [saving, setSaving] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (editingSegment) {
      setName(editingSegment.name);
      setConditions(editingSegment.conditions.length > 0 ? editingSegment.conditions : [{ field: "name", operator: "contiene", value: "" }]);
    } else {
      setName("");
      setConditions([{ field: "name", operator: "contiene", value: "" }]);
    }
    setPreviewCount(null);
  }, [editingSegment, open]);

  const allFields = [
    ...BUILT_IN_FIELDS,
    ...(customFields || []).map((f) => ({
      key: f.field_key,
      label: f.name,
      type: f.type,
    })),
  ];

  function getFieldType(fieldKey: string): string {
    const field = allFields.find((f) => f.key === fieldKey);
    return field?.type || "text";
  }

  function getOperators(fieldKey: string) {
    const type = getFieldType(fieldKey);
    return OPERATORS[type] || OPERATORS.default;
  }

  function updateCondition(index: number, updates: Partial<SegmentCondition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
    setPreviewCount(null);
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "name", operator: "contiene", value: "" }]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    setPreviewCount(null);
  }

  async function previewSegment() {
    setLoadingPreview(true);
    try {
      // Use the create endpoint to get count without saving
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "__preview__", conditions }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewCount(data.segment.contact_count);
        // Delete the preview segment
        await fetch(`/api/segments/${data.segment.id}`, { method: "DELETE" });
      }
    } catch {
      // ignore
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const validConditions = conditions.filter(
        (c) => NO_VALUE_OPERATORS.includes(c.operator) || c.value.trim()
      );

      if (validConditions.length === 0) return;

      const url = editingSegment ? `/api/segments/${editingSegment.id}` : "/api/segments";
      const method = editingSegment ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), conditions: validConditions }),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["segments"] });
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1f2e] border-[#2d333b] text-white sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingSegment ? "Editar segmento" : "Crear segmento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-[#8b949e] text-sm">Nombre del segmento</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Clientes VIP"
              className="mt-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[#8b949e] text-sm">Condiciones</Label>
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setMatchType("and")}
                  className={`px-2 py-0.5 rounded ${matchType === "and" ? "bg-blue-600 text-white" : "bg-[#0d1117] text-[#8b949e] border border-[#2d333b]"}`}
                >
                  Y (AND)
                </button>
                <button
                  onClick={() => setMatchType("or")}
                  className={`px-2 py-0.5 rounded ${matchType === "or" ? "bg-blue-600 text-white" : "bg-[#0d1117] text-[#8b949e] border border-[#2d333b]"}`}
                >
                  O (OR)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {conditions.map((condition, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {idx > 0 && (
                    <span className="text-xs text-[#8b949e] w-6 text-center shrink-0">
                      {matchType === "and" ? "Y" : "O"}
                    </span>
                  )}
                  {idx === 0 && conditions.length > 1 && <span className="w-6 shrink-0" />}

                  <Select
                    value={condition.field}
                    onValueChange={(v) => {
                      if (!v) return;
                      const ops = getOperators(v);
                      updateCondition(idx, { field: v, operator: ops[0].value, value: "" });
                    }}
                  >
                    <SelectTrigger className="w-[140px] bg-[#0d1117] border-[#2d333b] text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                      {allFields.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-white text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={condition.operator}
                    onValueChange={(v) => { if (v) updateCondition(idx, { operator: v }); }}
                  >
                    <SelectTrigger className="w-[130px] bg-[#0d1117] border-[#2d333b] text-white text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                      {getOperators(condition.field).map((op) => (
                        <SelectItem key={op.value} value={op.value} className="text-white text-xs">
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {!NO_VALUE_OPERATORS.includes(condition.operator) && (
                    <Input
                      value={condition.value}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      placeholder="Valor..."
                      className="flex-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] text-xs h-8"
                    />
                  )}

                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(idx)}
                      className="p-1 text-[#8b949e] hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addCondition}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Agregar condicion
            </button>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg border border-[#2d333b]">
            <Users className="h-4 w-4 text-[#8b949e]" />
            {previewCount !== null ? (
              <span className="text-sm text-white">
                <span className="font-semibold text-blue-400">{previewCount}</span> contactos coinciden
              </span>
            ) : (
              <span className="text-sm text-[#8b949e]">Vista previa de contactos</span>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={previewSegment}
              disabled={loadingPreview}
              className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white h-7 text-xs"
            >
              {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Previsualizar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {editingSegment ? "Guardar cambios" : "Crear segmento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
