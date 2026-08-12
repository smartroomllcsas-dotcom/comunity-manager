"use client";
/**
 * /settings/profile — datos de la persona que ha iniciado sesión.
 *
 * Lee y escribe a través de `/api/profile`, no directamente contra Supabase,
 * porque el perfil vive repartido en tres tablas y dos esquemas: dejar esa
 * costura en el cliente obligaría a exponerle el `service_role`.
 *
 * Tras guardar se invalida `["current-agent"]` para que el nombre nuevo aparezca
 * de inmediato en el avatar de la barra lateral, que lee de esa misma consulta.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  CircleCheck,
  Loader2,
  Lock,
  Save,
  User,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Profile {
  name: string | null;
  email: string | null;
  billingPhone: string | null;
  organizationName: string | null;
  role: string | null;
  status: string | null;
  createdAt: string | null;
  emailEditable: boolean;
}

const STATUS_LABELS: Record<string, { label: string; dot: string; text: string }> = {
  online: { label: "En línea", dot: "bg-emerald-500", text: "text-emerald-400" },
  available: { label: "Disponible", dot: "bg-emerald-500", text: "text-emerald-400" },
  busy: { label: "Ocupado", dot: "bg-amber-500", text: "text-amber-400" },
  away: { label: "Ausente", dot: "bg-amber-500", text: "text-amber-400" },
  offline: { label: "Desconectado", dot: "bg-[#484f58]", text: "text-[#8b949e]" },
};

function formatDate(value: string | null) {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

function initialsOf(name: string) {
  const clean = name.trim();
  if (!clean) return "YO";
  return clean
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileSettingsPage() {
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  function hydrate(next: Profile) {
    setProfile(next);
    setName(next.name || "");
    setBillingPhone(next.billingPhone || "");
    setOrganizationName(next.organizationName || "");
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error || "No fue posible cargar tu perfil.");
          return;
        }
        hydrate(payload.profile as Profile);
      } catch {
        if (!cancelled) setError("No fue posible contactar el servidor.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, billingPhone, organizationName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "No fue posible guardar los cambios.");
        return;
      }
      if (payload.profile) hydrate(payload.profile as Profile);
      // El avatar de la barra lateral lee de esta consulta: sin invalidarla
      // seguiría mostrando el nombre anterior hasta la próxima recarga.
      await queryClient.invalidateQueries({ queryKey: ["current-agent"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("No fue posible contactar el servidor.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]" data-testid="profile-loading">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando tu perfil...</span>
        </div>
      </div>
    );
  }

  // Sin perfil y con error, la página no puede quedarse en blanco: se explica
  // qué pasó y se ofrece una salida.
  if (!profile) {
    return (
      <div className="min-h-full bg-[#0d1117] p-6">
        <div
          data-testid="profile-error"
          className="max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 p-5"
        >
          <div className="flex items-center gap-2 text-red-300">
            <AlertCircle className="h-5 w-5" />
            <h1 className="text-sm font-semibold">No fue posible cargar tu perfil</h1>
          </div>
          <p className="mt-2 text-xs text-[#8b949e]">
            {error || "Vuelve a intentarlo en unos segundos."}
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-flex text-xs font-medium text-[#58a6ff] hover:text-[#79c0ff]"
          >
            Volver a Configuración
          </Link>
        </div>
      </div>
    );
  }

  const status = STATUS_LABELS[profile.status || "offline"] || {
    label: profile.status || "Desconocido",
    dot: "bg-[#484f58]",
    text: "text-[#8b949e]",
  };

  return (
    <div className="min-h-full bg-[#0d1117]" data-testid="profile-page">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors" aria-label="Volver a Configuración">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Mi perfil</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">
            Tus datos personales, tu agencia y el estado de tu cuenta
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          data-testid="profile-save"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
        </Button>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {error && (
          <div
            data-testid="profile-save-error"
            className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
          >
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {saved && !error && (
          <div
            data-testid="profile-saved"
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3"
          >
            <CircleCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">Tus cambios se guardaron correctamente.</p>
          </div>
        )}

        {/* Identidad */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-[#8b949e]" />
            Identidad
          </h2>
          <div className="flex items-start gap-5">
            <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {initialsOf(name)}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name" className="text-xs text-[#8b949e]">
                  Nombre completo
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tu nombre y apellido"
                  className="bg-[#0d1117] border-[#2d333b] text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email" className="text-xs text-[#8b949e]">
                  Correo de acceso y facturación
                </Label>
                <div className="relative">
                  <Input
                    id="profile-email"
                    value={profile.email || ""}
                    readOnly
                    disabled
                    data-testid="profile-email"
                    aria-describedby="profile-email-help"
                    className="bg-[#0d1117] border-[#2d333b] text-[#8b949e] pr-9"
                  />
                  <Lock className="h-3.5 w-3.5 text-[#484f58] absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                {/* El correo identifica la sesión en Supabase Auth y enlaza con
                    el usuario legacy. Cambiarlo aquí sin confirmar dejaría la
                    cuenta inaccesible, así que es de sólo lectura. */}
                <p id="profile-email-help" className="text-[11px] text-[#8b949e]">
                  El correo no se edita desde aquí: cambiarlo requiere confirmación por correo
                  electrónico. Escríbenos si necesitas actualizarlo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-phone" className="text-xs text-[#8b949e]">
                  Teléfono / WhatsApp
                </Label>
                <Input
                  id="profile-phone"
                  value={billingPhone}
                  maxLength={32}
                  onChange={(event) => setBillingPhone(event.target.value)}
                  placeholder="+57 300 000 0000"
                  inputMode="tel"
                  className="bg-[#0d1117] border-[#2d333b] text-white"
                />
                <p className="text-[11px] text-[#8b949e]">
                  Lo usamos para avisos de facturación y soporte.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Agencia */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#8b949e]" />
            Agencia
          </h2>
          <div className="space-y-2">
            <Label htmlFor="profile-organization" className="text-xs text-[#8b949e]">
              Nombre de la agencia o empresa
            </Label>
            <Input
              id="profile-organization"
              value={organizationName}
              maxLength={120}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Nombre comercial"
              className="bg-[#0d1117] border-[#2d333b] text-white"
            />
            <p className="text-[11px] text-[#8b949e]">
              Es el nombre que ve tu equipo y el que aparece en la facturación.
            </p>
          </div>
        </div>

        {/* Cuenta — sólo lectura */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Cuenta</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-[#8b949e]">Rol</dt>
              <dd data-testid="profile-role" className="mt-1 text-sm text-white">
                {profile.role || "Sin rol asignado"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#8b949e]">Estado de conexión</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm">
                <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
                <span data-testid="profile-status" className={status.text}>
                  {status.label}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#8b949e]">Miembro desde</dt>
              <dd data-testid="profile-created-at" className="mt-1 text-sm text-white">
                {formatDate(profile.createdAt)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] text-[#8b949e]">
            El rol y el estado los administra tu agencia; no se editan desde el perfil.
          </p>
        </div>
      </div>
    </div>
  );
}
