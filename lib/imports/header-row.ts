// Encontrar a linha de cabeçalho de uma folha de cálculo.
//
// Assumir que o cabeçalho é sempre a primeira linha falha em folhas reais, que
// começam por títulos, totais ou linhas em branco antes da tabela. Quando isso
// acontece, os cabeçalhos saem errados e TODAS as linhas do ficheiro ficam sem
// data, valor e descrição — o utilizador vê um ficheiro "que não foi lido".

import { normalizar } from "./suggest-account";

// Palavras que aparecem em cabeçalhos de extratos e diários de caixa. Não é a
// lista de alias usada para mapear campos (essa vive na página de importação);
// serve só para reconhecer que uma linha É um cabeçalho.
const PALAVRAS_CABECALHO = [
  "data", "date", "valor", "amount", "montante", "total",
  "descricao", "description", "historico", "detalhe", "movimento",
  "entrada", "saida", "credito", "debito", "haver", "deve",
  "conta", "account", "categoria", "tipo", "saldo", "balance",
  "fatura", "factura", "documento", "referencia", "cliente", "fornecedor",
  "emissao", "vencimento",
];

function pontuacao(linha: string[]): number {
  const celulas = linha.map(c => normalizar(c || "")).filter(Boolean);
  if (celulas.length < 2) return 0;
  return celulas.filter(c => PALAVRAS_CABECALHO.some(p => c === p || c.includes(p))).length;
}

/**
 * Índice da linha que serve de cabeçalho. Procura nas primeiras `limite` linhas
 * a que tem mais palavras de cabeçalho reconhecidas; empate resolve-se pela mais
 * acima. Sem nenhuma candidata devolve 0 — o comportamento antigo, que continua
 * certo para a maioria dos ficheiros.
 */
export function encontrarLinhaCabecalho(matriz: string[][], limite = 15): number {
  let melhorIndice = 0;
  let melhorPontuacao = 0;
  const ate = Math.min(matriz.length, limite);
  for (let i = 0; i < ate; i++) {
    const p = pontuacao(matriz[i]);
    if (p > melhorPontuacao) { melhorPontuacao = p; melhorIndice = i; }
  }
  // Uma única palavra reconhecida não chega para afirmar que a linha é um
  // cabeçalho — pode ser um título ("DIÁRIO DE CAIXA") ou uma linha de total.
  return melhorPontuacao >= 2 ? melhorIndice : 0;
}
