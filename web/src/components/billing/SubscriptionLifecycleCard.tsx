"use client";

import { useState } from "react";
import { AlertTriangle, CalendarX, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SUBSCRIPTION_ACTION_LABELS,
  derivePendingPlanChange,
  deriveSubscriptionUi,
  type SubscriptionUiInput,
} from "@/lib/billing/subscription-ui";

const TONE_STYLES = {
  info: "border-blue-500/40 bg-blue-500/10 text-blue-100",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  danger: "border-red-500/40 bg-red-500/10 text-red-100",
} as const;

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Gestión de la suscripción para el cliente.
 *
 * Cancelar y "mantener" llaman a los endpoints autenticados. Renovar y
 * reactivar NO cambian estado: hacen scroll al bloque de planes, donde el pago
 * es la única vía de activación.
 */
export function SubscriptionLifecycleCard({
  subscription,
  isAdmin,
  pendingPlanName,
  onChanged,
  onRequestPayment,
}: {
  subscription: SubscriptionUiInput | null;
  isAdmin: boolean;
  /** Nombre del plan al que se bajará, para nombrarlo en el aviso (D-5). */
  pendingPlanName?: string | null;
  onChanged: () => void;
  onRequestPayment: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<"cancel" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = deriveSubscriptionUi(subscription, { isAdmin });
  const accessEndsLabel = formatDate(model.accessEndsAt);
  const pendingChange = derivePendingPlanChange(subscription, { planName: pendingPlanName });

  async function submit(action: "cancel" | "resume") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/billing/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo completar la solicitud");
      }
      setConfirmOpen(false);
      onChanged();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo completar la solicitud",
      );
    } finally {
      setPending(null);
    }
  }

  const hasNotice = Boolean(model.noticeText);

  return (
    <div
      className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5"
      data-testid="subscription-lifecycle"
      data-state={model.state}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#8b949e]" />
            Estado de tu suscripción
          </h2>
          <p className="mt-1 text-sm text-white font-medium">{model.statusLabel}</p>
          {accessEndsLabel && (
            <p className="mt-0.5 text-xs text-[#8b949e]">
              {model.state === "scheduled_cancellation"
                ? `Finaliza el ${accessEndsLabel}`
                : model.state === "grace"
                  ? `Fecha límite: ${accessEndsLabel}`
                  : `Acceso hasta el ${accessEndsLabel}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {model.actions.includes("cancel") && (
            <Button
              variant="outline"
              size="sm"
              className="border-[#2d333b] text-white hover:bg-[#0d1117]"
              onClick={() => setConfirmOpen(true)}
            >
              <CalendarX className="mr-1.5 h-3.5 w-3.5" />
              {SUBSCRIPTION_ACTION_LABELS.cancel}
            </Button>
          )}
          {model.actions.includes("resume") && (
            <Button
              size="sm"
              disabled={pending === "resume"}
              onClick={() => submit("resume")}
            >
              {pending === "resume" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {SUBSCRIPTION_ACTION_LABELS.resume}
            </Button>
          )}
          {(model.actions.includes("renew") || model.actions.includes("reactivate")) && (
            <Button size="sm" onClick={onRequestPayment}>
              {model.actions.includes("reactivate")
                ? SUBSCRIPTION_ACTION_LABELS.reactivate
                : SUBSCRIPTION_ACTION_LABELS.renew}
            </Button>
          )}
        </div>
      </div>

      {hasNotice && (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-xs ${
            TONE_STYLES[model.noticeTone || "info"]
          }`}
          role="status"
        >
          {model.noticeText}
        </p>
      )}

      {/* D-5 · Downgrade diferido: el cliente conserva su plan hasta la fecha. */}
      {pendingChange && (
        <p
          className="mt-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-100"
          role="status"
          data-testid="pending-plan-change"
        >
          {pendingChange.notice}
        </p>
      )}

      {model.requiresPayment && isAdmin && (
        <p className="mt-2 text-[11px] text-[#8b949e]">
          La reactivación se completa únicamente cuando la pasarela confirma el
          pago.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
        >
          <div className="w-full max-w-md rounded-lg border border-[#2d333b] bg-[#161b22] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h3 id="cancel-subscription-title" className="text-base font-semibold text-white">
                  ¿Cancelar al final del periodo?
                </h3>
                <p className="mt-2 text-sm text-[#8b949e]">
                  {accessEndsLabel
                    ? `Conservas el plan y todos tus datos hasta el ${accessEndsLabel}. Ese día la suscripción pasa a cancelada.`
                    : "Conservas el plan hasta que termine el período facturado. Ese día la suscripción pasa a cancelada."}
                </p>
                <p className="mt-2 text-xs text-[#8b949e]">
                  Puedes deshacerlo en cualquier momento antes de esa fecha con
                  «{SUBSCRIPTION_ACTION_LABELS.resume}».
                </p>
              </div>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-[#2d333b] text-white hover:bg-[#0d1117]"
                disabled={pending === "cancel"}
                onClick={() => {
                  setConfirmOpen(false);
                  setError(null);
                }}
              >
                Volver
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending === "cancel"}
                onClick={() => submit("cancel")}
              >
                {pending === "cancel" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Confirmar cancelación
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
