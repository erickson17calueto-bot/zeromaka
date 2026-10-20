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

type Regra = { termos: string[]; categoria: string | string[]; subcategoria?: string | string[] };

// A ordem importa: a primeira regra que casar ganha, por isso os termos mais
// específicos vêm antes dos genéricos ("água para limpeza" antes de "água",
// "manutenção da viatura" antes de "manutenção").
const REGRAS_DESPESA: Regra[] = [
  { termos: ["higiene", "detergente", "lixivia", "sanitario"], subcategoria: ["Material de limpeza", "Limpeza"], categoria: ["Administrativo", "Outras despesas", "Limpeza"] },
  { termos: ["limpeza"], subcategoria: ["Material de limpeza", "Limpeza"], categoria: ["Administrativo", "Outras despesas", "Limpeza"] },
  { termos: ["combustivel", "gasoleo", "gasolina", "abastecimento", "abastecer", "sonangol", "pumangol"], subcategoria: "Combustível", categoria: ["Operacional", "Combustível"] },

  { termos: ["manutencao da viatura", "manutencao do carro", "revisao do carro", "revisao da viatura", "troca de oleo", "pneu da viatura"], subcategoria: ["Manutenção de viaturas", "Manutenção de viatura"], categoria: ["Operacional", "Manutenção"] },
  { termos: ["taxi", "frete", "entrega de mercadoria", "entrega da mercadoria"], subcategoria: ["Entregas e logística", "Táxi e entregas"], categoria: ["Operacional", "Transporte"] },
  { termos: ["portagem", "estacionamento"], subcategoria: ["Portagens e estacionamento", "Portagens"], categoria: ["Operacional", "Transporte"] },
  { termos: ["custo com pessoal", "custo pessoal", "transporte de pessoal", "transporte pessoal", "transporte"], subcategoria: "Transporte de pessoal", categoria: ["Operacional", "Transporte"] },
  { termos: ["viagem", "deslocacao", "deslocação", "passagem"], subcategoria: "Viagens", categoria: ["Despesas Não Operacionais", "Transporte"] },

  { termos: ["saldo de voz", "saldo voz", "recarga", "unitel", "movicel", "africell", "telefone", "telemovel", "chamada"], subcategoria: ["Telefone e comunicações", "Telefone"], categoria: ["Administrativo", "Telecomunicações", "Comunicações"] },
  { termos: ["internet"], subcategoria: "Internet", categoria: ["Administrativo", "Telecomunicações", "Comunicações"] },
  { termos: ["dados moveis", "pacote de dados"], subcategoria: ["Telefone e comunicações", "Dados móveis"], categoria: ["Administrativo", "Telecomunicações", "Comunicações"] },
  { termos: ["software", "licenca de software", "assinatura de software", "subscricao"], subcategoria: ["Software e licenças", "Software"], categoria: ["Administrativo", "Telecomunicações", "Comunicações"] },
  { termos: ["comunicacao"], subcategoria: ["Telefone e comunicações", "Telefone"], categoria: ["Administrativo", "Telecomunicações", "Comunicações"] },

  { termos: ["salario", "ordenado", "remuneracao", "adiantamento salarial", "folha de pagamento"], subcategoria: "Salários", categoria: ["Pessoal", "Salários"] },
  { termos: ["subsidio", "subsidios", "subsidio de alimentacao", "subsidio de ferias", "subsidio de natal"], subcategoria: "Subsídios", categoria: ["Pessoal", "Salários"] },
  { termos: ["seguranca social", "inss"], subcategoria: "Segurança social (INSS)", categoria: ["Pessoal", "Impostos e Taxas", "Impostos"] },
  { termos: ["renda", "aluguer", "arrendamento", "aluguel"], subcategoria: ["Renda do escritório", "Renda"], categoria: ["Administrativo", "Renda"] },
  { termos: ["imposto", "iva", "irt", "agt", "imposto de selo", "selo", "multa fiscal"], subcategoria: "IVA", categoria: ["Impostos e Taxas", "Impostos"] },

  { termos: ["taxa bancaria", "comissao bancaria", "manutencao de conta", "despesa bancaria", "juro bancario"], subcategoria: ["Comissões bancárias", "Bancárias"], categoria: ["Despesas Financeiras", "Outras despesas"] },
  { termos: ["taxa de licenca", "licenca comercial", "alvara", "taxa municipal", "licenciamento"], subcategoria: ["Taxas municipais", "Taxas e licenças"], categoria: ["Impostos e Taxas", "Outras despesas"] },

  { termos: ["manutencao", "reparacao", "conserto", "revisao", "assistencia tecnica", "peca", "pneu"], subcategoria: "Reparações e manutenção", categoria: ["Administrativo", "Operacional", "Manutenção"] },

  { termos: ["mercadoria para revenda", "revenda"], subcategoria: ["Compra de mercadoria", "Mercadoria para revenda"], categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },
  { termos: ["consumivel operacionais", "consumiveis operacionais", "material de consumo"], subcategoria: "Consumíveis operacionais", categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },
  { termos: ["consumivel", "consumiveis"], subcategoria: ["Consumíveis operacionais", "Consumíveis"], categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },
  { termos: ["materia prima", "materia-prima"], subcategoria: ["Compra de matéria-prima", "Matéria-prima"], categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },
  { termos: ["embalagem", "embalagens", "saco plastico", "caixa de papelao"], subcategoria: ["Embalagens"], categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },
  { termos: ["fornecedor", "compra de mercadoria", "compra de material", "stock", "aquisicao de mercadoria"], subcategoria: "Compra de mercadoria", categoria: ["Operacional", "Compra de mercadorias", "Fornecedores"] },

  { termos: ["computador", "portatil", "laptop", "impressora", "monitor"], subcategoria: ["Equipamentos informáticos", "Computadores"], categoria: ["Administrativo", "Equipamento"] },
  { termos: ["mobiliario", "mesa de escritorio", "cadeira de escritorio", "estante", "armario"], subcategoria: ["Mobiliário"], categoria: ["Administrativo", "Equipamento"] },
  { termos: ["ferramenta", "ferramentas", "equipamento de trabalho"], subcategoria: ["Equipamentos informáticos", "Ferramentas"], categoria: ["Administrativo", "Equipamento"] },

  { termos: ["agua", "água", "epal"], subcategoria: ["Água (EPAL)", "Água"], categoria: ["Administrativo", "Alimentação", "Outras despesas"] },
  { termos: ["luz", "energia", "electricidade", "eletricidade", "ende"], subcategoria: "Eletricidade (ENDE)", categoria: ["Administrativo", "Outras despesas"] },
  { termos: ["tia da limpeza", "limpeza escritorio", "limpeza de escritorio", "faxina"], subcategoria: ["Material de limpeza", "Limpeza"], categoria: ["Administrativo", "Outras despesas", "Salários", "Limpeza"] },
  { termos: ["escritorio", "escritório", "material de escritorio"], subcategoria: ["Material de escritório", "Consumíveis"], categoria: ["Administrativo", "Compra de mercadorias", "Outras despesas", "Equipamento"] },
  { termos: ["diversos", "despesa diversa"], subcategoria: "Diversos", categoria: ["Despesas Não Operacionais", "Outras despesas"] },
];

const REGRAS_RECEITA: Regra[] = [
  { termos: ["comissao", "comissão", "comissoes", "comissões"], subcategoria: ["Comissões recebidas", "Comissões"], categoria: ["Receita Operacional", "Comissões"] },
  { termos: ["juro", "juros", "rendimento financeiro"], subcategoria: ["Juros recebidos", "Juros"], categoria: ["Receita Não Operacional", "Juros"] },
  { termos: ["venda", "vendas", "mercadoria vendida", "factura de venda", "fatura de venda"], subcategoria: ["Venda de mercadoria", "Vendas de mercadoria"], categoria: ["Receita Operacional", "Vendas de mercadoria", "Vendas de produtos"] },
  { termos: ["servico", "serviço", "servicos", "serviços", "prestacao", "honorario", "consultoria", "empreitada"], subcategoria: "Prestação de serviços", categoria: ["Receita Operacional", "Prestação de serviços"] },
  { termos: ["recebimento", "cobranca", "cobrança", "deposito", "entrada de valores", "entrada", "requisicao de caixa", "aporte", "emprestimo", "capital"], subcategoria: "Outros rendimentos", categoria: ["Receita Operacional", "Receita Não Operacional", "Outros recebimentos"] },
];

/**
 * Devolve a categoria (ou subcategoria, quando a organização a tiver) que melhor
 * corresponde à descrição.
 */
export function suggestCategory<T extends CategoriaSugerivel>(
  categorias: T[],
  descricao: string | null | undefined,
  direcao: "income" | "expense",
): T | undefined {
  const texto = normalizar(descricao || "");
  if (!texto) return undefined;
  const tokens = ` ${texto.replace(/[^a-z0-9]+/g, " ").trim()} `;
  const contem = (termo: string) => tokens.includes(` ${normalizar(termo).replace(/[^a-z0-9]+/g, " ").trim()} `);

  const regras = direcao === "income" ? REGRAS_RECEITA : REGRAS_DESPESA;
  const disponiveis = categorias.filter(c => c.isActive !== false && c.categoryType === direcao);
  if (!disponiveis.length) return undefined;

  for (const { termos, categoria, subcategoria } of regras) {
    if (!termos.some(contem)) continue;

    if (subcategoria) {
      const subs = Array.isArray(subcategoria) ? subcategoria : [subcategoria];
      // 1. Correspondência exata em qualquer uma das subcategorias candidatas
      for (const sub of subs) {
        const subNorm = normalizar(sub);
        const encontrada = disponiveis.find(c => normalizar(c.name) === subNorm);
        if (encontrada) return encontrada;
      }
      // 2. Nome da categoria existente contém a subcategoria
      for (const sub of subs) {
        const subNorm = normalizar(sub);
        const encontrada = disponiveis.find(c => normalizar(c.name).includes(subNorm));
        if (encontrada) return encontrada;
      }
      // 3. Subcategoria procurada contém o nome de uma subcategoria existente (filha)
      for (const sub of subs) {
        const subNorm = normalizar(sub);
        const encontrada = disponiveis.find(c => Boolean(c.parentId) && subNorm.includes(normalizar(c.name)));
        if (encontrada) return encontrada;
      }
    }

    const candidatos = Array.isArray(categoria) ? categoria : [categoria];
    for (const nome of candidatos) {
      const nNorm = normalizar(nome);
      const encontrada = disponiveis.find(c => normalizar(c.name) === nNorm)
        || disponiveis.find(c => normalizar(c.name).includes(nNorm) || nNorm.includes(normalizar(c.name)));
      if (encontrada) return encontrada;
    }
  }

  // Também reconhece categorias criadas pela própria organização, sem exigir
  // uma regra fixa no código. Só aceita uma correspondência inequívoca.
  const correspondentes = disponiveis.filter(c => {
    const nome = normalizar(c.name).replace(/[^a-z0-9]+/g, " ").trim();
    return nome.length >= 4 && tokens.includes(` ${nome} `);
  });
  if (correspondentes.length === 1) return correspondentes[0];

  return undefined;
}
