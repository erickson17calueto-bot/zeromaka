export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function bad(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

// Envia um convite por email real (a pessoa não precisa de já ter conta).
//
// Duas etapas com dois níveis de confiança diferentes, de propósito:
//  1) create_organization_invite corre com a SESSÃO do próprio utilizador
//     (cookies, cliente normal) — a RPC valida internamente que quem chama é
//     dono/admin da organização. Não confiamos só na UI para esconder o
//     botão: isto é a repetição server-side dessa verificação.
//  2) Só DEPOIS de a RPC aceitar é que tocamos na service_role, e só para
//     esta única chamada (auth.admin.inviteUserByEmail). Se o envio falhar,
//     revogamos o convite que acabámos de criar para não deixar lixo.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad(401, "Não autenticado");

  let body: { orgId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Pedido inválido");
  }
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!orgId || !email || !role) return bad(400, "Faltam dados: organização, email ou papel");

  const { data: inviteId, error: insertErr } = await supabase.rpc("create_organization_invite", {
    p_org_id: orgId, p_email: email, p_role: role,
  });
  if (insertErr) return bad(400, insertErr.message);

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    // Convite ficou registado mas ninguém vai receber email — revoga já
    // para o administrador não pensar que foi enviado.
    await supabase.rpc("revoke_organization_invite", { p_org_id: orgId, p_invite_id: inviteId });
    return bad(500, e instanceof Error ? e.message : "Serviço de email não configurado");
  }

  // O id do convite viaja no próprio link (query string do redirectTo, que o
  // Supabase preserva e só acrescenta o code= dele por cima — mesmo padrão
  // já usado em next= no fluxo de recuperação de senha). Sem isto,
  // accept_organization_invite() teria de adivinhar "qual convite pendente
  // para este email", o que permitia outra organização sequestrar a adesão
  // criando um convite mais recente para o mesmo email antes de a pessoa
  // clicar no link genuíno.
  const origin = req.nextUrl.origin;
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/aceitar-convite")}&invite=${encodeURIComponent(inviteId)}`,
  });
  if (sendErr) {
    await supabase.rpc("revoke_organization_invite", { p_org_id: orgId, p_invite_id: inviteId });
    const msg = /already.*registered|already.*exists/i.test(sendErr.message)
      ? "Esta pessoa já tem conta ZeroMaka — usa \"Adicionar por conta existente\""
      : sendErr.message;
    return bad(400, msg);
  }

  return Response.json({ ok: true, inviteId });
}
