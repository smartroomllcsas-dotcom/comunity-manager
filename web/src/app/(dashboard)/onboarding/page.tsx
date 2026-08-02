// Sprint 26 · Agente S · Onboarding wizard page (agencia-side).
//
// Server component: obtiene client_id via ?client_id=XX, resuelve access,
// carga state actual y renderiza el wizard client-side.

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ client_id?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { client_id } = await searchParams;
  const supa = await createServerSupabase();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return (
      <EmptyState
        title="Necesitas iniciar sesión"
        body="Inicia sesión con tu cuenta de agencia para configurar clientes."
        ctaLabel="Ir a login"
        ctaHref="/login"
      />
    );
  }

  const publicAdmin = createAdminClient("public");
  const smarttalkAdmin = createAdminClient();

  const { data: agent } = await smarttalkAdmin
    .from("agents")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (agent as { organization_id?: string } | null)?.organization_id;

  if (!client_id) {
    // Listado de clientes de la agencia para elegir a cual hacer onboarding.
    const { data: clients } = await publicAdmin
      .from("cm_clients")
      .select("id, name")
      .eq("smarttalk_organization_id", orgId ?? "")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: states } = await publicAdmin
      .from("cm_onboarding_state")
      .select("client_id, step, completed_at")
      .eq("organization_id", orgId ?? "");

    const stateByClient = new Map<
      string,
      { step: string; completed_at: string | null }
    >(
      (states ?? []).map((s) => [
        (s as { client_id: string }).client_id,
        {
          step: (s as { step: string }).step,
          completed_at: (s as { completed_at: string | null }).completed_at,
        },
      ]),
    );

    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-[#e6edf3]">
            Onboarding de clientes
          </h1>
          <p className="mt-1 text-sm text-[#7d8590]">
            Configura cada cliente en 6 pasos guiados. Puedes hacerlo tú o
            invitar al cliente via magic-link.
          </p>
        </div>

        {!clients || clients.length === 0 ? (
          <EmptyState
            title="Aún no tienes clientes"
            body="Primero crea un cliente desde la sección de Ajustes → Clientes."
            ctaLabel="Ir a Ajustes"
            ctaHref="/settings"
          />
        ) : (
          <div className="space-y-3">
            {clients.map((c) => {
              const s = stateByClient.get((c as { id: string }).id);
              return (
                <Link
                  key={(c as { id: string }).id}
                  href={`/onboarding?client_id=${(c as { id: string }).id}`}
                  className="flex items-center justify-between rounded-xl border border-[#2d333b] bg-[#0d1117] p-4 transition hover:border-[#3b82f6]/50 hover:bg-[#1a1f2e]"
                >
                  <div>
                    <p className="font-bold text-[#e6edf3]">
                      {(c as { name: string }).name}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7d8590]">
                      {s?.completed_at
                        ? "Completado"
                        : s
                          ? `En progreso · paso: ${s.step}`
                          : "Sin iniciar"}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#3b82f6]">
                    {s?.completed_at
                      ? "Ver"
                      : s
                        ? "Continuar"
                        : "Empezar →"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Vista de wizard para un cliente puntual.
  const { data: client } = await publicAdmin
    .from("cm_clients")
    .select("id, name, smarttalk_organization_id")
    .eq("id", client_id)
    .maybeSingle();

  if (!client) {
    return (
      <EmptyState
        title="Cliente no encontrado"
        body="El cliente no existe o no tienes acceso."
        ctaLabel="Volver"
        ctaHref="/onboarding"
      />
    );
  }
  if (
    orgId &&
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id &&
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id !==
      orgId
  ) {
    return (
      <EmptyState
        title="Sin acceso"
        body="Este cliente pertenece a otra organización."
        ctaLabel="Volver"
        ctaHref="/onboarding"
      />
    );
  }

  const { data: state } = await publicAdmin
    .from("cm_onboarding_state")
    .select("step, data, completed_steps, completed_at")
    .eq("client_id", client_id)
    .maybeSingle();

  const initialState = state
    ? {
        step: (state as { step: string }).step as
          | "welcome"
          | "brand"
          | "platforms"
          | "content_pillars"
          | "preferences"
          | "review"
          | "done",
        data: (state as { data: Record<string, unknown> }).data ?? {},
        completed_steps: Array.isArray(
          (state as { completed_steps?: unknown }).completed_steps,
        )
          ? ((state as { completed_steps: string[] }).completed_steps)
          : [],
        completed_at:
          (state as { completed_at: string | null }).completed_at ?? null,
      }
    : null;

  return (
    <div className="min-h-screen">
      <div className="border-b border-[#2d333b] bg-[#0d1117] px-4 py-3">
        <Link
          href="/onboarding"
          className="text-xs font-semibold text-[#7d8590] hover:text-[#e6edf3]"
        >
          ← Volver a clientes
        </Link>
      </div>
      <OnboardingWizard
        initialState={initialState}
        clientId={client_id}
        clientName={(client as { name: string }).name}
      />
    </div>
  );
}

function EmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="text-2xl font-black text-[#e6edf3]">{title}</h2>
      <p className="mt-2 text-sm text-[#7d8590]">{body}</p>
      <Link
        href={ctaHref}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3b82f6] px-5 py-2 text-sm font-bold text-white"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
