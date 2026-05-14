"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getInvitation, acceptInvitation } from "./actions";
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
    orgName: string;
    organizationId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getInvitation(token);
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
    const result = await acceptInvitation(token, formData);
    if (result?.error) {
      setError(result.error);
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
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md text-center">
            {error || "Invitacion no valida"}
          </div>
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
        <div className="mb-4 p-3 bg-blue-50 rounded-md text-sm text-center">
          <p>
            Has sido invitado a <strong>{invitation.orgName}</strong> como{" "}
            <strong>{roleLabels[invitation.role] || invitation.role}</strong>
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando cuenta..." : "Aceptar invitación"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
