'use client'

import Link from 'next/link'

type LegalLinksProps = {
  className?: string
  linkClassName?: string
}

export default function LegalLinks({ className = '', linkClassName = '' }: LegalLinksProps) {
  return (
    <div className={className}>
      <Link href="/terms" className={linkClassName}>
        Términos
      </Link>
      <Link href="/privacy-policy" className={linkClassName}>
        Privacidad
      </Link>
      <Link href="/data-deletion" className={linkClassName}>
        Eliminación de datos
      </Link>
    </div>
  )
}
