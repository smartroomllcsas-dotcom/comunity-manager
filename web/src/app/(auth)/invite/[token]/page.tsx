"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { invitationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<{
    id: string;
    email: string;
    role: string;
    memberType: string;
    brandIds: string[];
    orgName: string;
    organizationId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await invitationAction("get", token);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setInvitation(result.data);
      }
      setPageLoading(false);
    }
    load();
  }, [token]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = await invitationAction("accept", token, formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result && "success" in result && result.success) {
        setAccepted(true);
        window.location.assign(result.redirectTo || "/inbox");
        return;
      }
      setError("No se pudo completar la invitación. Intenta de nuevo.");
      setLoading(false);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Cargando invitacion...</p>
        </CardContent>
      </Card>
    );
  }

  if (!invitation) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm p-3 rounded-md text-center">
            {error || "Invitacion no valida"}
          </div>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            ¿Ya aceptaste esta invitación?{" "}
            <a href="/login" className="text-blue-400 hover:text-blue-300 underline">
              Inicia sesión aquí
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    supervisor: "Supervisor",
    agent: "Agente",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-center">Aceptar Invitacion</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-blue-500/15 border border-blue-500/30 text-blue-200 rounded-md text-sm text-center">
          <p>
            Has sido invitado a <strong>{invitation.orgName}</strong> como{" "}
            <strong>
              {invitation.memberType === "brand_advisor"
                ? "Asesor de marca"
                : roleLabels[invitation.role] || invitation.role}
            </strong>
          </p>
        </div>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={invitation.email} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Tu nombre</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required minLength={6} />
          </div>
          {accepted && (
            <div className="bg-green-500/15 border border-green-500/30 text-green-300 text-sm p-3 rounded-md text-center">
              Cuenta creada ✓ Entrando...
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading || accepted}>
            {accepted
              ? "Cuenta creada ✓"
              : loading
              ? "Creando cuenta..."
              : "Aceptar invitación"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
