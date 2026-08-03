import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

function bad(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * Guardamos apenas um hash do IP: chega para limitar abusos sem conservar um
 * dado pessoal que não precisamos de conhecer.
 */
function hashIp(req: NextRequest): string | null {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return bad(413, "Mensagem demasiado longa.");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(400, "Pedido inválido.");
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  // Campo isco: invisível para pessoas, preenchido por robôs. Respondemos com
  // sucesso para não dar pistas de que a submissão foi descartada.
  if (str("website").trim() !== "") {
    return Response.json({ ok: true });
  }

  const name = str("name").trim();
  const email = str("email").trim();
  const subject = str("subject").trim();
  const message = str("message").trim();

  if (name.length < 2) return bad(422, "Indica o teu nome.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(422, "Indica um e-mail válido.");
  if (!subject) return bad(422, "Escolhe um assunto.");
  if (message.length < 10) return bad(422, "Escreve uma mensagem com pelo menos 10 caracteres.");
  if (body["consent"] !== true) return bad(422, "É preciso aceitar o tratamento dos dados.");

  const supabase = createClient();
  // A validação e o limite de envios voltam a ser aplicados dentro da função,
  // no servidor de base de dados — esta rota não é a única barreira.
  const { error } = await supabase.rpc("submit_contact_message", {
    p_name: name,
    p_email: email,
    p_subject: subject,
    p_message: message,
    p_phone: str("phone").trim() || null,
    p_company: str("company").trim() || null,
    p_ip_hash: hashIp(req),
  });

  if (error) {
    // 54000 é o código que a função usa quando o limite de envios é atingido.
    if (error.message.includes("Demasiados envios")) {
      return bad(429, "Demasiados envios. Tenta novamente dentro de uma hora.");
    }
    return bad(422, "Não foi possível enviar a mensagem. Verifica os dados e tenta de novo.");
  }

  return Response.json({ ok: true });
}
