import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Eliminación de Datos - Community Manager',
  description: 'Instrucciones para solicitar la eliminación de tus datos en Community Manager',
}

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-violet-400 hover:text-violet-300 text-sm">← Volver</a>
        <h1 className="text-3xl font-bold mt-4 mb-2">Eliminación de Datos del Usuario</h1>
        <p className="text-sm text-slate-400 mb-8">Última actualización: 21 de abril de 2026</p>

        <div className="space-y-6 text-slate-300">
          <section>
            <p>
              En Community Manager (<a className="text-violet-400" href="https://www.comunitymanager.io">www.comunitymanager.io</a>)
              respetamos tu derecho a eliminar tus datos personales y toda la información asociada a las cuentas de Facebook e
              Instagram que hayas conectado a nuestra plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Opción 1 — Eliminación desde la plataforma</h2>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Inicia sesión en <a className="text-violet-400" href="https://www.comunitymanager.io/login">comunitymanager.io</a>.</li>
              <li>Ve a <strong>Configuración &gt; Cuenta</strong>.</li>
              <li>Pulsa <strong>&quot;Eliminar mi cuenta&quot;</strong> y confirma.</li>
              <li>Recibirás un correo de confirmación. La eliminación se completa en un máximo de 30 días.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Opción 2 — Revocar acceso desde Facebook</h2>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Ve a{' '}
                <a className="text-violet-400" href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noreferrer">
                  Configuración de Facebook &gt; Integraciones de empresas
                </a>.
              </li>
              <li>Busca <strong>&quot;Community Manager&quot;</strong> en la lista.</li>
              <li>Pulsa <strong>Eliminar</strong> y confirma.</li>
            </ol>
            <p className="mt-3">
              Esto revoca nuestro acceso a tu cuenta de Meta. Para eliminar también los datos ya almacenados en nuestros
              servidores, usa la Opción 1 o la Opción 3.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Opción 3 — Solicitud por correo</h2>
            <p>
              Envía un email a{' '}
              <a className="text-violet-400" href="mailto:soporte@comunitymanager.io">soporte@comunitymanager.io</a>{' '}
              desde la dirección registrada en tu cuenta, con el asunto <strong>&quot;Solicitud de Eliminación de Datos&quot;</strong>.
            </p>
            <p className="mt-3">Incluye:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Nombre completo.</li>
              <li>Email de la cuenta.</li>
              <li>ID de usuario de Facebook/Instagram (si aplica).</li>
              <li>Confirmación explícita de que solicitas la eliminación.</li>
            </ul>
            <p className="mt-3">Responderemos en un máximo de 5 días hábiles y completaremos la eliminación en 30 días.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">¿Qué datos se eliminan?</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Tokens de acceso de Meta (Facebook / Instagram).</li>
              <li>Datos de perfil, cuentas conectadas, clientes gestionados y calendarios.</li>
              <li>Historial de conversaciones con los agentes de IA.</li>
              <li>Reportes, analíticas e insights asociados a tu cuenta.</li>
              <li>Logs de actividad y credenciales.</li>
            </ul>
            <p className="mt-3">
              <strong>Excepciones:</strong> conservamos registros mínimos exigidos por ley (facturación, cumplimiento fiscal)
              por el periodo legalmente requerido, de forma anonimizada cuando sea posible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Callback automático (Meta Data Deletion Request)</h2>
            <p>
              Como desarrollador registrado en Meta, exponemos un endpoint automático conforme a los requisitos de la{' '}
              <a className="text-violet-400" href="https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback" target="_blank" rel="noreferrer">
                Data Deletion Request Callback
              </a>{' '}
              de Meta. Cuando un usuario revoca la app desde Facebook, recibimos la notificación y disparamos la eliminación
              automática de sus datos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">Contacto</h2>
            <p>
              ¿Dudas sobre este proceso? Escríbenos a{' '}
              <a className="text-violet-400" href="mailto:soporte@comunitymanager.io">soporte@comunitymanager.io</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
