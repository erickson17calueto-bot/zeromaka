import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROUTES, safeNext } from "@/lib/routes";

export const dynamic = "force-dynamic";

// Destino dos links de confirmação de e-mail e de recuperação de palavra-passe.
// Troca o código PKCE por uma sessão, do lado do servidor. Os cookies gravados
// NÃO são httpOnly — ver a nota em lib/supabase/server.ts para o porquê e para
// as mitigações em vigor.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  // O Supabase devolve o motivo do erro na própria query (ex: link expirado).
  const authError = searchParams.get("error_description") || searchParams.get("error");

  if (authError) {
    const url = new URL(ROUTES.entrar, origin);
    url.searchParams.set("erro", authError);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL(ROUTES.entrar, origin);
    url.searchParams.set("erro", "Link inválido ou já utilizado.");
    return NextResponse.redirect(url);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL(ROUTES.entrar, origin);
    url.searchParams.set("erro", "O link expirou. Pede um novo.");
    return NextResponse.redirect(url);
  }

  // Sem organização o layout de /app encaminha para o onboarding, por isso
  // basta apontar para o destino pedido ou para o dashboard.
  return NextResponse.redirect(new URL(next || ROUTES.dashboard, origin));
}
