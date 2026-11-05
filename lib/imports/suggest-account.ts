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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

const TERMOS_POR_TIPO: { termos: string[]; tipo: ContaSugerivel["type"] }[] = [
  { termos: ["caixa", "caixa fisico", "caixa fisica", "caixa geral", "cash", "numerario", "dinheiro"], tipo: "cash" },
  { termos: ["unitel money", "unitel", "mpesa", "m pesa", "multicaixa express", "multicaixa", "carteira", "movel", "mobile", "emis"], tipo: "mobile_money" },
  { termos: ["banco", "bank", "extrato", "conta bancaria", "bai", "bfa", "bic", "bni", "bca", "sol", "atlantico", "keve", "economico", "bpc"], tipo: "bank" },
];

/**
 * Procura uma conta existente na organização que corresponda ao nome dado (ex: da coluna do ficheiro).
 * Aceita correspondência exata ou aproximada (ex: "Caixa Físico" bate em conta "Caixa").
 */
export function matchAccount<T extends ContaSugerivel>(
  contas: T[],
  nome: string | null | undefined
): T | undefined {
  const abertas = contas.filter(c => !c.isArchived);
  if (!abertas.length) return undefined;

  const texto = normalizar(nome || "");
  if (!texto) return undefined;

  // 1. Igualdade exata após normalização
  const exata = abertas.find(c => normalizar(c.name) === texto);
  if (exata) return exata;

  // 2. Se o nome da conta estiver contido no texto ou vice-versa
  // Ex: conta "Caixa" e texto "Caixa Físico" -> match!
  // Ex: conta "Banco BAI AKZ" e texto "BAI" -> match!
  const porInclusao = abertas.find(c => {
    const nomeConta = normalizar(c.name);
    return texto.includes(nomeConta) || (nomeConta.length > 3 && nomeConta.includes(texto));
  });
  if (porInclusao) return porInclusao;

  // 3. Pelo banco associado
  const porBanco = abertas.find(c => c.bank && texto.includes(normalizar(c.bank)));
  if (porBanco) return porBanco;

  // 4. Pelo tipo semântico (se tiver apenas 1 conta desse tipo)
  for (const { termos, tipo } of TERMOS_POR_TIPO) {
    if (termos.some(t => texto.includes(t))) {
      const candidatas = abertas.filter(c => c.type === tipo);
      if (candidatas.length === 1) return candidatas[0];
    }
  }

  return undefined;
}

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

  // 3. O tipo está implícito na palavra usada.
  for (const { termos, tipo } of TERMOS_POR_TIPO) {
    if (termos.some(t => texto.includes(t))) {
      const candidatas = abertas.filter(c => c.type === tipo);
      if (candidatas.length === 1) return candidatas[0];
      return undefined;
    }
  }

  // 4. Nenhuma pista no título e só existe uma conta: não há ambiguidade.
  return abertas.length === 1 ? abertas[0] : undefined;
}
