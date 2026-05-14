import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutConfig } from "@/lib/epayco/client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("organization_id, email")
      .eq("id", user.id)
      .single();

    if (!agent) {
      return Response.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const { planId } = body;

    if (!planId) {
      return Response.json({ error: "Plan requerido" }, { status: 400 });
    }

    // Get plan details
    const { data: plan } = await supabase
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (!plan) {
      return Response.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    // Get org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", agent.organization_id)
      .single();

    const checkoutConfig = createCheckoutConfig({
      name: `Plan ${plan.name}`,
      description: `Suscripcion al plan ${plan.name} - ${org?.name || ""}`,
      amount: plan.price_monthly,
      email: agent.email,
      orgId: agent.organization_id,
      planId: plan.id,
    });

    return Response.json({
      checkoutConfig,
      publicKey: process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY,
      test: process.env.EPAYCO_TEST === "true",
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return Response.json({ error: "Error creando checkout" }, { status: 500 });
  }
}
