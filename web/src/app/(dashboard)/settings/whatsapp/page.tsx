"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, ArrowLeft, MessageSquare } from "lucide-react";
import Link from "next/link";

type WhatsAppOrganizationRow = {
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  access_token: string | null;
};

const MASKED_TOKEN_PLACEHOLDER = "••••••••";

function maskToken(token: string | null): string {
  if (!token) return "";
  if (token.length <= 4) return MASKED_TOKEN_PLACEHOLDER;
  return MASKED_TOKEN_PLACEHOLDER + token.slice(-4);
}

export const dynamic = "force-dynamic";

export default function WhatsAppSettingsPage() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const tokenWasModified = useRef(false);

  useEffect(() => {
    if (!agent) return;
    supabase.from("organizations").select("whatsapp_phone_number_id, whatsapp_business_account_id, access_token").eq("id", agent.organization_id).single().then(({ data }: { data: WhatsAppOrganizationRow | null }) => {
      if (data) {
        setPhoneNumberId(data.whatsapp_phone_number_id || "");
        setWabaId(data.whatsapp_business_account_id || "");
        setAccessToken(maskToken(data.access_token));
        tokenWasModified.current = false;
      }
    });
  }, [agent, supabase]);

  function handleTokenChange(value: string) {
    setAccessToken(value);
    tokenWasModified.current = true;
  }

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    const updates: Record<string, string> = { whatsapp_phone_number_id: phoneNumberId, whatsapp_business_account_id: wabaId };
    if (tokenWasModified.current) {
      updates.access_token = accessToken;
    }
    await supabase.from("organizations").update(updates).eq("id", agent.organization_id);
    if (tokenWasModified.current) {
      setAccessToken(maskToken(accessToken));
      tokenWasModified.current = false;
    }
    setSaving(false);
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Configuración WhatsApp</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Conecta tu cuenta de WhatsApp Business Platform</p>
        </div>
      </div>

      <div className="p-6 max-w-xl">
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#2d333b]">
            <div className="h-10 w-10 rounded-lg bg-green-600/20 border border-green-500/30 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Credenciales de Meta</h2>
              <p className="text-xs text-[#8b949e]">Configura las credenciales de tu WhatsApp Business API</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Phone Number ID</Label>
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="bg-[#0d1117] border-[#2d333b] text-white h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Business Account ID (WABA ID)</Label>
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="bg-[#0d1117] border-[#2d333b] text-white h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Access Token</Label>
              <Input type="password" value={accessToken} onChange={(e) => handleTokenChange(e.target.value)} onFocus={() => { if (!tokenWasModified.current) { setAccessToken(""); tokenWasModified.current = true; } }} placeholder="Enter new token" className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9" />
              <p className="text-xs text-[#8b949e]">Los tokens se almacenan de forma segura. Solo se muestran los últimos 4 caracteres.</p>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="h-4 w-4 mr-1.5" /> {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
