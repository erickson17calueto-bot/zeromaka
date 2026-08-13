import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
//
// A sessão vem de cookies, nunca do localStorage. ATENÇÃO: esses cookies NÃO
// são httpOnly (o @supabase/ssr usa httpOnly:false por omissão) e não podem
// ser, porque o browser fala diretamente com o PostgREST — o createBrowserClient
// em lib/supabase/client.ts precisa de ler o token para autenticar cada query.
// Torná-los httpOnly exigiria mover todas as leituras de dados para o servidor,
// o que é uma mudança de arquitetura, não um ajuste de configuração.
// Mitigação atual: CSP sem 'unsafe-inline' em produção e o XSS conhecido
// fechado (ver docs/SECURITY-AUDIT-2026-08.md).
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chamado a partir de um Server Component — ignorável se o
            // middleware estiver a renovar a sessão.
          }
        }
      }
    }
  );
}
