// Saldo atual de uma conta, respeitando a data-base do saldo de abertura.
//
// Um saldo de abertura configurado "hoje" (1.000.000 Kz, por exemplo) já
// reflete tudo o que aconteceu com a conta até hoje. Somar TODOS os
// lançamentos da conta, para sempre, sem olhar a data — como este cálculo
// fazia antes — faz com que importar uma despesa antiga volte a descontá-la,
// mesmo já estando implícita no valor de abertura.
//
// Regra: a data-base é a data do lançamento opening_balance 'posted' mais
// recente da conta. O saldo atual é esse valor de abertura mais os
// movimentos 'posted' com data entre a data-base e hoje (inclusive dos dois
// lados). Movimentos anteriores à data-base continuam no histórico e nos
// relatórios — só deixam de alterar o saldo atual, porque já lá estão
// implícitos. Movimentos futuros também ficam de fora (são previsão, não
// saldo disponível hoje). Contas sem nenhum opening_balance mantêm o
// comportamento anterior — soma tudo, sem corte de data — para não quebrar
// contas já existentes.
//
// Esta função espelha exatamente a função SQL current_account_balance(); ver
// supabase/migrations/20260805_0029_saldo_data_base.sql. Servem propósitos
// diferentes: o servidor é a fonte de verdade para o que é gravado e para
// get_true_available_cash; esta versão dá ao frontend o mesmo número sem uma
// chamada extra por conta, a partir dos lançamentos já carregados em store.tsx.

import { JournalEntry } from "../data";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeAccountBalance(
  accountId: string,
  entries: JournalEntry[],
  today: string = todayIso(),
): number {
  // 1) Data-base: o opening_balance 'posted' mais recente desta conta.
  // Empate na mesma data resolvido por posted_at, depois created_at, depois
  // id — mesmo critério de desempate da função SQL, para os dois lados
  // concordarem sempre no mesmo lançamento.
  let dataBase: string | null = null;
  let openingAmount = 0;
  let tieBreak: { postedAt: string; createdAt: string; id: string } | null = null;

  for (const entry of entries) {
    if (entry.entryType !== "opening_balance" || entry.status !== "posted") continue;
    const lines = entry.lines.filter(l => l.accountId === accountId);
    if (!lines.length) continue;

    const isNewer = dataBase === null || entry.transactionDate > dataBase || (
      entry.transactionDate === dataBase && tieBreak !== null && (
        entry.postedAt > tieBreak.postedAt ||
        (entry.postedAt === tieBreak.postedAt && entry.createdAt > tieBreak.createdAt) ||
        (entry.postedAt === tieBreak.postedAt && entry.createdAt === tieBreak.createdAt && entry.id > tieBreak.id)
      )
    );
    if (!isNewer) continue;

    dataBase = entry.transactionDate;
    openingAmount = lines.reduce((sum, l) => sum + (l.direction === "debit" ? l.amount : -l.amount), 0);
    tieBreak = { postedAt: entry.postedAt, createdAt: entry.createdAt, id: entry.id };
  }

  // 2) Movimentos entre a data-base e hoje. Propositadamente SEM filtro de
  // status: quando um lançamento é revertido, o original fica 'reversed' mas
  // as suas linhas continuam na tabela — é a reversão (linhas opostas) que
  // anula o efeito, não a mudança de status. Excluir o original por status e
  // manter só a reversão desequilibraria a soma (contaria a reversão sem
  // nunca ter contado o que ela está a reverter). Por isso a reversão usa
  // sempre a data do lançamento que reverte (nunca a sua própria data, que é
  // "hoje") — assim os dois ficam sempre do mesmo lado do corte de data,
  // preservando o cancelamento mútuo seja qual for a data-base.
  const entryById = new Map(entries.map(e => [e.id, e]));
  let movementsTotal = 0;
  for (const entry of entries) {
    if (entry.entryType === "opening_balance") continue;
    const lines = entry.lines.filter(l => l.accountId === accountId);
    if (!lines.length) continue;

    const original = entry.reversesEntryId ? entryById.get(entry.reversesEntryId) : undefined;
    const effectiveDate = original ? original.transactionDate : entry.transactionDate;
    if (dataBase !== null && effectiveDate < dataBase) continue;
    if (effectiveDate > today) continue;

    movementsTotal += lines.reduce((sum, l) => sum + (l.direction === "debit" ? l.amount : -l.amount), 0);
  }

  return openingAmount + movementsTotal;
}
