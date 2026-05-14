"use client";
import { useState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SmarttalkLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] px-4">
      <div className="w-full max-w-md">
        <Card className="bg-[#1a1f2e] border-[#2d333b]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-xl bg-[#3b82f6] text-white font-bold text-lg">
              ST
            </div>
            <CardTitle className="text-xl text-[#e6edf3]">Inbox multicanal</CardTitle>
            <p className="text-sm text-[#7d8590]">WhatsApp, Respond.io y mas (SmartTalk)</p>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-[#f85149]/10 text-[#f85149] text-sm p-3 rounded-lg border border-[#f85149]/20">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#e6edf3]">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="bg-[#0d1117] border-[#2d333b] text-[#e6edf3] placeholder:text-[#7d8590] focus-visible:border-[#3b82f6] focus-visible:ring-[#3b82f6]/25"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#e6edf3]">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="bg-[#0d1117] border-[#2d333b] text-[#e6edf3] placeholder:text-[#7d8590] focus-visible:border-[#3b82f6] focus-visible:ring-[#3b82f6]/25"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white"
                disabled={loading}
              >
                {loading ? "Ingresando..." : "Ingresar al inbox"}
              </Button>
              <p className="text-sm text-center text-[#7d8590]">
                ¿No tienes cuenta de inbox?{" "}
                <Link href="/register" className="text-[#3b82f6] hover:text-[#58a6ff] hover:underline">
                  Registrate
                </Link>
              </p>
              <p className="text-xs text-center text-[#7d8590]">
                <Link href="/login" className="text-violet-400 hover:underline">
                  Volver al login de Comunity Agent
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
