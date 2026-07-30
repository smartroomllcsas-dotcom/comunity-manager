import { redirect } from "next/navigation";
import { getPublicPlanByCode, getPublicPlans } from "@/lib/billing/public-plans";
import { RegistrationForm } from "@/components/billing/RegistrationForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: requestedPlan } = await searchParams;
  const fallbackPlan = (await getPublicPlans())[0];
  const plan = requestedPlan
    ? await getPublicPlanByCode(requestedPlan)
    : fallbackPlan;

  if (!plan) {
    redirect("/#planes");
  }

  return <RegistrationForm plan={plan} />;
}
