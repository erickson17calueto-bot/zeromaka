// Adivinhar a categoria de um movimento importado a partir da descrição.
//
// Extratos e diários de caixa reais não trazem coluna de categoria: trazem uma
// descrição escrita à mão ("COMBUSTÍVEL", "SALDO DE VOZ CHARUMBO", "ABASTECIMENTO
// DA CARRINHA (GASÓLEO)"). Sem esta ajuda, categorizar um ficheiro com centenas de
// linhas seria trabalho manual linha a linha — e sem categorias os relatórios de
// despesa por rubrica ficam vazios.
//
// É sempre uma sugestão: aparece no seletor de categoria de cada linha, na revisão,
// e pode ser trocada ou limpa antes de lançar. Só é aplicada quando o ficheiro não
// traz categoria própria — uma coluna explícita no ficheiro manda sempre.
//
// Algumas regras também sugerem uma SUBCATEGORIA (ex: "Combustível" dentro de
// "Transporte"). Organizações antigas só têm as categorias planas originais —
// por isso cada regra tenta primeiro a subcategoria mais específica e, se a
// organização não a tiver, recua para um dos nomes de categoria "pai"
// conhecidos (uma organização pode ter "Telecomunicações", outra a mais nova
// "Comunicações"). Isto significa que o resultado nunca piora para uma
// organização já existente — só melhora para quem tiver a hierarquia.

import { normalizar } from "./suggest-account";

export type CategoriaSugerivel = {
  id: string;
  name: string;
  categoryType: "income" | "expense";
  isActive?: boolean;
  parentId?: string | null;
};

type Regra = { termos: string[]; categoria: string | string[]; subcategoria?: string };

// A ordem importa: a primeira regra que casar ganha, por isso os termos mais
// específicos vêm antes dos genéricos ("água para limpeza" antes de "água",
// "manutenção da viatura" antes de "manutenção").
const REGRAS_DESPESA: Regra[] = [
  { termos: ["higiene", "detergente", "lixivia", "sanitario"], subcategoria: "Limpeza", categoria: "Outras despesas" },
  { termos: ["limpeza"], subcategoria: "Limpeza", categoria: "Outras despesas" },
  { termos: ["combustivel", "gasoleo", "gasolina", "abastecimento", "abastecer", "sonangol", "pumangol"], subcategoria: "Combustível", categoria: "Combustível" },

  { termos: ["manutencao da viatura", "manutencao do carro", "revisao do carro", "revisao da viatura", "troca de oleo", "pneu da viatura"], subcategoria: "Manutenção de viatura", categoria: "Manutenção" },
  { termos: ["taxi", "frete", "entrega de mercadoria", "entrega da mercadoria"], subcategoria: "Táxi e entregas", categoria: "Transporte" },
  { termos: ["portagem", "estacionamento"], subcategoria: "Portagens", categoria: "Transporte" },
  { termos: ["transporte", "viagem", "deslocacao", "passagem"], categoria: "Transporte" },

  { termos: ["saldo de voz", "saldo voz", "recarga", "unitel", "movicel", "africell", "telefone", "telemovel", "chamada"], subcategoria: "Telefone", categoria: ["Comunicações", "Telecomunicações"] },
  { termos: ["internet"], subcategoria: "Internet", categoria: ["Comunicações", "Telecomunicações"] },
  { termos: ["dados moveis", "pacote de dados"], subcategoria: "Dados móveis", categoria: ["Comunicações", "Telecomunicações"] },
  { termos: ["software", "licenca de software", "assinatura de software", "subscricao"], subcategoria: "Software", categoria: ["Comunicações", "Telecomunicações"] },
  { termos: ["comunicacao"], categoria: ["Comunicações", "Telecomunicações"] },

  { termos: ["salario", "ordenado", "remuneracao", "subsidio", "adiantamento salarial", "folha de pagamento"], categoria: "Salários" },
  { termos: ["renda", "aluguer", "arrendamento", "aluguel"], categoria: "Renda" },
  { termos: ["imposto", "iva", "irt", "agt", "imposto de selo", "selo", "inss", "seguranca social", "multa fiscal"], categoria: "Impostos" },

  { termos: ["manutencao", "reparacao", "conserto", "revisao", "assistencia tecnica", "peca", "pneu"], categoria: "Manutenção" },

  { termos: ["mercadoria para revenda", "revenda"], subcategoria: "Mercadoria para revenda", categoria: ["Compra de mercadorias", "Fornecedores"] },
  { termos: ["consumivel", "consumiveis", "material de consumo"], subcategoria: "Consumíveis", categoria: ["Compra de mercadorias", "Fornecedores"] },
  { termos: ["materia prima", "materia-prima"], subcategoria: "Matéria-prima", categoria: ["Compra de mercadorias", "Fornecedores"] },
  { termos: ["embalagem", "embalagens", "saco plastico", "caixa de papelao"], subcategoria: "Embalagens", categoria: ["Compra de mercadorias", "Fornecedores"] },
  { termos: ["fornecedor", "compra de mercadoria", "compra de material", "stock", "aquisicao de mercadoria"], categoria: ["Compra de mercadorias", "Fornecedores"] },

  { termos: ["computador", "portatil", "laptop", "impressora", "monitor"], subcategoria: "Computadores", categoria: "Equipamento" },
  { termos: ["mobiliario", "mesa de escritorio", "cadeira de escritorio", "estante", "armario"], subcategoria: "Mobiliário", categoria: "Equipamento" },
  { termos: ["ferramenta", "ferramentas", "equipamento de trabalho"], subcategoria: "Ferramentas", categoria: "Equipamento" },

  { termos: ["taxa bancaria", "comissao bancaria", "manutencao de conta", "despesa bancaria", "juro bancario"], subcategoria: "Bancárias", categoria: "Outras despesas" },
  { termos: ["taxa de licenca", "licenca comercial", "alvara", "taxa municipal", "licenciamento"], subcategoria: "Taxas e licenças", categoria: "Outras despesas" },

  { termos: ["alimentacao", "almoco", "jantar", "lanche", "refeicao", "comida", "agua", "cafe", "restaurante"], categoria: "Alimentação" },

  { termos: ["diversos", "despesa diversa"], subcategoria: "Diversos", categoria: "Outras despesas" },
];

const REGRAS_RECEITA: Regra[] = [
  { termos: ["comissao"], categoria: "Comissões" },
  { termos: ["juro", "rendimento financeiro"], categoria: "Juros" },
  { termos: ["venda", "vendas", "mercadoria vendida", "factura de venda", "fatura de venda"], categoria: "Vendas de mercadoria" },
  { termos: ["servico", "prestacao", "honorario", "consultoria", "empreitada"], categoria: "Prestação de serviços" },
  { termos: ["recebimento", "cobranca", "deposito", "entrada de valores", "requisicao de caixa", "aporte", "emprestimo", "capital"], categoria: "Outros recebimentos" },
];

/**
 * Devolve a categoria (ou subcategoria, quando a organização a tiver) que melhor
 * corresponde à descrição, ou `undefined` quando nenhuma regra casa ou nenhum
 * dos nomes candidatos existe nesta organização (as categorias são semeadas por
 * `seed_default_categories`, mas o utilizador pode renomeá-las ou desativá-las).
 */
export function suggestCategory<T extends CategoriaSugerivel>(
  categorias: T[],
  descricao: string | null | undefined,
  direcao: "income" | "expense",
): T | undefined {
  const texto = normalizar(descricao || "");
  if (!texto) return undefined;

  const regras = direcao === "income" ? REGRAS_RECEITA : REGRAS_DESPESA;
  const disponiveis = categorias.filter(c => c.isActive !== false && c.categoryType === direcao);
  if (!disponiveis.length) return undefined;

  for (const { termos, categoria, subcategoria } of regras) {
    if (!termos.some(t => texto.includes(t))) continue;

    if (subcategoria) {
      const encontrada = disponiveis.find(c => normalizar(c.name) === normalizar(subcategoria));
      if (encontrada) return encontrada;
    }

    const candidatos = Array.isArray(categoria) ? categoria : [categoria];
    for (const nome of candidatos) {
      const encontrada = disponiveis.find(c => normalizar(c.name) === normalizar(nome));
      if (encontrada) return encontrada;
    }

    // A regra casou mas a organização não tem nenhum dos nomes candidatos
    // (renomeados ou desativados). Não vale tentar a regra seguinte: daria uma
    // categoria errada só porque a certa não existe — melhor deixar em branco.
    return undefined;
  }
  return undefined;
}
