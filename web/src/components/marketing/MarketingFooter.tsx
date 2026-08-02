import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-[#e6dfce]/60 bg-[#16211f] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-3 font-black tracking-tight">
            <img
              src="/community-manager-logo.png"
              alt=""
              className="h-9 w-9 rounded-xl"
            />
            <span className="text-lg">ComunityManager</span>
          </div>
          <p className="mt-4 text-sm text-white/60">
            El equipo de marketing con IA para tu agencia. Multi-cliente,
            multi-canal, aprobación con un click.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">
            Producto
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>
              <Link href="/features">Features</Link>
            </li>
            <li>
              <Link href="/pricing">Precios</Link>
            </li>
            <li>
              <Link href="/docs">Documentación</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">
            Compañía
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>
              <Link href="/about">Nosotros</Link>
            </li>
            <li>
              <Link href="/login">Iniciar sesión</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">
            Legal
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>
              <Link href="/terms">Términos</Link>
            </li>
            <li>
              <Link href="/privacy-policy">Privacidad</Link>
            </li>
            <li>
              <Link href="/data-deletion">Eliminación de datos</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-xs text-white/50">
        © 2026 ComunityManager. Todos los derechos reservados.
      </div>
    </footer>
  );
}
