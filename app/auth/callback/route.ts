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

  // Tentativa sempre feita, mesmo fora do fluxo de convite: se não houver
  // convite pendente para o email autenticado, a RPC devolve accepted:false
  // sem efeito nenhum — inofensivo para um login ou confirmação normal.
  // Quando aceita, a adesão à organização já fica criada aqui; falta só a
  // pessoa escolher nome e palavra-passe em /aceitar-convite antes do painel.
  const { data: acceptResult } = await supabase.rpc("accept_organization_invite");
  if ((acceptResult as { accepted?: boolean } | null)?.accepted) {
    return NextResponse.redirect(new URL("/aceitar-convite", origin));
  }

  // Sem organização o layout de /app encaminha para o onboarding, por isso
  // basta apontar para o destino pedido ou para o dashboard.
  return NextResponse.redirect(new URL(next || ROUTES.dashboard, origin));
}
