// Sprint 26 · Agente S · Portal público de self-service onboarding.
//
// Server component: fetch server-side el estado del token. Si válido renderiza
// el form client-side. Si expirado/inválido, muestra pantalla friendly.

import { headers } from "next/headers";
import { SelfOnboardingForm } from "./SelfOnboardingForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadOnboarding(token: string) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;
  const res = await fetch(
    `${base}/api/onboarding/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#010409] px-4">
      <div className="w-full max-w-md space-y-3 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-[#e6edf3]">{title}</h1>
        <p className="text-sm text-[#7d8590]">{body}</p>
      </div>
    </main>
  );
}

export default async function OnboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { ok, status, json } = await loadOnboarding(token);

  if (!ok) {
    if (status === 410) {
      return (
        <ErrorScreen
          title="Este enlace ha expirado o no es válido"
          body="Pídele a tu agencia un nuevo enlace de invitación."
        />
      );
    }
    return (
      <ErrorScreen
        title="No pudimos cargar tu onboarding"
        body={
          typeof json?.error === "string"
            ? json.error
            : "Intenta de nuevo en unos minutos."
        }
      />
    );
  }

  const state = json.state as {
    id: string;
    step: string;
    data: Record<string, unknown>;
    completed_at: string | null;
  };
  const client = json.client as { name: string } | null;
  const agency = json.agency as { name: string } | null;

  if (state.completed_at) {
    return (
      <ErrorScreen
        title="Onboarding completado"
        body="Ya has completado tu onboarding. Cierra esta ventana."
      />
    );
  }

  return (
    <SelfOnboardingForm
      token={token}
      agencyName={agency?.name ?? "tu agencia"}
      clientName={client?.name ?? "cliente"}
      initialData={state.data ?? {}}
      initialStep={state.step}
    />
  );
}
