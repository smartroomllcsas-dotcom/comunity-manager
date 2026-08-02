import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="relative z-10 border-b border-[#e6dfce]/60 bg-[#f4f0e6]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-black tracking-tight text-[#16211f]">
          <img
            src="/community-manager-logo.png"
            alt=""
            className="h-9 w-9 rounded-xl"
          />
          <span className="text-lg">ComunityManager</span>
        </Link>
        <ul className="hidden items-center gap-7 text-sm font-semibold text-[#16211f]/80 md:flex">
          <li>
            <Link href="/features" className="transition hover:text-[#0f766e]">
              Features
            </Link>
          </li>
          <li>
            <Link href="/pricing" className="transition hover:text-[#0f766e]">
              Precios
            </Link>
          </li>
          <li>
            <Link href="/docs" className="transition hover:text-[#0f766e]">
              Docs
            </Link>
          </li>
          <li>
            <Link href="/about" className="transition hover:text-[#0f766e]">
              Nosotros
            </Link>
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-semibold text-[#16211f]/80 transition hover:text-[#0f766e] sm:inline"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-[#16211f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f766e]"
          >
            Empezar gratis
          </Link>
        </div>
      </nav>
    </header>
  );
}
