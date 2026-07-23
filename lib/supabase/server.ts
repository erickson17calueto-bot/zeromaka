import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// A sessão vem de cookies httpOnly — nunca do localStorage.
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
