"use client";
import { useState } from "react";
import { useContactFields } from "@/hooks/useContactFields";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Type,
  Hash,
  Calendar,
  Clock,
  List,
  CheckSquare,
  Link2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  User,
  Phone,
  Mail,
  Globe,
  Languages,
  Lock,
} from "lucide-react";
import Link from "next/link";
import type { ContactFieldDefinition, CustomFieldType } from "@/types/database";

export const dynamic = "force-dynamic";

const FIELD_TYPES: { value: CustomFieldType; label: string; icon: typeof Type }[] = [
  { value: "text", label: "Texto", icon: Type },
  { value: "number", label: "Numero", icon: Hash },
  { value: "date", label: "Fecha", icon: Calendar },
  { value: "time", label: "Hora", icon: Clock },
  { value: "list", label: "Lista", icon: List },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare },
  { value: "url", label: "URL", icon: Link2 },
];

const VISIBILITY_OPTIONS = [
  { value: "show_always", label: "Siempre mostrar" },
  { value: "hide_always", label: "Siempre ocultar" },
  { value: "show_when_set", label: "Mostrar cuando tiene valor" },
];

const STANDARD_FIELDS = [
  { name: "Nombre", icon: User, type: "text" },
  { name: "Telefono", icon: Phone, type: "text" },
  { name: "Email", icon: Mail, type: "text" },
  { name: "Pais", icon: Globe, type: "text" },
  { name: "Idioma", icon: Languages, type: "text" },
];

function getTypeIcon(type: CustomFieldType) {
  const found = FIELD_TYPES.find((f) => f.value === type);
  return found?.icon || Type;
}

function getTypeLabel(type: CustomFieldType) {
  const found = FIELD_TYPES.find((f) => f.value === type);
  return found?.label || type;
}

function getVisibilityLabel(visibility: string) {
  const found = VISIBILITY_OPTIONS.find((v) => v.value === visibility);
  return found?.label || visibility;
}

export default function ContactFieldsPage() {
  const { data: fields, isLoading } = useContactFields();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<ContactFieldDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");
  const [fieldVisibility, setFieldVisibility] = useState("show_always");

  function openCreateDialog() {
    setEditingField(null);
    setFieldName("");
    setFieldType("text");
    setFieldOptions("");
    setFieldDescription("");
    setFieldVisibility("show_always");
    setDialogOpen(true);
  }

  function openEditDialog(field: ContactFieldDefinition) {
    setEditingField(field);
    setFieldName(field.name);
    setFieldType(field.type);
    setFieldOptions(Array.isArray(field.options) ? field.options.join(", ") : "");
    setFieldDescription(field.description || "");
    setFieldVisibility(field.visibility || "show_always");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!fieldName.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: fieldName.trim(),
        type: fieldType,
        description: fieldDescription.trim() || null,
        visibility: fieldVisibility,
      };

      if (fieldType === "list") {
        body.options = fieldOptions
          .split(/[,\n]/)
          .map((o) => o.trim())
          .filter(Boolean);
      } else {
        body.options = [];
      }

      const url = editingField
        ? `/api/contact-fields/${editingField.id}`
        : "/api/contact-fields";
      const method = editingField ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["contact-fields"] });
        setDialogOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Estas seguro de eliminar este campo?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/contact-fields/${id}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["contact-fields"] });
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handleReorder(fieldId: string, direction: "up" | "down") {
    if (!fields) return;
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return;

    const newFields = [...fields];
    [newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]];

    const reorderPayload = newFields.map((f, i) => ({ id: f.id, position: i }));

    await fetch("/api/contact-fields/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: reorderPayload }),
    });

    queryClient.invalidateQueries({ queryKey: ["contact-fields"] });
  }

  return (
    <div className="min-h-full bg-[#0d1117] p-6">
      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="p-1.5 rounded-md hover:bg-[#1a1f2e] text-[#8b949e] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Campos de Contacto</h1>
            <p className="text-sm text-[#8b949e]">
              Define los campos de informacion que quieres almacenar para cada contacto
            </p>
          </div>
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Anadir campo
          </Button>
        </div>

        {/* Standard Fields */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
            Campos estandar
          </h2>
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
            {STANDARD_FIELDS.map((field, idx) => (
              <div
                key={field.name}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < STANDARD_FIELDS.length - 1 ? "border-b border-[#2d333b]/50" : ""
                }`}
              >
                <Lock className="h-3.5 w-3.5 text-[#8b949e]/50" />
                <div className="h-8 w-8 rounded-md bg-[#0d1117] border border-[#2d333b] flex items-center justify-center">
                  <field.icon className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-white flex-1">{field.name}</span>
                <Badge variant="outline" className="bg-transparent border-[#2d333b] text-[#8b949e] text-xs">
                  {field.type}
                </Badge>
                <span className="text-xs text-[#8b949e]/60">Solo lectura</span>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Fields */}
        <div>
          <h2 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
            Campos personalizados
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[#8b949e]">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando campos...
            </div>
          ) : !fields || fields.length === 0 ? (
            <div className="bg-[#161b22] border border-[#2d333b] rounded-lg p-8 text-center">
              <Type className="h-10 w-10 text-[#2d333b] mx-auto mb-3" />
              <p className="text-sm text-white mb-1">No hay campos personalizados</p>
              <p className="text-xs text-[#8b949e] mb-4">
                Crea campos personalizados para almacenar informacion adicional de tus contactos
              </p>
              <Button
                onClick={openCreateDialog}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Crear primer campo
              </Button>
            </div>
          ) : (
            <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
              {fields.map((field, idx) => {
                const TypeIcon = getTypeIcon(field.type);
                return (
                  <div
                    key={field.id}
                    className={`flex items-center gap-3 px-4 py-3 group ${
                      idx < fields.length - 1 ? "border-b border-[#2d333b]/50" : ""
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-[#2d333b] group-hover:text-[#8b949e] transition-colors" />
                    <div className="h-8 w-8 rounded-md bg-[#0d1117] border border-[#2d333b] flex items-center justify-center shrink-0">
                      <TypeIcon className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white block truncate">
                        {field.name}
                      </span>
                      {field.description && (
                        <span className="text-xs text-[#8b949e] block truncate">
                          {field.description}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="bg-transparent border-[#2d333b] text-[#8b949e] text-xs shrink-0">
                      {getTypeLabel(field.type)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-transparent border-[#2d333b] text-[#8b949e] text-xs shrink-0 hidden sm:inline-flex"
                    >
                      {getVisibilityLabel(field.visibility)}
                    </Badge>

                    {/* Reorder buttons */}
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleReorder(field.id, "up")}
                        disabled={idx === 0}
                        className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleReorder(field.id, "down")}
                        disabled={idx === fields.length - 1}
                        className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => openEditDialog(field)}
                      className="p-1.5 text-[#8b949e] hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(field.id)}
                      disabled={deleting === field.id}
                      className="p-1.5 text-[#8b949e] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {deleting === field.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#1a1f2e] border-[#2d333b] text-white sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingField ? "Editar campo" : "Nuevo campo personalizado"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[#8b949e] text-sm">Nombre del campo</Label>
              <Input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="Ej: Empresa, Ciudad, Fecha de nacimiento..."
                className="mt-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]"
              />
            </div>

            <div>
              <Label className="text-[#8b949e] text-sm">Tipo</Label>
              <Select value={fieldType} onValueChange={(v) => { if (v) setFieldType(v as CustomFieldType); }}>
                <SelectTrigger className="mt-1 bg-[#0d1117] border-[#2d333b] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-white">
                      <div className="flex items-center gap-2">
                        <t.icon className="h-4 w-4 text-blue-400" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {fieldType === "list" && (
              <div>
                <Label className="text-[#8b949e] text-sm">Opciones</Label>
                <Textarea
                  value={fieldOptions}
                  onChange={(e) => setFieldOptions(e.target.value)}
                  placeholder="Opcion 1, Opcion 2, Opcion 3&#10;o una por linea"
                  rows={3}
                  className="mt-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]"
                />
                <p className="text-xs text-[#8b949e] mt-1">
                  Separadas por comas o una por linea
                </p>
              </div>
            )}

            <div>
              <Label className="text-[#8b949e] text-sm">Descripcion (opcional)</Label>
              <Input
                value={fieldDescription}
                onChange={(e) => setFieldDescription(e.target.value)}
                placeholder="Descripcion del campo..."
                className="mt-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]"
              />
            </div>

            <div>
              <Label className="text-[#8b949e] text-sm">Visibilidad</Label>
              <Select value={fieldVisibility} onValueChange={(v) => { if (v) setFieldVisibility(v); }}>
                <SelectTrigger className="mt-1 bg-[#0d1117] border-[#2d333b] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                  {VISIBILITY_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value} className="text-white">
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !fieldName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editingField ? "Guardar cambios" : "Crear campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
