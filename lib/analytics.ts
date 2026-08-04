// Eventos de produto.
//
// Regra que molda todo este ficheiro: nunca sai daqui um dado que identifique
// uma pessoa ou revele um número do negócio. Em vez de filtrar isso em tempo de
// execução — o que falha em silêncio quando alguém se engana — cada evento
// declara exatamente que propriedades aceita, e todas são valores de um conjunto
// fechado. Não há como passar um e-mail, um NIF ou um saldo sem o TypeScript
// recusar.
//
// Não há nenhum fornecedor externo ligado. Enquanto `provider` for null os
// eventos ficam só no browser, em modo de desenvolvimento. Ligar um fornecedor
// é uma decisão deliberada — e implica rever o aviso de cookies antes.

export type Origem = "header" | "hero" | "rodape" | "precos" | "funcionalidades" | "ajuda" | "sobre";
export type Plano = "solo" | "equipa" | "contabilista";

/** Cada evento e as propriedades que aceita. Só valores de conjuntos fechados. */
export type Eventos = {
  pagina_vista: { caminho: string };
  cta_criar_conta: { origem: Origem };
  precos_visto: Record<string, never>;
  plano_escolhido: { plano: Plano };
  registo_iniciado: Record<string, never>;
  registo_concluido: Record<string, never>;
  onboarding_iniciado: Record<string, never>;
  onboarding_etapa: { etapa: 1 | 2 | 3 | 4 | 5 | 6 };
  onboarding_concluido: { com_saldo_inicial: boolean; com_contactos: boolean };
  primeira_conta_criada: { tipo: "bank" | "mobile_money" | "cash" };
};

export type NomeEvento = keyof Eventos;

type Envio = <E extends NomeEvento>(evento: E, props: Eventos[E]) => void;

/**
 * Destino dos eventos. Fica null de propósito: sem fornecedor configurado não
 * se envia nada para lado nenhum.
 */
let provider: Envio | null = null;

/** Liga um destino. Chamar apenas depois de haver base legal para o fazer. */
export function setAnalyticsProvider(fn: Envio | null) {
  provider = fn;
}

export function track<E extends NomeEvento>(evento: E, props: Eventos[E] = {} as Eventos[E]) {
  if (provider) {
    try {
      provider(evento, props);
    } catch {
      // Analytics nunca pode partir a aplicação.
    }
    return;
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", evento, props);
  }
}
