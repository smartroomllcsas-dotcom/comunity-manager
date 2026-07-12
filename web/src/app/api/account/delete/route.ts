import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (body?.confirmText !== 'ELIMINAR') {
    return NextResponse.json({ error: 'Debes escribir ELIMINAR para confirmar' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const admin = createAdminClient('smarttalk')

  const { data: agent, error: agentError } = await admin
    .from('agents')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 })
  }

  if (agent?.organization_id) {
    // Solo admins pueden borrar toda la organización. Un agente/supervisor
    // solo borra su propia cuenta más abajo (auth.admin.deleteUser).
    if (agent.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo un administrador puede eliminar la organización.' },
        { status: 403 }
      )
    }

    const { error: orgError } = await admin.from('organizations').delete().eq('id', agent.organization_id)
    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 })
    }
  }

  const { error: userDeleteError } = await admin.auth.admin.deleteUser(user.id)
  if (userDeleteError) {
    return NextResponse.json({ error: userDeleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
