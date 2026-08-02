"use client";

// Sprint 25 · Formulario de respuesta del cliente (approve / reject).
// Se monta debajo del <PlatformPreview> en la página pública.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Decision = "approved" | "rejected";

export function ApprovalForm({ token }: { token: string }) {
  const [decision, setDecision] = React.useState<Decision>("approved");
  const [comments, setComments] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState<null | {
    status: Decision;
    at: string;
  }>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (decision === "rejected" && !comments.trim()) {
      setErr("Cuéntanos qué cambiar antes de rechazar.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approval/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          comments: comments.trim() || undefined,
          responded_by_email: email.trim() || undefined,
          responded_by_name: name.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? `Error HTTP ${res.status}`);
        return;
      }
      setDone({ status: decision, at: json?.responded_at ?? new Date().toISOString() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-6 text-center">
        <h3 className="text-lg font-semibold text-[#e6edf3] mb-1">
          {done.status === "approved" ? "¡Post aprobado!" : "Post rechazado"}
        </h3>
        <p className="text-sm text-[#7d8590]">
          {done.status === "approved"
            ? "La agencia recibió tu aprobación. El post se publicará automáticamente en la fecha programada."
            : "Enviamos tus comentarios a la agencia. Volverán a compartirte una nueva versión."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-[#2d333b] bg-[#0d1117] p-6">
      <div className="space-y-2">
        <Label>Tu decisión</Label>
        <div className="flex gap-2">
          <label
            className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm text-center ${
              decision === "approved"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                : "border-[#2d333b] text-[#7d8590]"
            }`}
          >
            <input
              type="radio"
              name="decision"
              value="approved"
              checked={decision === "approved"}
              onChange={() => setDecision("approved")}
              className="sr-only"
            />
            Aprobar
          </label>
          <label
            className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm text-center ${
              decision === "rejected"
                ? "border-red-500 bg-red-500/10 text-red-300"
                : "border-[#2d333b] text-[#7d8590]"
            }`}
          >
            <input
              type="radio"
              name="decision"
              value="rejected"
              checked={decision === "rejected"}
              onChange={() => setDecision("rejected")}
              className="sr-only"
            />
            Rechazar
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="approval-comments">
          Comentarios {decision === "rejected" && <span className="text-red-400">*</span>}
        </Label>
        <Textarea
          id="approval-comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder={
            decision === "approved"
              ? "Opcional: nota para la agencia."
              : "Describe qué cambiar antes de publicar."
          }
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="approval-name">Tu nombre</Label>
          <Input
            id="approval-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: María López"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="approval-email">Email (opcional)</Label>
          <Input
            id="approval-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
          />
        </div>
      </div>

      {err && (
        <p className="text-sm text-red-400" role="alert">
          {err}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : decision === "approved" ? "Aprobar post" : "Enviar rechazo"}
      </Button>
    </form>
  );
}
