// Agrupar movimentos que provavelmente são o mesmo lançamento repetido.
//
// A versão anterior desta lógica usava uma única chave (data+valor+descrição)
// e marcava as linhas à medida que as ia processando — o que significava que a
// PRIMEIRA ocorrência de um par duplicado nunca ficava marcada, só as
// seguintes apareciam como "duplicado". O utilizador via um duplicado sem
// nunca ver o original ao lado dele.
//
// Aqui a deteção é sempre em duas passagens: primeiro conta quantas vezes cada
// chave aparece em TODO o conjunto, só depois decide quem entra em grupo — por
// isso a primeira ocorrência de um grupo aparece sempre junto das restantes.
//
// Três níveis, da certeza mais forte para a mais fraca. Uma linha só entra no
// nível mais forte em que casar; não entra duas vezes em níveis diferentes.
//   - confirmed: mesma referência de documento (FATURA/N.º) + valor + direção.
//   - probable:  mesma data + valor + direção + conta + contacto.
//   - possible:  mesma data + valor + descrição normalizada (sem acentos/caixa).
//
// Isto nunca apaga nada: só agrupa. A decisão (manter os dois, manter só o
// original, manter só o importado, falso positivo, ignorar) é sempre humana.

import { normalizar } from "./suggest-account";

export type DuplicateTier = "confirmed" | "probable" | "possible";

export type DuplicateItem = {
  id: string;
  date?: string | null;
  amount?: number | null;
  direction?: "income" | "expense" | null;
  description?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  reference?: string | null;
};

export type DuplicateGroup = {
  tier: DuplicateTier;
  key: string;
  itemIds: string[];
};

function chaveConfirmada(item: DuplicateItem): string | null {
  const ref = normalizar(item.reference || "");
  if (!ref || typeof item.amount !== "number" || !item.direction) return null;
  return ["confirmed", ref, item.amount, item.direction].join("|");
}

function chaveProvavel(item: DuplicateItem): string | null {
  if (!item.date || typeof item.amount !== "number" || !item.direction) return null;
  return ["probable", item.date, item.amount, item.direction, item.accountId || "", item.contactId || ""].join("|");
}

function chavePossivel(item: DuplicateItem): string | null {
  if (!item.date || typeof item.amount !== "number") return null;
  const desc = normalizar(item.description || "");
  if (!desc) return null;
  return ["possible", item.date, item.amount, desc].join("|");
}

const NIVEIS: { tier: DuplicateTier; keyFn: (item: DuplicateItem) => string | null }[] = [
  { tier: "confirmed", keyFn: chaveConfirmada },
  { tier: "probable", keyFn: chaveProvavel },
  { tier: "possible", keyFn: chavePossivel },
];

/**
 * Recebe todos os itens a comparar entre si — linhas novas do ficheiro e,
 * opcionalmente, lançamentos já existentes na organização (para apanhar
 * reimportações) — e devolve os grupos de duplicados encontrados.
 *
 * Um item que já entrou num grupo num nível mais forte não é reconsiderado
 * nos níveis mais fracos.
 */
export function findDuplicateGroups(items: DuplicateItem[]): DuplicateGroup[] {
  const grupos: DuplicateGroup[] = [];
  const usados = new Set<string>();

  for (const { tier, keyFn } of NIVEIS) {
    const porChave = new Map<string, string[]>();
    for (const item of items) {
      if (usados.has(item.id)) continue;
      const chave = keyFn(item);
      if (!chave) continue;
      const lista = porChave.get(chave) ?? [];
      lista.push(item.id);
      porChave.set(chave, lista);
    }
    porChave.forEach((ids, chave) => {
      if (ids.length < 2) return;
      grupos.push({ tier, key: chave, itemIds: ids });
      ids.forEach(id => usados.add(id));
    });
  }

  return grupos;
}
