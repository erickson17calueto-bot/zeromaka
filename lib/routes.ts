// Fonte única de verdade para rotas e para a decisão de redirecionamento.
//
// Porquê centralizar: a proteção anterior era uma lista de rotas públicas, o que
// significa que cada página privada nova ficava exposta se alguém se esquecesse
// de a acrescentar. Aqui a app inteira vive sob um prefixo (/app) e é privada por
// omissão — esquecer-se de algo falha para o lado seguro.

export const ROUTES = {
  home: "/",
  entrar: "/entrar",
  criarConta: "/criar-conta",
  recuperarSenha: "/recuperar-senha",
  redefinirSenha: "/redefinir-senha",
  onboarding: "/onboarding",
  dashboard: "/app/dashboard",
} as const;

/** Prefixo de tudo o que exige sessão. Privado por omissão. */
export const APP_PREFIX = "/app";

/**
 * Ecrãs de autenticação: acessíveis sem sessão, mas não com sessão.
 *
 * /redefinir-senha fica deliberadamente de fora: o link de recuperação cria uma
 * sessão antes de o utilizador escolher a nova palavra-passe, por isso expulsá-lo
 * por "já estar autenticado" quebraria exatamente o fluxo que tem de funcionar.
 */
export const AUTH_ROUTES: string[] = [
  ROUTES.entrar,
  ROUTES.criarConta,
  ROUTES.recuperarSenha,
];

/** Páginas de marketing e institucionais — sempre públicas e indexáveis. */
export const PUBLIC_ROUTES: string[] = [
  "/",
  "/funcionalidades",
  "/precos",
  "/seguranca",
  "/sobre",
  "/contacto",
  "/ajuda",
  "/termos",
  "/privacidade",
];

/**
 * Caminhos que o middleware nunca deve tocar: ficheiros servidos a crawlers e a
 * troca de código do Supabase, que precisa de correr antes de existir sessão.
 */
export const BYPASS_PREFIXES: string[] = ["/auth/callback", "/robots.txt", "/sitemap.xml", "/api"];

export function isAppPath(path: string): boolean {
  return path === APP_PREFIX || path.startsWith(APP_PREFIX + "/");
}

export function isAuthPath(path: string): boolean {
  return AUTH_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

export function isOnboardingPath(path: string): boolean {
  return path === ROUTES.onboarding || path.startsWith(ROUTES.onboarding + "/");
}

export function shouldBypass(path: string): boolean {
  return BYPASS_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Só aceita caminhos internos. Bloqueia open redirects: URLs absolutas
 * ("https://mau.com"), protocol-relative ("//mau.com") e barras invertidas que
 * alguns browsers normalizam para "/".
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.includes("\\")) return null;
  if (isAuthPath(next) || isOnboardingPath(next)) return null;
  return next;
}

export type SessionState = {
  /** Existe utilizador autenticado e validado no servidor. */
  hasSession: boolean;
  /**
   * O utilizador já tem organização — ou seja, concluiu o onboarding.
   * "unknown" é usado pelo middleware, que verifica apenas a sessão para não
   * pagar uma segunda ida à base de dados em cada pedido. Nesse caso a decisão
   * sobre a organização é adiada para o layout de /app, que já corre no servidor.
   */
  hasOrg: boolean | "unknown";
};

/**
 * Decide para onde um pedido deve ir. Devolve null quando o pedido pode seguir.
 * Função pura, para poder ser testada sem browser nem base de dados.
 */
export function decideRedirect(path: string, state: SessionState): string | null {
  if (shouldBypass(path)) return null;

  const { hasSession, hasOrg } = state;

  if (!hasSession) {
    // Sem sessão só a área pública e os ecrãs de autenticação são acessíveis.
    if (isAppPath(path)) return `${ROUTES.entrar}?next=${encodeURIComponent(path)}`;
    if (isOnboardingPath(path)) return ROUTES.entrar;
    return null;
  }

  if (hasOrg === false) {
    // Autenticado mas sem organização: tem de terminar o onboarding primeiro.
    if (isAuthPath(path)) return ROUTES.onboarding;
    if (isAppPath(path)) return ROUTES.onboarding;
    return null;
  }

  if (hasOrg === "unknown") {
    // Só sabemos que há sessão. Os ecrãs de autenticação deixam de fazer sentido;
    // /app e /onboarding seguem e decidem no servidor com dados reais.
    if (isAuthPath(path)) return ROUTES.dashboard;
    return null;
  }

  // Sessão completa: os ecrãs de entrada e o onboarding deixam de fazer sentido.
  if (isAuthPath(path)) return ROUTES.dashboard;
  if (isOnboardingPath(path)) return ROUTES.dashboard;
  return null;
}
