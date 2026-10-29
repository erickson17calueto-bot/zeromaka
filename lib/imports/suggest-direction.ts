import { normalizar } from "./suggest-account";

// Palavras e frases que caracterizam despesas num diário de caixa / extrato
const TERMOS_DESPESA = [
  // Transportes e deslocações
  "transporte", "taxi", "táxi", "frete", "deslocacao", "deslocação", "passagem", "viagem",
  "combustivel", "combustível", "gasoleo", "gasóleo", "gasolina", "abastecimento", "abastecer",
  "pumangol", "sonangol", "portagem", "estacionamento", "revisao", "revisão", "oficina",
  "troca de oleo", "troca de óleo", "pneu", "manutencao", "manutenção", "conserto",

  // Pessoal e RH
  "custo com pessoal", "custo pessoal", "salario", "salário", "ordenado", "remuneracao", "remuneração",
  "subsidio", "subsídio", "adiantamento", "diaria", "diária", "alimentacao", "alimentação",
  "almoco", "almoço", "jantar", "lanche", "refeicao", "refeição", "refeicoes", "refeições",

  // Fornecedores e compras
  "compra", "compras", "aquisicao", "aquisição", "fornecedor", "mercadoria", "materia prima", "matéria-prima",
  "material", "consumiveis", "consumíveis", "peca", "peça", "pecas", "peças", "ferramenta", "ferramentas",
  "equipamento", "computador", "laptop", "impressora", "mobiliario", "mobiliário", "escritorio", "escritório",
  "embalagem", "embalagens", "saco",

  // Serviços e utilitários
  "agua", "água", "epal", "energia", "electricidade", "eletricidade", "ende", "prodel",
  "comunicacao", "comunicação", "telefone", "telemovel", "telemóvel", "saldo de voz", "saldo voz",
  "recarga", "unitel", "movicel", "africell", "internet", "zap", "dstv", "dados moveis", "dados móveis",
  "software", "licenca", "licença", "assinatura", "subscricao", "subscrição",

  // Rendas, taxas e impostos
  "renda", "aluguer", "arrendamento", "aluguel",
  "imposto", "impostos", "iva", "irt", "agt", "inss", "seguranca social", "segurança social",
  "imposto de selo", "taxa", "taxas", "licenca comercial", "licença comercial", "alvara", "alvará",
  "multa", "emolumento", "comissao bancaria", "comissão bancária", "taxa bancaria", "taxa bancária",
  "manutencao de conta", "manutenção de conta",

  // Higiene e outros
  "limpeza", "higiene", "detergente", "lixivia", "lixívia", "sanitario", "sanitário",
  "despesa", "gasto", "pagamento", "liquidacao", "liquidação", "saida", "saída"
];

// Palavras e frases que caracterizam receitas
const TERMOS_RECEITA = [
  "venda", "vendas", "fatura de venda", "factura de venda", "prestacao de servico", "prestação de serviço",
  "servico prestado", "serviço prestado", "honorario", "honorário", "consultoria",
  "recebimento", "recebimentos", "cobrança", "cobranca",
  "entrada de valores", "entrada de caixa", "deposito de cliente", "depósito de cliente",
  "comissao recebida", "comissão recebida", "rendimento", "juro recebido",
  "receita", "receitas"
];

/**
 * Infere a direção (income vs expense) a partir do texto da descrição.
 * Retorna undefined se não houver pista clara ou se houver ambiguidade.
 */
export function suggestDirection(description: string | null | undefined): "income" | "expense" | undefined {
  const texto = normalizar(description || "");
  if (!texto) return undefined;

  const tokens = ` ${texto.replace(/[^a-z0-9]+/g, " ").trim()} `;
  const contem = (termo: string) => tokens.includes(` ${normalizar(termo).replace(/[^a-z0-9]+/g, " ").trim()} `);
  // O verbo da operação prevalece sobre o nome da entidade: receber de uma
  // operadora é entrada, pagar por consultoria é saída.
  const entradaExplicita = ["recebimento", "recebido de", "cobranca", "deposito de cliente", "reembolso recebido", "entrada de valores"].some(contem);
  const saidaExplicita = ["pagamento", "pago a", "pago ao", "liquidacao", "desembolso", "saida de valores", "despesa com"].some(contem);
  if (entradaExplicita !== saidaExplicita) return entradaExplicita ? "income" : "expense";
  if (entradaExplicita && saidaExplicita) return undefined;

  const ehDespesa = TERMOS_DESPESA.some(contem);
  const ehReceita = TERMOS_RECEITA.some(contem);

  // Se ambos baterem (conflito) ou nenhum bater, não forçar decisão
  if (ehDespesa && !ehReceita) return "expense";
  if (ehReceita && !ehDespesa) return "income";

  return undefined;
}
