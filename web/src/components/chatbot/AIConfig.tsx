"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2 } from "lucide-react";
import type { AIConfig as AIConfigType } from "@/types/database";

type AIConfigQueryResponse = {
  data: AIConfigType | null;
};

export function AIConfig() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  const [config, setConfig] = useState<Partial<AIConfigType>>({
    provider: "openai", model: "gpt-4o-mini",
    system_prompt: "Eres un asistente virtual amable y profesional. Responde de forma concisa y util.",
    knowledge_base: [], escalation_rules: { keywords: ["hablar con humano", "agente", "queja"], max_turns: 5 },
    max_turns: 5, is_active: false,
  });
  const [saving, setSaving] = useState(false);
  const [newKB, setNewKB] = useState("");

  useEffect(() => {
    if (!agent) return;
    supabase
      .from("ai_config")
      .select("*")
      .eq("organization_id", agent.organization_id)
      .single()
      .then(({ data }: AIConfigQueryResponse) => {
        if (data) setConfig(data);
      });
  }, [agent, supabase]);

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const data = { organization_id: agent.organization_id, provider: config.provider, model: config.model, system_prompt: config.system_prompt, knowledge_base: config.knowledge_base, escalation_rules: config.escalation_rules, max_turns: config.max_turns, is_active: config.is_active };
      if (config.id) { await supabase.from("ai_config").update(data).eq("id", config.id); }
      else { await supabase.from("ai_config").insert(data); }
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3 p-4 bg-[#1a1f2e] border border-[#2d333b] rounded-lg">
        <Switch checked={config.is_active || false} onCheckedChange={(is_active) => setConfig({ ...config, is_active })} />
        <Label className="font-semibold text-white">Agente IA activo</Label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Proveedor</Label>
          <Select value={config.provider} onValueChange={(provider) => setConfig({ ...config, provider: provider as "openai" | "anthropic" })}>
            <SelectTrigger className="bg-[#0d1117] border-[#2d333b] text-white h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#1a1f2e] border-[#2d333b]"><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Modelo</Label>
          <Input value={config.model || ""} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="bg-[#0d1117] border-[#2d333b] text-white h-9" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-[#8b949e]">Prompt del sistema</Label>
        <Textarea value={config.system_prompt || ""} onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })} rows={5} className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none" />
      </div>
      <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Base de conocimiento</h3>
        <div className="space-y-2 mb-3">
          {(config.knowledge_base || []).map((kb, i) => (
            <div key={i} className="flex gap-2 items-start">
              <p className="flex-1 text-sm bg-[#0d1117] border border-[#2d333b] p-2.5 rounded-md text-[#8b949e]">{kb}</p>
              <Button variant="ghost" size="sm" className="text-[#8b949e] hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0 shrink-0" onClick={() => setConfig({ ...config, knowledge_base: (config.knowledge_base || []).filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea value={newKB} onChange={(e) => setNewKB(e.target.value)} placeholder="Agrega información que la IA debe conocer..." rows={2} className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none" />
          <Button variant="outline" onClick={() => { if (newKB.trim()) { setConfig({ ...config, knowledge_base: [...(config.knowledge_base || []), newKB.trim()] }); setNewKB(""); } }} className="shrink-0 bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Max turnos de IA antes de escalar</Label>
          <Input type="number" value={config.max_turns || 5} onChange={(e) => setConfig({ ...config, max_turns: parseInt(e.target.value) || 5 })} className="w-24 bg-[#0d1117] border-[#2d333b] text-white h-9" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Keywords de escalacion (separadas por coma)</Label>
          <Input value={(config.escalation_rules?.keywords || []).join(", ")} onChange={(e) => setConfig({ ...config, escalation_rules: { ...(config.escalation_rules || { max_turns: 5 }), keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) } })} className="bg-[#0d1117] border-[#2d333b] text-white h-9" />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="h-4 w-4 mr-1.5" /> {saving ? "Guardando..." : "Guardar configuracion"}</Button>
    </div>
  );
}
