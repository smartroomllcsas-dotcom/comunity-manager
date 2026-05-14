"use client";
import { useState, useRef, useCallback } from "react";
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
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "mapping" | "importing" | "results";

const CONTACT_FIELDS = [
  { value: "__skip__", label: "-- Omitir --" },
  { value: "name", label: "Nombre" },
  { value: "wa_id", label: "Telefono (wa_id)" },
  { value: "email", label: "Email" },
  { value: "tags", label: "Etiquetas" },
];

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    total: number;
    errors: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setStep("upload");
    setFile(null);
    setCsvHeaders([]);
    setCsvPreview([]);
    setMapping({});
    setResults(null);
    setImporting(false);
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  const parseFile = useCallback(async (f: File) => {
    setFile(f);
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) return;

    const headers = parseCSVLine(lines[0]);
    setCsvHeaders(headers);

    const preview = lines.slice(1, 4).map(parseCSVLine);
    setCsvPreview(preview);

    // Auto-detect mapping
    const autoMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const lower = h.toLowerCase().trim();
      if (lower === "nombre" || lower === "name") autoMapping[h] = "name";
      else if (lower === "telefono" || lower === "phone" || lower === "wa_id") autoMapping[h] = "wa_id";
      else if (lower === "email" || lower === "correo") autoMapping[h] = "email";
      else if (lower === "tags" || lower === "etiquetas") autoMapping[h] = "tags";
      else autoMapping[h] = "__skip__";
    });
    setMapping(autoMapping);
    setStep("mapping");
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) {
      parseFile(f);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  }

  async function handleImport() {
    if (!file) return;
    setStep("importing");
    setImporting(true);

    try {
      const cleanMapping: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field !== "__skip__") cleanMapping[header] = field;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(cleanMapping));

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResults(data);
        setStep("results");
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      } else {
        setResults({
          imported: 0,
          updated: 0,
          skipped: 0,
          total: 0,
          errors: [data.error || "Error desconocido"],
        });
        setStep("results");
      }
    } catch (err) {
      setResults({
        imported: 0,
        updated: 0,
        skipped: 0,
        total: 0,
        errors: [err instanceof Error ? err.message : "Error de conexion"],
      });
      setStep("results");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#1a1f2e] border-[#2d333b] text-white sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-white">Importar contactos</DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="py-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-[#2d333b] hover:border-[#3d444d]"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-[#8b949e] mx-auto mb-3" />
              <p className="text-sm text-white mb-1">
                Arrastra un archivo CSV aqui
              </p>
              <p className="text-xs text-[#8b949e] mb-4">
                o selecciona un archivo de tu computadora
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="bg-transparent border-[#2d333b] text-white hover:bg-[#2d333b]"
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Seleccionar archivo
              </Button>
            </div>
            <p className="text-xs text-[#8b949e] mt-3">
              El archivo debe tener columnas como: nombre, telefono, email, tags.
              La columna de telefono es obligatoria.
            </p>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === "mapping" && (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-2 text-sm text-[#8b949e]">
              <FileText className="h-4 w-4" />
              <span>{file?.name}</span>
              <button onClick={reset} className="ml-auto text-xs text-red-400 hover:text-red-300">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <Label className="text-[#8b949e] text-sm mb-2 block">Mapeo de columnas</Label>
              <div className="space-y-2">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-3">
                    <span className="text-sm text-white w-[140px] truncate" title={header}>
                      {header}
                    </span>
                    <span className="text-[#8b949e] text-xs">&rarr;</span>
                    <Select
                      value={mapping[header] || "__skip__"}
                      onValueChange={(v) => { if (v) setMapping((prev) => ({ ...prev, [header]: v })); }}
                    >
                      <SelectTrigger className="flex-1 bg-[#0d1117] border-[#2d333b] text-white text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                        {CONTACT_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-white text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {csvPreview.length > 0 && (
              <div>
                <Label className="text-[#8b949e] text-sm mb-2 block">Vista previa (primeras {csvPreview.length} filas)</Label>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2d333b]">
                        {csvHeaders.map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left text-[#8b949e] font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, i) => (
                        <tr key={i} className="border-b border-[#2d333b]/50">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5 text-white truncate max-w-[120px]">
                              {cell || <span className="text-[#8b949e]">--</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="py-8 text-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-sm text-white mb-1">Importando contactos...</p>
            <p className="text-xs text-[#8b949e]">Esto puede tomar unos segundos</p>
          </div>
        )}

        {/* Step 4: Results */}
        {step === "results" && results && (
          <div className="py-4 space-y-4">
            {results.imported + results.updated > 0 ? (
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium">Importacion completada</p>
                  <p className="text-xs text-[#8b949e]">
                    {results.total} filas procesadas
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium">Error en la importacion</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-400">{results.imported}</p>
                <p className="text-xs text-[#8b949e]">Nuevos</p>
              </div>
              <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-blue-400">{results.updated}</p>
                <p className="text-xs text-[#8b949e]">Actualizados</p>
              </div>
              <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-yellow-400">{results.skipped}</p>
                <p className="text-xs text-[#8b949e]">Omitidos</p>
              </div>
            </div>

            {results.errors.length > 0 && (
              <div className="space-y-1">
                <Label className="text-[#8b949e] text-xs">Errores:</Label>
                {results.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
            >
              Cancelar
            </Button>
          )}
          {step === "mapping" && (
            <>
              <Button
                variant="outline"
                onClick={reset}
                className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
              >
                Atras
              </Button>
              <Button
                onClick={handleImport}
                disabled={!Object.values(mapping).includes("wa_id")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Importar contactos
              </Button>
            </>
          )}
          {step === "results" && (
            <Button
              onClick={() => handleClose(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(field.trim());
        field = "";
      } else {
        field += char;
      }
    }
  }
  result.push(field.trim());
  return result;
}
