import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRedirect, shouldBypass, PUBLIC_ROUTES } from "@/lib/routes";

// Proteção de rotas no SERVIDOR (regra do charter: nunca confiar só no frontend).
// Também renova o token da sessão a cada pedido (padrão @supabase/ssr).
//
// O middleware faz apenas a verificação rápida — existe sessão válida ou não.
// A pertença a uma organização é confirmada no layout de /app, que já corre no
// servidor e evita uma segunda ida à base de dados em cada pedido.

function isPublicMarketing(path: string): boolean {
  return PUBLIC_ROUTES.includes(path);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Páginas de marketing e ficheiros para crawlers não dependem de sessão.
  // Sair já evita uma chamada de rede ao Supabase em cada visita pública.
  if (shouldBypass(path) || isPublicMarketing(path)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  // IMPORTANTE: usar getUser() (valida o JWT no servidor Supabase),
  // nunca getSession() (confia no cookie sem validar).
  const { data: { user } } = await supabase.auth.getUser();

  const target = decideRedirect(path, { hasSession: !!user, hasOrg: "unknown" });
  if (target) {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split("?");
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Tudo exceto ficheiros estáticos e assets do Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
