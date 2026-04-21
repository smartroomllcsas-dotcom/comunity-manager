import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos y Condiciones - Community Manager',
  description: 'Términos y condiciones de uso de Community Manager',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-violet-400 hover:text-violet-300 text-sm">← Volver</a>
        <h1 className="text-3xl font-bold mt-4 mb-2">Términos y Condiciones</h1>
        <p className="text-sm text-slate-400 mb-8">Última actualización: 21 de abril de 2026</p>

        <div className="space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">1. Aceptación</h2>
            <p>
              Al acceder o usar la plataforma Community Manager (<a className="text-violet-400" href="https://www.comunitymanager.io">www.comunitymanager.io</a>),
              aceptas quedar sujeto a estos Términos y Condiciones. Si no estás de acuerdo, no uses el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">2. Descripción del servicio</h2>
            <p>
              Community Manager es una plataforma SaaS de gestión de redes sociales asistida por agentes de inteligencia
              artificial. Permite a agencias y marcas planificar, crear, programar, publicar y analizar contenido en Facebook,
              Instagram y otras plataformas integradas, así como gestionar conversaciones, campañas y reportes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">3. Cuenta de usuario</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Debes ser mayor de 18 años para crear una cuenta.</li>
              <li>Eres responsable de mantener la confidencialidad de tu contraseña.</li>
              <li>Eres responsable de toda la actividad bajo tu cuenta.</li>
              <li>Debes proporcionar información veraz y actualizada.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">4. Uso permitido</h2>
            <p>Te comprometes a no usar la plataforma para:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Publicar contenido ilegal, engañoso, difamatorio, obsceno o que infrinja derechos de terceros.</li>
              <li>Generar spam, automatización abusiva o interacciones falsas.</li>
              <li>Violar las Políticas de Comunidad de Meta, Instagram u otras plataformas integradas.</li>
              <li>Realizar ingeniería inversa, descompilar o intentar extraer el código fuente.</li>
              <li>Usar la plataforma para atacar, sobrecargar o dañar nuestros sistemas.</li>
            </ul>
            <p className="mt-3">
              Nos reservamos el derecho a suspender o cancelar cuentas que violen estos términos, sin previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">5. Integraciones de terceros</h2>
            <p>
              Al conectar cuentas externas (Meta, Google, etc.) aceptas también los términos de esos proveedores. Somos
              responsables únicamente de nuestra integración; no de interrupciones, cambios de política o cobros de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">6. Contenido del usuario</h2>
            <p>
              Conservas la propiedad de todo el contenido que subas o generes con la plataforma. Al usar el servicio nos
              otorgas una licencia limitada, no exclusiva y revocable para procesarlo, almacenarlo y publicarlo en las
              plataformas que autorices, exclusivamente para prestarte el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">7. Contenido generado por IA</h2>
            <p>
              La plataforma usa modelos de IA (Anthropic Claude) para asistirte a crear contenido. Eres el responsable final
              de revisar, aprobar y publicar dicho contenido. No garantizamos que el output sea 100% preciso, original o libre
              de errores.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">8. Planes y pagos</h2>
            <p>
              Los precios vigentes se publican en la plataforma. Los pagos se procesan por adelantado y no son reembolsables,
              salvo obligación legal. Podemos actualizar los precios con 30 días de aviso previo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">9. Propiedad intelectual</h2>
            <p>
              La plataforma, su código, marca, diseño y documentación son propiedad de Community Manager. No adquieres
              derecho alguno salvo la licencia limitada de uso durante la vigencia de tu suscripción.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">10. Disponibilidad del servicio</h2>
            <p>
              Nos esforzamos por mantener el servicio disponible 24/7, pero no garantizamos cero interrupciones. Podemos
              realizar mantenimientos programados con aviso previo cuando sea posible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">11. Limitación de responsabilidad</h2>
            <p>
              En la máxima medida permitida por ley, no seremos responsables por daños indirectos, lucro cesante, pérdida
              de datos o daños derivados del uso o imposibilidad de uso del servicio. Nuestra responsabilidad total quedará
              limitada al monto pagado por el usuario en los 12 meses previos al incidente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">12. Terminación</h2>
            <p>
              Puedes cancelar tu cuenta en cualquier momento desde la configuración. Podemos terminar el servicio si
              incumples estos términos. Al terminar, se aplica la{' '}
              <a className="text-violet-400" href="/data-deletion">Política de Eliminación de Datos</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">13. Cambios</h2>
            <p>
              Podemos actualizar estos términos. Notificaremos cambios sustanciales con al menos 15 días de anticipación. El
              uso continuado tras la entrada en vigor implica aceptación.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">14. Ley aplicable</h2>
            <p>
              Estos términos se rigen por las leyes del país donde está registrada la empresa operadora de Community Manager.
              Cualquier disputa se someterá a los tribunales competentes de dicha jurisdicción.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">15. Contacto</h2>
            <p>
              Consultas sobre estos términos:{' '}
              <a className="text-violet-400" href="mailto:soporte@comunitymanager.io">soporte@comunitymanager.io</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
