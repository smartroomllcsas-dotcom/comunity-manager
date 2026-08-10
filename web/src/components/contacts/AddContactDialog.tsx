"use client";

import { useState } from "react";
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
import { Loader2 } from "lucide-react";

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
}

export function AddContactDialog({ open, onOpenChange, brandId }: AddContactDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setTags("");
    setError("");
    setSaving(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !saving) reset();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name,
          phone,
          email: email || undefined,
          tags,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "No fue posible crear el contacto.");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      reset();
      onOpenChange(false);
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#1a1f2e] border-[#2d333b] text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-white">Añadir contacto</DialogTitle>
        </DialogHeader>

        {!brandId && (
          <p
            role="alert"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
          >
            No hay una marca disponible. Recarga la página o verifica la asignación de marcas de tu usuario.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="contact-name" className="text-[#8b949e]">Nombre</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre del contacto"
              required
              maxLength={160}
              className="bg-[#0d1117] border-[#2d333b] text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-phone" className="text-[#8b949e]">Teléfono / wa_id</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+573001234567"
              required
              maxLength={40}
              className="bg-[#0d1117] border-[#2d333b] text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email" className="text-[#8b949e]">Correo electrónico (opcional)</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="contacto@ejemplo.com"
              maxLength={254}
              className="bg-[#0d1117] border-[#2d333b] text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-tags" className="text-[#8b949e]">Etiquetas (opcional)</Label>
            <Input
              id="contact-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="demo, prospecto"
              className="bg-[#0d1117] border-[#2d333b] text-white"
            />
            <p className="text-xs text-[#8b949e]">Separa las etiquetas con coma.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
              className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !brandId} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {saving ? "Guardando..." : "Guardar contacto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
