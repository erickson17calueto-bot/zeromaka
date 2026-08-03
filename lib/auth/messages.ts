// Mensagens do Supabase Auth traduzidas para linguagem que o utilizador entende.
export function friendlyAuthError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou palavra-passe incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirma o teu e-mail antes de entrar (verifica a caixa de entrada).";
  if (msg.includes("User already registered")) return "Este e-mail já tem conta. Usa \"Entrar\".";
  if (msg.includes("Password should be at least")) return "A palavra-passe deve ter pelo menos 6 caracteres.";
  if (msg.includes("valid email")) return "Introduz um e-mail válido.";
  if (msg.includes("For security purposes")) return "Aguarda alguns segundos antes de tentar de novo.";
  if (msg.includes("same_password")) return "A nova palavra-passe tem de ser diferente da anterior.";
  return "Não foi possível concluir. Tenta novamente.";
}

/**
 * Resposta genérica para pedidos de recuperação de palavra-passe.
 * É deliberadamente igual quer a conta exista ou não, para não permitir
 * descobrir que e-mails estão registados.
 */
export const RECOVERY_NOTICE =
  "Se existir uma conta com esse e-mail, enviámos um link de recuperação. Verifica a tua caixa de entrada e o spam.";
