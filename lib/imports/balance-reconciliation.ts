// Conferir o saldo declarado num ficheiro contra o saldo calculado pelos
// próprios movimentos do ficheiro, linha a linha, na ordem em que aparecem.
//
// Um diário de caixa manual erra: uma linha esquecida, um valor trocado de
// coluna, um total mal copiado. O ficheiro "parece" bater certo porque o
// próprio autor confia no saldo que escreveu — mas o saldo é um resultado,
// não uma fonte. Recalculá-lo a partir dos movimentos e comparar com o que
// está escrito é a única forma de apanhar o erro antes de ele entrar na
// contabilidade.
//
// Isto é só um sinal para revisão humana — nunca bloqueia nem corrige nada
// sozinho, e o SALDO nunca é lançado como se fosse um movimento.

export type BalanceStatus =
  | "reconciled"      // saldo declarado bate com o calculado (dentro da tolerância de arredondamento)
  | "small_diff"      // diferença pequena — possível arredondamento ou taxa não capturada
  | "relevant_diff"   // diferença grande — provável linha em falta ou valor errado
  | "unverifiable"    // sem saldo anterior conhecido para calcular a partir daqui
  | "no_movement";    // linha sem valor (ex: linha de controlo) — nada a conferir

export type BalanceRow = {
  amount: number | null | undefined;
  direction?: "income" | "expense" | null;
  declaredBalance?: number | null;
};

export type BalanceResult = {
  status: BalanceStatus;
  expectedBalance: number | null;
  difference: number | null;
};

const TOLERANCIA_ARREDONDAMENTO = 1;
const TOLERANCIA_RELEVANTE = 100;

/**
 * Percorre as linhas na ordem do ficheiro, mantendo um saldo corrente.
 * Sempre que a linha traz um SALDO declarado, compara-o com o saldo esperado
 * (saldo corrente + entrada − saída) e passa a confiar no valor declarado daí
 * para a frente — assim um erro isolado não desalinha todas as linhas seguintes.
 */
export function reconcileBalances(rows: BalanceRow[]): BalanceResult[] {
  const resultados: BalanceResult[] = [];
  let saldoCorrente: number | null = null;

  for (const linha of rows) {
    const temValor = typeof linha.amount === "number" && linha.amount > 0;
    if (!temValor) {
      resultados.push({ status: "no_movement", expectedBalance: saldoCorrente, difference: null });
      continue;
    }

    if (!linha.direction) {
      // Valor presente mas direção desconhecida: não dá para somar nem subtrair
      // com confiança. Quebra a cadeia em vez de arriscar um saldo errado.
      resultados.push({ status: "unverifiable", expectedBalance: null, difference: null });
      saldoCorrente = typeof linha.declaredBalance === "number" ? linha.declaredBalance : null;
      continue;
    }

    if (saldoCorrente === null) {
      resultados.push({ status: "unverifiable", expectedBalance: null, difference: null });
      saldoCorrente = typeof linha.declaredBalance === "number" ? linha.declaredBalance : null;
      continue;
    }

    const delta = linha.direction === "income" ? linha.amount! : -linha.amount!;
    const esperado = saldoCorrente + delta;

    if (typeof linha.declaredBalance === "number") {
      const diferenca = linha.declaredBalance - esperado;
      const absDiferenca = Math.abs(diferenca);
      const status: BalanceStatus =
        absDiferenca <= TOLERANCIA_ARREDONDAMENTO ? "reconciled"
        : absDiferenca <= TOLERANCIA_RELEVANTE ? "small_diff"
        : "relevant_diff";
      resultados.push({ status, expectedBalance: esperado, difference: diferenca });
      saldoCorrente = linha.declaredBalance;
    } else {
      resultados.push({ status: "unverifiable", expectedBalance: esperado, difference: null });
      saldoCorrente = esperado;
    }
  }

  return resultados;
}
