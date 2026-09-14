/**
 * Identidad de una página del panel, sirva la sesión que sirva.
 *
 * La plataforma tiene DOS logins vivos: el de Supabase Auth y el propio
 * (`/api/auth/local`, cookie `cm_user_id`). El middleware ya contempla los dos,
 * pero varias páginas comprobaban sólo el de Supabase y hacían
 * `redirect("/login")` por su cuenta: a quien entra por el login propio lo
 * expulsaban al abrirlas, y parecía que se le había cerrado la sesión.
 * Le pasaba a Escucha social, al Composer, a AI Tools y a Reportes CM.
 *
 * Esta es la comprobación que deben usar todas: Supabase primero, y si no hay
 * sesión ahí, la propia. Devuelve null sólo cuando de verdad no hay nadie.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type PageIdentity = { userId: string; orgId: string };

export async function resolvePageIdentity(): Promise<PageIdentity | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: agent } = await createAdminClient("smarttalk")
        .from("agents")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (agent?.organization_id) {
        return { userId: user.id, orgId: agent.organization_id as string };
      }
    }
  } catch {
    // sin sesión de Supabase: se sigue con la propia
  }
  try {
    // `identify()` devuelve como orgId el id de la primera marca (cm_clients),
    // no la organización de SmartTalk; hay que traducirlo.
    const { identify } = await import("@/lib/identify");
    const ent = await identify();
    if (!ent.userId || !ent.orgId) return null;
    const { data: brand } = await createAdminClient("public")
      .from("cm_clients")
      .select("smarttalk_organization_id")
      .eq("id", ent.orgId)
      .maybeSingle();
    return {
      userId: ent.userId,
      orgId: (brand?.smarttalk_organization_id as string | null) || ent.orgId,
    };
  } catch {
    return null;
  }
}
