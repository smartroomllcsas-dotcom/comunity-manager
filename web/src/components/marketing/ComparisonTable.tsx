import { Check, X } from "lucide-react";

const ROWS = [
  {
    feature: "Agentes IA especializados",
    us: "10 agentes",
    hootsuite: "Genérico",
    buffer: "Genérico",
    sprout: "Add-on",
  },
  {
    feature: "Canales soportados",
    us: "9",
    hootsuite: "9",
    buffer: "8",
    sprout: "7",
  },
  {
    feature: "Multi-cliente nativo",
    us: true,
    hootsuite: "Business+",
    buffer: false,
    sprout: true,
  },
  {
    feature: "Approval con magic-link",
    us: true,
    hootsuite: false,
    buffer: false,
    sprout: "Approval Plus",
  },
  {
    feature: "Generación imagen/video IA",
    us: true,
    hootsuite: false,
    buffer: false,
    sprout: false,
  },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto h-5 w-5 text-[#0f766e]" />;
  if (v === false) return <X className="mx-auto h-5 w-5 text-[#c4bbaa]" />;
  return <span className="text-sm text-[#16211f]/80">{v}</span>;
}

export function ComparisonTable() {
  return (
    <section className="px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Comparativa
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#16211f]">
            Cómo se ve contra el resto
          </h2>
          <p className="mt-4 text-lg text-[#16211f]/70">
            Comparativa honesta con las herramientas más populares del mercado.
          </p>
        </div>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-[#e6dfce] bg-white/70">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e6dfce] bg-[#f9f5eb]">
                <th className="px-6 py-4 text-sm font-bold text-[#16211f]">
                  Feature
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-[#0f766e]">
                  ComunityManager
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-[#16211f]/60">
                  Hootsuite
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-[#16211f]/60">
                  Buffer
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-[#16211f]/60">
                  Sprout
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.feature} className="border-b border-[#e6dfce]/50 last:border-0">
                  <td className="px-6 py-4 text-sm font-semibold text-[#16211f]">
                    {r.feature}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell v={r.us} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell v={r.hootsuite} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell v={r.buffer} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Cell v={r.sprout} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
