import Link from "next/link";
import { Compass, Home } from "lucide-react";

export const metadata = {
  title: "404 · Community Manager",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#161b22] border border-[#2d333b] text-[#58a6ff]">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">404</h1>
        <p className="mt-2 text-sm text-[#8b949e]">
          La página que buscas no existe o fue movida.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6366f1] transition-colors"
          >
            <Home className="h-4 w-4" />
            Ir al inicio
          </Link>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 rounded-lg border border-[#2d333b] bg-[#161b22] px-4 py-2 text-sm text-[#c9d1d9] hover:border-[#388bfd] transition-colors"
          >
            Abrir bandeja
          </Link>
        </div>
      </div>
    </div>
  );
}
