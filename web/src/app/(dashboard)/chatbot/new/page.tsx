import { FlowEditor } from "@/components/chatbot/FlowEditor";

export const dynamic = "force-dynamic";
export default function NewFlowPage() {
  return (
    <div className="min-h-full bg-[#0d1117] p-6">
      <h1 className="text-2xl font-bold mb-6 text-white">Nuevo Flujo</h1>
      <FlowEditor />
    </div>
  );
}
