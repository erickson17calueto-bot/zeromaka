import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a service_role — a PRIMEIRA vez que este projeto usa essa
// chave. Uso único e propositadamente estreito: enviar o email de convite
// via auth.admin.inviteUserByEmail em app/api/organizacoes/convites/route.ts.
//
// NUNCA importar este ficheiro de um componente cliente ("use client") nem
// de nada que corra no browser — a service_role ignora RLS por completo.
// SUPABASE_SERVICE_ROLE_KEY é uma variável só de servidor (sem prefixo
// NEXT_PUBLIC_), lida apenas aqui.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada. Define-a nas variáveis de ambiente do servidor (nunca com prefixo NEXT_PUBLIC_)."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
