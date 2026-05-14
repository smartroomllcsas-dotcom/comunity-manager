"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ChatbotFlow, ChatbotFlowNode } from "@/types/database";
import { FlowNode } from "./FlowNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Save } from "lucide-react";

interface FlowEditorProps { flow?: ChatbotFlow; }

export function FlowEditor({ flow }: FlowEditorProps) {
  const [name, setName] = useState(flow?.name || "");
  const [triggerType, setTriggerType] = useState(flow?.trigger_type || "keyword");
  const [triggerValue, setTriggerValue] = useState(flow?.trigger_value || "");
  const [isActive, setIsActive] = useState(flow?.is_active || false);
  const [nodes, setNodes] = useState<ChatbotFlowNode[]>(flow?.flow_data.nodes || []);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function addNode() {
    const id = String(nodes.length + 1);
    setNodes([...nodes, { id, type: "message", content: "" }]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = { name, trigger_type: triggerType, trigger_value: triggerValue, is_active: isActive, flow_data: { nodes } };
      if (flow) {
        await supabase.from("chatbot_flows").update(data).eq("id", flow.id);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: agent } = await supabase.from("agents").select("organization_id").eq("id", user.id).single();
        if (!agent) return;
        await supabase.from("chatbot_flows").insert({ ...data, organization_id: agent.organization_id });
      }
      router.push("/chatbot");
    } finally { setSaving(false); }
  }

  const allNodeIds = nodes.map((n) => n.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label className="text-[#8b949e]">Nombre del flujo</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#0d1117] border-[#2d333b] text-white" /></div>
        <div className="space-y-2"><Label className="text-[#8b949e]">Tipo de trigger</Label>
          <Select value={triggerType} onValueChange={(v) => setTriggerType(v as ChatbotFlow["trigger_type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keyword</SelectItem>
              <SelectItem value="first_message">Primer mensaje</SelectItem>
              <SelectItem value="menu_option">Opción de menú</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {triggerType !== "first_message" && (
        <div className="space-y-2"><Label className="text-[#8b949e]">Valor del trigger</Label>
          <Input value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder={triggerType === "keyword" ? "Ej: hola, precio, info" : "Valor exacto"} className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]" />
        </div>
      )}
      <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label className="text-white">Flujo activo</Label></div>
      <div>
        <h3 className="font-semibold mb-3 text-white">Nodos del flujo</h3>
        {nodes.map((node, i) => (
          <FlowNode key={node.id} node={node} onChange={(updated) => { const n = [...nodes]; n[i] = updated; setNodes(n); }} onDelete={() => setNodes(nodes.filter((_, j) => j !== i))} allNodeIds={allNodeIds} />
        ))}
        <Button variant="outline" onClick={addNode} className="border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"><Plus className="h-4 w-4 mr-2" /> Agregar nodo</Button>
      </div>
      <Button onClick={handleSave} disabled={!name || saving} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="h-4 w-4 mr-2" /> {saving ? "Guardando..." : "Guardar flujo"}</Button>
    </div>
  );
}
