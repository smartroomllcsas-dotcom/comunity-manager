import { BroadcastForm } from "@/components/broadcasts/BroadcastForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NewBroadcastPage() {
  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/broadcasts" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Nueva Difusión</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Configura y envía un mensaje masivo a tus contactos</p>
        </div>
      </div>
      <div className="p-6">
        <BroadcastForm />
      </div>
    </div>
  );
}
