"use client";
import { useState, useEffect } from "react";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Globe,
  Key,
  Webhook,
  Copy,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { Organization } from "@/types/database";

export const dynamic = "force-dynamic";

export default function ApiSettingsPage() {
  const { data: currentAgent } = useCurrentAgent();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Integration status
  const [integrations, setIntegrations] = useState<{
    openai: boolean;
    anthropic: boolean;
  }>({ openai: false, anthropic: false });

  useEffect(() => {
    if (!currentAgent?.organization_id) return;
    async function load() {
      setLoading(true);
      const orgId = currentAgent!.organization_id;

      const [orgRes, aiRes] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", orgId).single(),
        supabase.from("ai_configs").select("provider, is_active").eq("organization_id", orgId),
      ]);

      if (orgRes.data) setOrg(orgRes.data as Organization);
      if (aiRes.data) {
        setIntegrations({
          openai: aiRes.data.some((c) => c.provider === "openai" && c.is_active),
          anthropic: aiRes.data.some((c) => c.provider === "anthropic" && c.is_active),
        });
      }
      setLoading(false);
    }
    load();
  }, [currentAgent?.organization_id]);

  function handleCopy(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const maskedToken = org?.webhook_verify_token
    ? org.webhook_verify_token.slice(0, 4) + "****" + org.webhook_verify_token.slice(-4)
    : "••••••••";

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/whatsapp`
      : "/api/webhooks/whatsapp";

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
          <h1 className="text-xl font-bold text-white">API e Integraciones</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Claves API, webhooks y conectores de terceros</p>
        </div>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {/* API Keys */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-[#8b949e]" />
              <div>
                <h2 className="text-sm font-semibold text-white">Claves API</h2>
                <p className="text-xs text-[#8b949e] mt-0.5">
                  Genera claves para acceder a la API de tu organizacion
                </p>
              </div>
            </div>
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
              Proximamente
            </Badge>
          </div>
        </div>

        {/* Webhook Configuration */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Webhook className="h-4 w-4 text-[#8b949e]" />
            Configuracion del Webhook
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#8b949e]">Webhook URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-[#0d1117] border-[#2d333b] text-white h-9 font-mono text-xs flex-1 cursor-default"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(webhookUrl, "url")}
                  className="border-[#2d333b] text-[#8b949e] hover:text-white hover:bg-[#0d1117] h-9 px-3"
                >
                  {copiedField === "url" ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

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
                  onClick={() => handleCopy(org?.webhook_verify_token || "", "token")}
                  className="border-[#2d333b] text-[#8b949e] hover:text-white hover:bg-[#0d1117] h-9 px-3"
                >
                  {copiedField === "token" ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#8b949e]">Eventos suscritos</Label>
              <div className="flex flex-wrap gap-2">
                {["messages", "message_status", "message_template_status_update"].map((event) => (
                  <span
                    key={event}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-mono rounded-md bg-[#0d1117] border border-[#2d333b] text-[#8b949e]"
                  >
                    {event}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Integration Status */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#8b949e]" />
            Estado de Integraciones
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* OpenAI */}
            <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-4 flex items-center gap-4">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  integrations.openai
                    ? "bg-green-500/20 border border-green-500/30"
                    : "bg-[#2d333b]/50 border border-[#2d333b]"
                }`}
              >
                <span className="text-lg font-bold text-white">AI</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">OpenAI</p>
                <p className="text-xs text-[#8b949e]">GPT-4, GPT-3.5</p>
              </div>
              {integrations.openai ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-[#8b949e]" />
              )}
            </div>

            {/* Anthropic */}
            <div className="bg-[#0d1117] border border-[#2d333b] rounded-lg p-4 flex items-center gap-4">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  integrations.anthropic
                    ? "bg-green-500/20 border border-green-500/30"
                    : "bg-[#2d333b]/50 border border-[#2d333b]"
                }`}
              >
                <span className="text-lg font-bold text-white">A</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Anthropic</p>
                <p className="text-xs text-[#8b949e]">Claude 3, Claude 3.5</p>
              </div>
              {integrations.anthropic ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-[#8b949e]" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
