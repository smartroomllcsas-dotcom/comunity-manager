"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, ShieldCheck } from "lucide-react";
import { register } from "@/lib/auth";
import type { PublicPlan } from "@/lib/billing/public-plans";
import { isGlobalAdminEmail } from "@/lib/platform-admin";

export function RegistrationForm({ plan }: { plan: PublicPlan }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [emailValue, setEmailValue] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("passwordConfirmation") || "");
    const email = String(form.get("email") || "");
    const isGlobalAdmin = isGlobalAdminEmail(email);

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    try {
      const result = await register({
        organizationName: String(form.get("organizationName") || ""),
        name: String(form.get("name") || ""),
        email,
        billingPhone: String(form.get("billingPhone") || ""),
        billingCountryCode: "CO",
        password,
        selectedPlanCode: plan.code,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(isGlobalAdmin ? "/admin" : `/checkout?plan=${encodeURIComponent(plan.code)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/#planes" className="inline-flex items-center gap-2 text-sm text-[#9be2d8] hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Cambiar plan
        </Link>
        <span className="text-xs text-white/45">Paso 1 de 2</span>
      </div>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#111a19] shadow-2xl shadow-black/30">
        <div className="border-b border-white/10 bg-[#063c39] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9be2d8]">Plan seleccionado</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h1 className="text-2xl font-black text-white">{plan.name}</h1>
            <p className="font-bold text-[#f7c65f]">
              ${(plan.amountMinor / 100).toLocaleString("es-CO")} <span className="text-xs font-normal">COP/mes</span>
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label htmlFor="organizationName" className="mb-1.5 block text-xs font-semibold text-white/70">Nombre de la agencia o empresa</label>
            <input id="organizationName" name="organizationName" required minLength={2} maxLength={120} autoComplete="organization" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" placeholder="Ej. Agencia Norte" />
          </div>
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-semibold text-white/70">Nombre del administrador</label>
            <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" placeholder="Nombre completo" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-white/70">Correo de facturación y acceso</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" value={emailValue} onChange={(event) => setEmailValue(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" placeholder="admin@agencia.com" />
          </div>
          {isGlobalAdminEmail(emailValue) && (
            <p className="rounded-xl border border-[#55c6b6]/25 bg-[#55c6b6]/10 px-3 py-2 text-xs leading-5 text-[#b9f0e8]">
              Este correo se activa sin pago y tendrá acceso administrativo global.
            </p>
          )}
          <div>
            <label htmlFor="billingPhone" className="mb-1.5 block text-xs font-semibold text-white/70">Teléfono o WhatsApp</label>
            <input id="billingPhone" name="billingPhone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" placeholder="+57 300 000 0000" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-white/70">Contraseña</label>
              <input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" />
            </div>
            <div>
              <label htmlFor="passwordConfirmation" className="mb-1.5 block text-xs font-semibold text-white/70">Confirmar</label>
              <input id="passwordConfirmation" name="passwordConfirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#55c6b6]" />
            </div>
          </div>
          <label className="flex items-start gap-3 text-xs leading-5 text-white/55">
            <input type="checkbox" required className="mt-1 accent-[#55c6b6]" />
            <span>Acepto los <Link href="/terms" className="text-[#9be2d8] underline">términos</Link> y la <Link href="/privacy-policy" className="text-[#9be2d8] underline">política de privacidad</Link>.</span>
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#f7c65f] px-5 py-3 font-bold text-[#3b2b08] hover:bg-[#ffda85] disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {pending ? "Creando agencia..." : isGlobalAdminEmail(emailValue) ? "Crear acceso administrativo" : "Continuar al pago"}
          </button>
          <div className="flex items-center justify-center gap-2 text-xs text-white/45">
            <ShieldCheck className="h-4 w-4 text-[#55c6b6]" />
            Los clientes comerciales activan su plan después de confirmar el pago.
          </div>
          <p className="text-center text-xs text-white/45">¿Ya tienes cuenta? <Link href={`/login`} className="text-[#9be2d8] hover:text-white">Inicia sesión</Link></p>
        </form>
      </div>
    </div>
  );
}
