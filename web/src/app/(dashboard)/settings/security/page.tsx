"use client";
import { useState, useEffect } from "react";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Shield,
  Lock,
  Smartphone,
  Monitor,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import type { Organization } from "@/types/database";

export const dynamic = "force-dynamic";

export default function SecuritySettingsPage() {
  const { data: currentAgent } = useCurrentAgent();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // Verify token
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!currentAgent?.organization_id) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentAgent!.organization_id)
        .single();
      if (data) setOrg(data as Organization);
      setLoading(false);
    }
    load();
  }, [currentAgent?.organization_id]);

  async function handlePasswordChange() {
    setPwError("");
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError("Las contrasenas no coinciden");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("La contrasena debe tener al menos 8 caracteres");
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwError(error.message);
      } else {
        setPwSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setPwSaving(false);
    }
  }

  function handleCopyToken() {
    if (org?.webhook_verify_token) {
      navigator.clipboard.writeText(org.webhook_verify_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const maskedToken = org?.webhook_verify_token
    ? org.webhook_verify_token.slice(0, 4) + "****" + org.webhook_verify_token.slice(-4)
    : "••••••••";

  if (loading) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Seguridad</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Autenticacion, sesiones activas y seguridad del webhook</p>
        </div>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {/* Change Password */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#8b949e]" />
            Cambiar contrasena
          </h2>
          <div className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8b949e]">Contrasena actual</Label>
              <div className="relative">
                <Input
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-[#0d1117] border-[#2d333b] text-white h-9 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-white"
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8b949e]">Nueva contrasena</Label>
              <div className="relative">
                <Input
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[#0d1117] border-[#2d333b] text-white h-9 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-white"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8b949e]">Confirmar nueva contrasena</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] text-white h-9"
                placeholder="••••••••"
              />
            </div>
            {pwError && <p className="text-xs text-red-400">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-400">Contrasena actualizada correctamente</p>}
            <Button
              onClick={handlePasswordChange}
              disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {pwSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {pwSaving ? "Actualizando..." : "Actualizar contrasena"}
            </Button>
          </div>
        </div>

        {/* 2FA */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-4 w-4 text-[#8b949e]" />
              <div>
                <h2 className="text-sm font-semibold text-white">Autenticacion de dos factores</h2>
                <p className="text-xs text-[#8b949e] mt-0.5">
                  Agrega una capa adicional de seguridad a tu cuenta
                </p>
              </div>
            </div>
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
              Proximamente
            </Badge>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-[#8b949e]" />
            Sesiones activas
          </h2>
          <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <Monitor className="h-5 w-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Sesion actual</p>
              <p className="text-xs text-[#8b949e]">{currentAgent?.email} — Activa ahora</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              Activa
            </span>
          </div>
        </div>

        {/* Webhook Verify Token */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#8b949e]" />
            Seguridad del Webhook
          </h2>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#8b949e]">Verify Token</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={showToken ? org?.webhook_verify_token || "" : maskedToken}
                className="bg-[#0d1117] border-[#2d333b] text-white h-9 font-mono text-xs flex-1 cursor-default"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowToken(!showToken)}
                className="border-[#2d333b] text-[#8b949e] hover:text-white hover:bg-[#0d1117] h-9 px-3"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToken}
                className="border-[#2d333b] text-[#8b949e] hover:text-white hover:bg-[#0d1117] h-9 px-3"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-[#8b949e]">
              Este token se usa para verificar las solicitudes del webhook de WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
