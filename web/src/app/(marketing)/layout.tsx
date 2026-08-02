import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "ComunityManager · El equipo de marketing con IA para tu agencia",
  description:
    "Gestión multicanal, agentes IA, aprobación con un click. Todo lo que tu agencia necesita para escalar sin contratar.",
  openGraph: {
    title: "ComunityManager · Marketing con IA para agencias",
    description:
      "10 agentes IA + 68 skills + 9 canales. Diseñado para agencias que gestionan varios clientes a la vez.",
    images: ["/og-image.svg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ComunityManager · Marketing con IA para agencias",
    description: "10 agentes IA + 68 skills + 9 canales.",
    images: ["/og-image.svg"],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override dark-mode del root layout: marketing es light-first (paleta calida).
  return (
    <div className="min-h-screen bg-[#f4f0e6] text-[#16211f] antialiased [color-scheme:light]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
