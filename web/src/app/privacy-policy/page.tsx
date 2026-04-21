import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidad - Community Manager',
  description: 'Política de privacidad y tratamiento de datos de Community Manager',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-violet-400 hover:text-violet-300 text-sm">← Volver</a>
        <h1 className="text-3xl font-bold mt-4 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-slate-400 mb-8">Última actualización: 21 de abril de 2026</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">1. Introducción</h2>
            <p>
              Community Manager (&quot;nosotros&quot;, &quot;nuestro&quot; o la &quot;Plataforma&quot;), accesible desde{' '}
              <a className="text-violet-400" href="https://www.comunitymanager.io">https://www.comunitymanager.io</a>,
              respeta la privacidad de sus usuarios. Esta política explica qué información recopilamos, cómo la usamos,
              y cuáles son tus derechos sobre ella.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">2. Información que recopilamos</h2>
            <p>Recopilamos los siguientes tipos de datos:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico y contraseña cifrada.</li>
              <li><strong>Datos de Meta (Facebook e Instagram):</strong> tokens de acceso, información de páginas administradas, cuentas de Instagram Business conectadas, insights públicos y contenido publicado a través de la plataforma, mediante la API oficial de Meta Graph.</li>
              <li><strong>Datos de cliente gestionado:</strong> perfiles de marca, contenido, calendario editorial y reportes que cargas en tu espacio de trabajo.</li>
              <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador, sistema operativo, logs de actividad en la plataforma.</li>
              <li><strong>Datos de uso:</strong> interacciones con agentes de IA, prompts enviados y contenido generado.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">3. Uso de la información</h2>
            <p>Usamos tus datos para:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Proveer y operar los servicios de gestión de redes sociales.</li>
              <li>Publicar contenido en Facebook e Instagram en tu nombre, con tu autorización expresa.</li>
              <li>Generar reportes, analíticas e insights sobre tus campañas.</li>
              <li>Enviar notificaciones operativas (publicaciones programadas, fallos, alertas).</li>
              <li>Mejorar la plataforma y entrenar nuestros modelos de IA con datos agregados y anonimizados.</li>
              <li>Cumplir obligaciones legales y responder requerimientos de autoridades.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">4. Integración con Meta (Facebook / Instagram)</h2>
            <p>
              Al conectar una cuenta de Facebook o Instagram, obtenemos tokens de acceso vía el protocolo OAuth 2.0 oficial
              de Meta. Usamos estos tokens exclusivamente para:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Publicar posts, historias y reels autorizados por ti.</li>
              <li>Leer métricas e insights de tus propias páginas y cuentas.</li>
              <li>Recibir mensajes entrantes vía webhooks (si activas el Inbox Unificado).</li>
            </ul>
            <p className="mt-3">
              <strong>Nunca</strong> publicamos sin autorización, ni compartimos tus tokens con terceros, ni usamos tus
              datos para construir perfiles de usuarios finales. Cumplimos con las{' '}
              <a className="text-violet-400" href="https://developers.facebook.com/terms/" target="_blank" rel="noreferrer">
                Políticas de Plataforma de Meta
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">5. Almacenamiento y seguridad</h2>
            <p>
              Los datos se almacenan en infraestructura de Supabase y Vercel, con cifrado en tránsito (TLS 1.3) y en reposo
              (AES-256). Los tokens de Meta se almacenan encriptados. Aplicamos controles de acceso basados en roles y
              auditoría de actividad.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">6. Compartir datos con terceros</h2>
            <p>Compartimos datos únicamente con los siguientes proveedores, bajo acuerdos de confidencialidad:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Meta Platforms Inc.</strong> — publicación e ingesta de datos.</li>
              <li><strong>Anthropic</strong> — procesamiento de lenguaje natural (API Claude).</li>
              <li><strong>Supabase</strong> — base de datos y autenticación.</li>
              <li><strong>Vercel</strong> — hosting y ejecución del backend.</li>
            </ul>
            <p className="mt-3">No vendemos tus datos a terceros. No los usamos para publicidad fuera de la plataforma.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">7. Tus derechos</h2>
            <p>Como titular de los datos, tienes derecho a:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Acceder, rectificar o actualizar tus datos personales.</li>
              <li>Solicitar la eliminación total de tu cuenta y datos asociados (ver{' '}
                <a className="text-violet-400" href="/data-deletion">Eliminación de Datos</a>).
              </li>
              <li>Revocar el acceso a tus cuentas de Meta en cualquier momento desde la configuración.</li>
              <li>Exportar tus datos en formato legible.</li>
              <li>Presentar reclamos ante la autoridad de protección de datos que corresponda.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">8. Retención de datos</h2>
            <p>
              Conservamos tus datos mientras tu cuenta esté activa. Al eliminar la cuenta, borramos los datos personales
              en un plazo máximo de 30 días, salvo obligaciones legales de conservación (p. ej. facturación: 5 años).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">9. Cookies</h2>
            <p>
              Usamos cookies estrictamente necesarias para la autenticación y el funcionamiento de la plataforma. No usamos
              cookies de publicidad de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">10. Menores de edad</h2>
            <p>
              La plataforma está dirigida a profesionales mayores de 18 años. No recopilamos conscientemente datos de menores.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">11. Cambios a esta política</h2>
            <p>
              Podemos actualizar esta política. Notificaremos cambios significativos por correo electrónico o dentro de la
              plataforma al menos 15 días antes de su entrada en vigor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">12. Contacto</h2>
            <p>
              Para ejercer tus derechos o resolver dudas sobre esta política, escríbenos a:{' '}
              <a className="text-violet-400" href="mailto:soporte@comunitymanager.io">soporte@comunitymanager.io</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
