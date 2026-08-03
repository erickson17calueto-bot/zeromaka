import test from "node:test";
import assert from "node:assert/strict";
import { decideRedirect, safeNext, ROUTES } from "../.test-build/routes.js";

const SEM_SESSAO = { hasSession: false, hasOrg: false };
const SESSAO_SEM_ORG = { hasSession: true, hasOrg: false };
const SESSAO_COMPLETA = { hasSession: true, hasOrg: true };
const MIDDLEWARE = { hasSession: true, hasOrg: "unknown" };

test("visitante sem sessão pode ver as páginas públicas", () => {
  for (const p of ["/", "/precos", "/funcionalidades", "/seguranca", "/sobre", "/ajuda", "/termos", "/privacidade"]) {
    assert.equal(decideRedirect(p, SEM_SESSAO), null, `${p} devia ser público`);
  }
});

test("visitante sem sessão não entra na aplicação e guarda o destino", () => {
  assert.equal(decideRedirect("/app/dashboard", SEM_SESSAO), "/entrar?next=%2Fapp%2Fdashboard");
  assert.equal(decideRedirect("/app/contas", SEM_SESSAO), "/entrar?next=%2Fapp%2Fcontas");
});

test("visitante sem sessão não entra no onboarding", () => {
  assert.equal(decideRedirect("/onboarding", SEM_SESSAO), ROUTES.entrar);
});

test("utilizador sem organização é levado ao onboarding", () => {
  assert.equal(decideRedirect("/app/dashboard", SESSAO_SEM_ORG), ROUTES.onboarding);
  assert.equal(decideRedirect("/entrar", SESSAO_SEM_ORG), ROUTES.onboarding);
  assert.equal(decideRedirect("/criar-conta", SESSAO_SEM_ORG), ROUTES.onboarding);
});

test("utilizador com organização vai para o dashboard em vez dos ecrãs de entrada", () => {
  assert.equal(decideRedirect("/entrar", SESSAO_COMPLETA), ROUTES.dashboard);
  assert.equal(decideRedirect("/criar-conta", SESSAO_COMPLETA), ROUTES.dashboard);
  assert.equal(decideRedirect("/onboarding", SESSAO_COMPLETA), ROUTES.dashboard);
  assert.equal(decideRedirect("/app/contas", SESSAO_COMPLETA), null);
});

test("middleware sem saber da organização deixa /app e /onboarding decidirem no servidor", () => {
  assert.equal(decideRedirect("/app/dashboard", MIDDLEWARE), null);
  assert.equal(decideRedirect("/onboarding", MIDDLEWARE), null);
  assert.equal(decideRedirect("/entrar", MIDDLEWARE), ROUTES.dashboard);
});

test("a recuperação de palavra-passe funciona mesmo já com sessão", () => {
  // O link de recuperação cria sessão antes desta página; expulsar o utilizador
  // por "já estar autenticado" quebraria o fluxo.
  assert.equal(decideRedirect("/redefinir-senha", SESSAO_COMPLETA), null);
  assert.equal(decideRedirect("/redefinir-senha", SEM_SESSAO), null);
});

test("robots, sitemap e callback nunca são redirecionados", () => {
  for (const p of ["/robots.txt", "/sitemap.xml", "/auth/callback", "/api/contacto"]) {
    assert.equal(decideRedirect(p, SEM_SESSAO), null, `${p} devia passar`);
    assert.equal(decideRedirect(p, SESSAO_COMPLETA), null, `${p} devia passar`);
  }
});

test("safeNext rejeita open redirects", () => {
  assert.equal(safeNext("https://malicioso.com"), null, "URL absoluta");
  assert.equal(safeNext("//malicioso.com"), null, "protocol-relative");
  assert.equal(safeNext("http://malicioso.com"), null, "http absoluto");
  assert.equal(safeNext("/\\malicioso.com"), null, "barra invertida");
  assert.equal(safeNext("javascript:alert(1)"), null, "esquema javascript");
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(""), null);
});

test("safeNext aceita destinos internos e recusa voltar aos ecrãs de entrada", () => {
  assert.equal(safeNext("/app/contas"), "/app/contas");
  assert.equal(safeNext("/app/relatorios"), "/app/relatorios");
  assert.equal(safeNext("/entrar"), null, "evita ciclo de redirecionamento");
  assert.equal(safeNext("/onboarding"), null);
});

test("uma página nova dentro de /app é privada por omissão", () => {
  // Regressão: com a lista de exceções antiga, uma rota nova ficava pública
  // se alguém se esquecesse de a acrescentar.
  assert.equal(decideRedirect("/app/pagina-que-ainda-nao-existe", SEM_SESSAO), "/entrar?next=%2Fapp%2Fpagina-que-ainda-nao-existe");
});
