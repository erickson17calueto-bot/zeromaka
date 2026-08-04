// Adivinhar a conta de um extrato importado.
//
// Extratos reais raramente trazem uma coluna a dizer a que conta pertencem: um
// "DIÁRIO DE CAIXA" é todo da mesma conta, e isso está no título do ficheiro ou
// no nome da folha, não nas linhas. Sem esta pista, cada linha falharia com
// "conta não encontrada" e alguém teria de as corrigir uma a uma — inviável num
// ficheiro com centenas de movimentos.
//
// É sempre uma sugestão: fica visível num seletor que o utilizador pode trocar
// antes de importar.

export type ContaSugerivel = {
  id: string;
  name: string;
  type: "bank" | "mobile_money" | "cash";
  bank?: string;
  isArchived?: boolean;
};

/** Minúsculas, sem acentos e com espaços normalizados, para comparar textos. */
export function normalizar(valor: string): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

const TERMOS_POR_TIPO: { termos: string[]; tipo: ContaSugerivel["type"] }[] = [
  { termos: ["caixa", "cash", "numerario", "dinheiro"], tipo: "cash" },
  { termos: ["unitel money", "unitel", "mpesa", "m pesa", "multicaixa express", "carteira", "movel", "mobile"], tipo: "mobile_money" },
  { termos: ["banco", "bank", "extrato", "conta bancaria"], tipo: "bank" },
];

export function suggestAccount<T extends ContaSugerivel>(
  contas: T[],
  ...pistas: (string | null | undefined)[]
): T | undefined {
  const abertas = contas.filter(c => !c.isArchived);
  if (!abertas.length) return undefined;

  const texto = normalizar(pistas.filter(Boolean).join(" "));
  if (!texto) return abertas.length === 1 ? abertas[0] : undefined;

  // 1. O nome da conta aparece no título ("Extrato BAI Empresa.xlsx").
  //    A mais longa ganha: "BAI Empresa" é mais específica do que "BAI".
  const porNome = abertas
    .filter(c => c.name && texto.includes(normalizar(c.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (porNome) return porNome;

  // 2. O banco aparece no título ("Movimentos BAI.csv")
  const porBanco = abertas
    .filter(c => c.bank && texto.includes(normalizar(c.bank)))
    .sort((a, b) => (b.bank?.length || 0) - (a.bank?.length || 0))[0];
  if (porBanco) return porBanco;

  // 3. O tipo está implícito na palavra usada. Só decide quando existe uma
  //    única conta desse tipo — com duas contas de caixa não há como escolher.
  for (const { termos, tipo } of TERMOS_POR_TIPO) {
    if (termos.some(t => texto.includes(t))) {
      const candidatas = abertas.filter(c => c.type === tipo);
      if (candidatas.length === 1) return candidatas[0];
      // O título diz o tipo mas não há uma conta clara desse tipo. Devolver a
      // única conta que existe seria pior do que não sugerir: um ficheiro
      // chamado "diário de caixa" acabaria atribuído a uma conta bancária.
      return undefined;
    }
  }

  // 4. Nenhuma pista no título e só existe uma conta: não há ambiguidade.
  return abertas.length === 1 ? abertas[0] : undefined;
}
