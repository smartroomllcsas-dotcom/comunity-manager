"use client";
import type { ChatbotFlowNode } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

const nodeTypeLabels: Record<string, string> = { message: "Mensaje", menu: "Menú de opciones", condition: "Condición", assign_agent: "Asignar a agente", ai_handoff: "Pasar a IA" };

interface FlowNodeProps { node: ChatbotFlowNode; onChange: (node: ChatbotFlowNode) => void; onDelete: () => void; allNodeIds: string[]; }

export function FlowNode({ node, onChange, onDelete, allNodeIds }: FlowNodeProps) {
  return (
    <Card className="mb-3 bg-[#1a1f2e] border-[#2d333b]">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm text-white">#{node.id} — {nodeTypeLabels[node.type] || node.type}</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#8b949e] hover:text-red-400 hover:bg-[#0d1117]" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <Select value={node.type} onValueChange={(type) => onChange({ ...node, type: type as ChatbotFlowNode["type"] })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(nodeTypeLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {(node.type === "message" || node.type === "menu") && (
          <Textarea value={node.content || ""} onChange={(e) => onChange({ ...node, content: e.target.value })} placeholder="Texto del mensaje..." rows={2} className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]" />
        )}
        {node.type === "menu" && (
          <div className="space-y-2">
            {(node.options || []).map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input value={opt.label} onChange={(e) => { const options = [...(node.options || [])]; options[i] = { ...opt, label: e.target.value }; onChange({ ...node, options }); }} placeholder="Etiqueta" className="h-8" />
                <Select value={opt.next || ""} onValueChange={(next) => { const options = [...(node.options || [])]; options[i] = { ...opt, next: next ?? "" }; onChange({ ...node, options }); }}>
                  <SelectTrigger className="h-8 w-32"><SelectValue placeholder="→ nodo" /></SelectTrigger>
                  <SelectContent>{allNodeIds.filter((id) => id !== node.id).map((id) => <SelectItem key={id} value={id}>#{id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...node, options: [...(node.options || []), { label: "", next: "" }] })}><Plus className="h-3 w-3 mr-1" /> Opción</Button>
          </div>
        )}
        {node.type === "condition" && <Input value={node.keyword || ""} onChange={(e) => onChange({ ...node, keyword: e.target.value })} placeholder="Keyword a buscar" className="h-8 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]" />}
        {node.type === "ai_handoff" && <Textarea value={node.prompt || ""} onChange={(e) => onChange({ ...node, prompt: e.target.value })} placeholder="Prompt para la IA..." rows={2} className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e]" />}
        {node.type !== "menu" && node.type !== "assign_agent" && (
          <Select value={node.next || ""} onValueChange={(next) => onChange({ ...node, next: next ?? undefined })}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Siguiente nodo →" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Fin del flujo —</SelectItem>
              {allNodeIds.filter((id) => id !== node.id).map((id) => <SelectItem key={id} value={id}>#{id}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}
