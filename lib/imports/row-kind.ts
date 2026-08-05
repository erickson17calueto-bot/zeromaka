// Reconhecer linhas que não são movimentos financeiros.
//
// Um diário de caixa real intercala lançamentos com linhas de controlo: "FECHO
// DA SEMANA", "SALDO EMPRESA-BAI", "RECONCILIAÇÃO BANCÁRIA". Lançá-las como
// receita ou despesa duplica o dinheiro no livro — o valor já está contado nos
// movimentos da semana, a linha de fecho não é um segundo movimento.
//
// A deteção é por palavra-chave, não por posição ou formatação: mais simples,
// mais explicável, e não depende de a folha vir sempre formatada da mesma forma.

import { normalizar } from "./suggest-account";

export type RowKind = "movement" | "control";

// Frases primeiro (mais específicas), palavras isoladas depois — a ordem não
// importa para a deteção em si (usa some()), mas ajuda a leitura da lista.
// Já normalizadas (sem acentos), porque é isso que `normalizar()` devolve.
const TERMOS_CONTROLO = [
  "fecho da semana", "fecho do mes", "fecho semanal", "fecho mensal",
  "saldo inicial", "saldo final", "saldo acumulado", "saldo em caixa", "saldo da conta",
  "valor existencial", "valor existente",
  "reconciliacao bancaria", "reconciliacao",
  "total da semana", "total do mes", "total geral", "totais",
  "transporte de saldo", "transporte para", "saldo transportado",
];

/**
 * Classifica uma linha pela descrição. "movement" é o valor por omissão —
 * na dúvida, a linha segue o caminho normal de validação, que já pede data e
 * valor válidos antes de deixar aprovar.
 */
export function detectRowKind(description: string | null | undefined): RowKind {
  const texto = normalizar(description || "");
  if (!texto) return "movement";
  return TERMOS_CONTROLO.some(termo => texto.includes(termo)) ? "control" : "movement";
}
