import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateEpaycoSignature, mapEpaycoStatus } from "@/lib/epayco/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const params: Record<string, string> = {};
    body.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validate ePayco signature
    const isValid = validateEpaycoSignature({
      x_cust_id_cliente: params.x_cust_id_cliente || "",
      x_ref_payco: params.x_ref_payco || "",
      x_transaction_id: params.x_transaction_id || "",
      x_amount: params.x_amount || "",
      x_currency_code: params.x_currency_code || "",
      x_signature: params.x_signature || "",
    });

    if (!isValid) {
      return Response.json({ error: "Firma invalida" }, { status: 400 });
    }

    const paymentStatus = mapEpaycoStatus(params.x_cod_response || "3");
    const orgId = params.x_extra1;
    const planId = params.x_extra2;
    const amount = parseFloat(params.x_amount || "0");

    if (!orgId) {
      return Response.json({ error: "Organizacion no encontrada" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Create payment record
    const { data: payment } = await supabase.from("payments").insert({
      organization_id: orgId,
      epayco_ref: params.x_ref_payco || null,
      amount,
      currency: params.x_currency_code || "COP",
      status: paymentStatus,
      payment_method: params.x_franchise || params.x_bank_name || null,
      description: `Pago plan - ${params.x_description || ""}`,
      epayco_response: params,
    }).select().single();

    if (paymentStatus === "approved") {
      // Find or create subscription for this org
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("organization_id", orgId)
        .single();

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      if (existingSub) {
        await supabase
          .from("subscriptions")
          .update({
            plan_id: planId || undefined,
            status: "active",
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            last_payment_at: now.toISOString(),
            last_payment_amount: amount,
            payment_method: params.x_franchise || null,
            epayco_customer_id: params.x_cust_id_cliente || null,
          })
          .eq("id", existingSub.id);

        // Link payment to subscription
        if (payment) {
          await supabase
            .from("payments")
            .update({ subscription_id: existingSub.id })
            .eq("id", payment.id);
        }
      } else {
        const { data: newSub } = await supabase
          .from("subscriptions")
          .insert({
            organization_id: orgId,
            plan_id: planId,
            status: "active",
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            last_payment_at: now.toISOString(),
            last_payment_amount: amount,
            payment_method: params.x_franchise || null,
            epayco_customer_id: params.x_cust_id_cliente || null,
          })
          .select()
          .single();

        if (payment && newSub) {
          await supabase
            .from("payments")
            .update({ subscription_id: newSub.id })
            .eq("id", payment.id);
        }
      }

      // Activate organization and update plan
      await supabase
        .from("organizations")
        .update({ is_active: true, plan_id: planId || undefined })
        .eq("id", orgId);
    } else if (paymentStatus === "rejected" || paymentStatus === "failed") {
      // Mark subscription as past_due if it exists
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("organization_id", orgId)
        .neq("status", "cancelled");
    }

    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("ePayco confirmation error:", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

// ePayco can also send GET for confirmation
export async function GET(request: NextRequest) {
  return POST(request);
}
