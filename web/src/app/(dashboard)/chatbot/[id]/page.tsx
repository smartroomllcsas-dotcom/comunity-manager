"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { FlowEditor } from "@/components/chatbot/FlowEditor";
import type { ChatbotFlow } from "@/types/database";

export const dynamic = "force-dynamic";

export default function EditFlowPage() {
  const params = useParams();
  const flowId = params.id as string;
  const supabase = createClient();
  const { data: flow } = useQuery<ChatbotFlow>({
    queryKey: ["chatbot-flow", flowId],
    queryFn: async () => { const { data, error } = await supabase.from("chatbot_flows").select("*").eq("id", flowId).single(); if (error) throw error; return data; },
  });
  if (!flow) return <div className="min-h-full bg-[#0d1117] p-6 text-[#8b949e]">Cargando...</div>;
  return (
    <div className="min-h-full bg-[#0d1117] p-6">
      <h1 className="text-2xl font-bold mb-6 text-white">Editar: {flow.name}</h1>
      <FlowEditor flow={flow} />
    </div>
  );
}
