// Configuração de planos.
//
// O ZeroMaka está gratuito durante o lançamento. Quando os preços forem
// definidos basta pôr LANCAMENTO_GRATUITO a false e preencher `preco` em cada
// plano — as páginas leem daqui e não têm valores escritos à mão.

export const LANCAMENTO_GRATUITO = true;

export type Plano = {
  id: "solo" | "equipa" | "contabilista";
  nome: string;
  publico: string;
  descricao: string;
  /** Preço mensal em Kwanzas. null enquanto não estiver definido. */
  preco: number | null;
  destaque?: boolean;
  inclui: string[];
  cta: string;
};

export const PLANOS: Plano[] = [
  {
    id: "solo",
    nome: "Solo",
    publico: "Empresários individuais",
    descricao: "Para quem gere o negócio sozinho e quer parar de usar folhas de Excel.",
    preco: null,
    inclui: [
      "1 utilizador",
      "1 empresa",
      "Contas, receitas e despesas",
      "Contas a receber e a pagar",
      "Reservas e Disponível de verdade",
      "Relatórios em PDF e Excel",
      "Importação de Excel, CSV e PDF",
    ],
    cta: "Começar gratuitamente",
  },
  {
    id: "equipa",
    nome: "Equipa",
    publico: "Empresas com funcionários",
    descricao: "Para quem já delega lançamentos e precisa de aprovar despesas antes de sair dinheiro.",
    preco: null,
    destaque: true,
    inclui: [
      "Vários utilizadores",
      "1 empresa",
      "Tudo o que o Solo inclui",
      "Requisições com aprovação",
      "Papéis e permissões por membro",
      "Capital dos sócios",
      "Histórico de alterações",
    ],
    cta: "Começar gratuitamente",
  },
  {
    id: "contabilista",
    nome: "Contabilista",
    publico: "Profissionais com várias empresas",
    descricao: "Para quem acompanha a contabilidade de vários clientes ao mesmo tempo.",
    preco: null,
    inclui: [
      "Vários utilizadores",
      "Várias empresas",
      "Tudo o que o Equipa inclui",
      "Troca rápida entre empresas",
      "Fecho de período e governança",
      "Exportação por empresa",
    ],
    cta: "Falar connosco",
  },
];

export type LinhaComparacao = {
  recurso: string;
  solo: string | boolean;
  equipa: string | boolean;
  contabilista: string | boolean;
};

export const COMPARACAO: LinhaComparacao[] = [
  { recurso: "Utilizadores", solo: "1", equipa: "Vários", contabilista: "Vários" },
  { recurso: "Empresas", solo: "1", equipa: "1", contabilista: "Várias" },
  { recurso: "Contas, receitas e despesas", solo: true, equipa: true, contabilista: true },
  { recurso: "Contas a receber e a pagar", solo: true, equipa: true, contabilista: true },
  { recurso: "Cobranças", solo: true, equipa: true, contabilista: true },
  { recurso: "Reservas e Disponível de verdade", solo: true, equipa: true, contabilista: true },
  { recurso: "Previsão de caixa", solo: true, equipa: true, contabilista: true },
  { recurso: "Relatórios PDF e Excel", solo: true, equipa: true, contabilista: true },
  { recurso: "Importação de ficheiros", solo: true, equipa: true, contabilista: true },
  { recurso: "Requisições com aprovação", solo: false, equipa: true, contabilista: true },
  { recurso: "Papéis e permissões", solo: false, equipa: true, contabilista: true },
  { recurso: "Capital dos sócios", solo: false, equipa: true, contabilista: true },
  { recurso: "Fecho de período e governança", solo: false, equipa: true, contabilista: true },
  { recurso: "Troca entre várias empresas", solo: false, equipa: false, contabilista: true },
  { recurso: "Suporte", solo: "Por e-mail", equipa: "Por e-mail", contabilista: "Prioritário" },
];
