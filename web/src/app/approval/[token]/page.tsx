// Sprint 25 · Portal PÚBLICO (sin auth) — cliente revisa/aprueba/rechaza un post.
//
// Server component: fetch server-side el estado del token → si válido
// renderiza PlatformPreview + ApprovalForm. Si expirado/inválido, muestra
// pantalla friendly. Sin sidebar/header (layout minimalista tipo Stripe/Linear).

import * as React from "react";
import { headers } from "next/headers";
import { PlatformPreview } from "@/components/post-editor/PlatformPreview";
import type { Platform } from "@/components/post-editor/platforms";
import { ApprovalForm } from "./ApprovalForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Deshabilitamos el AppShell heredando de un layout minimal (definido abajo).

async function loadApproval(token: string) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;
  const res = await fetch(`${base}/api/approval/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-[#010409] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-3">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">{title}</h1>
        <p className="text-sm text-[#7d8590]">{body}</p>
      </div>
    </main>
  );
}

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { ok, status, json } = await loadApproval(token);

  if (!ok) {
    if (status === 410) {
      return (
        <ErrorScreen
          title="Este enlace ha expirado o no es válido"
          body="Pídele a la agencia un nuevo enlace de aprobación."
        />
      );
    }
    return (
      <ErrorScreen
        title="No pudimos cargar la solicitud"
        body={typeof json?.error === "string" ? json.error : "Intenta de nuevo en unos minutos."}
      />
    );
  }

  const approval = json.approval as {
    id: string;
    status: "pending" | "approved" | "rejected" | "expired";
    expires_at: string;
    responded_at: string | null;
  };
  const post = json.post as {
    content: string;
    media_urls: string[];
    platforms: string[];
    scheduled_date: string | null;
    timezone: string | null;
  };
  const client = json.client as { name: string; brand: string | null } | null;

  const alreadyResponded = approval.status !== "pending";

  return (
    <main className="min-h-screen bg-[#010409] text-[#e6edf3]">
      {/* Header minimalista */}
      <header className="border-b border-[#2d333b] px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Aprobación de post</h1>
            {client && (
              <p className="text-xs text-[#7d8590]">
                Para <span className="text-[#e6edf3]">{client.name}</span>
              </p>
            )}
          </div>
          <div className="text-xs text-[#7d8590]">
            Expira{" "}
            {new Date(approval.expires_at).toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section aria-labelledby="preview-heading">
          <h2 id="preview-heading" className="text-sm font-medium text-[#7d8590] mb-3">
            Preview por canal
          </h2>
          <PlatformPreview
            platforms={post.platforms as Platform[]}
            content={post.content}
            media={post.media_urls}
          />
        </section>

        <section aria-labelledby="respond-heading">
          <h2 id="respond-heading" className="text-sm font-medium text-[#7d8590] mb-3">
            {alreadyResponded ? "Estado de esta solicitud" : "Tu respuesta"}
          </h2>
          {alreadyResponded ? (
            <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-6 text-center">
              <p className="text-[#e6edf3] font-medium">
                Ya respondiste esta solicitud ({approval.status}).
              </p>
              {approval.responded_at && (
                <p className="text-xs text-[#7d8590] mt-1">
                  {new Date(approval.responded_at).toLocaleString("es-CO")}
                </p>
              )}
            </div>
          ) : (
            <ApprovalForm token={token} />
          )}
        </section>

        <footer className="pt-6 border-t border-[#2d333b] text-xs text-[#7d8590] text-center">
          Comunity Manager · portal seguro de aprobación
        </footer>
      </div>
    </main>
  );
}
