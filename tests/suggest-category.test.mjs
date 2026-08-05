import test from "node:test";
import assert from "node:assert/strict";
import { suggestCategory } from "../.test-build/imports/suggest-category.js";

// Categorias semeadas por seed_default_categories (docs/005-financial-engine.md).
const DESPESAS = [
  "Alimentação", "Combustível", "Fornecedores", "Impostos", "Manutenção",
  "Outras despesas", "Renda", "Salários", "Telecomunicações", "Transporte",
].map((name, i) => ({ id: "d" + i, name, categoryType: "expense" }));

const RECEITAS = [
  "Comissões", "Juros", "Outros recebimentos", "Prestação de serviços", "Vendas de mercadoria",
].map((name, i) => ({ id: "r" + i, name, categoryType: "income" }));

const TODAS = [...DESPESAS, ...RECEITAS];

const nomeSugerido = (descricao, direcao = "expense") =>
  suggestCategory(TODAS, descricao, direcao)?.name;

// Descrições retiradas do ficheiro real "DIARIO DE CAIXA 1.xlsx".
test("descrições reais do diário de caixa caem na categoria certa", () => {
  assert.equal(nomeSugerido("COMBUSTÍVEL"), "Combustível");
  assert.equal(nomeSugerido("ABASTECIMENTO DA CARRINHA ( GASÓLEO)"), "Combustível");
  assert.equal(nomeSugerido("SALDO DE VOZ DR. PEDRO CAPANGO"), "Telecomunicações");
  assert.equal(nomeSugerido("SALDO DE VOZ CHARUMBO"), "Telecomunicações");
  assert.equal(nomeSugerido("COMUNICAÇÃO"), "Telecomunicações");
  assert.equal(nomeSugerido("TRANSPORTE P/LEVAR PC"), "Transporte");
  assert.equal(nomeSugerido("CUSTO COM A ENTREGA DE MERCADORIA"), "Transporte");
  assert.equal(nomeSugerido("CUSTO COM A ENTREGA DA MERCADORIA"), "Transporte");
});

test("uma regra específica ganha à genérica que também casaria", () => {
  // "água para limpeza" tem "agua" (Alimentação) e "limpeza" (Outras despesas);
  // limpeza é a intenção real e está declarada primeiro.
  assert.equal(nomeSugerido("ÁGUA PARA LIMPEZA DO ESCRITÓRIO"), "Outras despesas");
  assert.equal(nomeSugerido("COMPRA DE ÁGUA  FILTRADA PUFFS"), "Alimentação");
});

test("acentos, maiúsculas e pontuação não impedem a correspondência", () => {
  assert.equal(nomeSugerido("combustivel"), "Combustível");
  assert.equal(nomeSugerido("Manutenção do gerador"), "Manutenção");
  assert.equal(nomeSugerido("PAGAMENTO DE RENDA - ESCRITÓRIO"), "Renda");
  assert.equal(nomeSugerido("IVA DO TRIMESTRE"), "Impostos");
  assert.equal(nomeSugerido("SALÁRIOS DE MARÇO"), "Salários");
});

test("receitas usam as categorias de receita", () => {
  assert.equal(nomeSugerido("ENTRADA DE VALORES AO CAIXA", "income"), "Outros recebimentos");
  assert.equal(nomeSugerido("REQUISIÇÃO DE CAIXA", "income"), "Outros recebimentos");
  assert.equal(nomeSugerido("VENDA DE MERCADORIA", "income"), "Vendas de mercadoria");
  assert.equal(nomeSugerido("PRESTAÇÃO DE SERVIÇOS DE MONTAGEM", "income"), "Prestação de serviços");
  assert.equal(nomeSugerido("COMISSÃO DO PARCEIRO", "income"), "Comissões");
});

test("nunca devolve uma categoria do sentido oposto", () => {
  // "combustível" é regra de despesa; num movimento de entrada não se aplica.
  assert.equal(suggestCategory(TODAS, "COMBUSTÍVEL", "income"), undefined);
  // "venda" é regra de receita; numa saída não se aplica.
  assert.equal(suggestCategory(TODAS, "VENDA DE MERCADORIA", "expense"), undefined);
});

test("descrição sem termo conhecido fica por categorizar", () => {
  assert.equal(nomeSugerido("RQ - ABRIL / 37 LCV 2026"), undefined);
  assert.equal(nomeSugerido(""), undefined);
  assert.equal(nomeSugerido(null), undefined);
  assert.equal(nomeSugerido("XPTO 12345"), undefined);
});

test("não inventa categoria quando a organização não tem a sugerida", () => {
  const semCombustivel = DESPESAS.filter(c => c.name !== "Combustível");
  assert.equal(suggestCategory(semCombustivel, "COMBUSTÍVEL", "expense"), undefined);
});

test("ignora categorias desativadas", () => {
  const desativada = TODAS.map(c => c.name === "Combustível" ? { ...c, isActive: false } : c);
  assert.equal(suggestCategory(desativada, "COMBUSTÍVEL", "expense"), undefined);
});

test("sem categorias não rebenta", () => {
  assert.equal(suggestCategory([], "COMBUSTÍVEL", "expense"), undefined);
});

// Organizações novas (Fase 1) são semeadas com subcategorias — a sugestão deve
// preferir a mais específica quando ela existir, sem deixar de funcionar para
// as organizações antigas que só têm as categorias planas (testado acima).
const COM_HIERARQUIA = [
  { id: "p1", name: "Transporte", categoryType: "expense" },
  { id: "s1", name: "Combustível", categoryType: "expense", parentId: "p1" },
  { id: "s2", name: "Táxi e entregas", categoryType: "expense", parentId: "p1" },
  { id: "s3", name: "Portagens", categoryType: "expense", parentId: "p1" },
  { id: "p2", name: "Comunicações", categoryType: "expense" },
  { id: "s4", name: "Telefone", categoryType: "expense", parentId: "p2" },
  { id: "s5", name: "Internet", categoryType: "expense", parentId: "p2" },
  { id: "p3", name: "Outras despesas", categoryType: "expense" },
  { id: "s6", name: "Limpeza", categoryType: "expense", parentId: "p3" },
  { id: "p4", name: "Equipamento", categoryType: "expense" },
  { id: "s7", name: "Computadores", categoryType: "expense", parentId: "p4" },
];

test("com hierarquia, prefere a subcategoria mais específica", () => {
  const nomeSugerido = (d) => suggestCategory(COM_HIERARQUIA, d, "expense")?.name;
  assert.equal(nomeSugerido("ABASTECIMENTO DE GASÓLEO"), "Combustível");
  assert.equal(nomeSugerido("SALDO DE VOZ"), "Telefone");
  assert.equal(nomeSugerido("INTERNET DO ESCRITÓRIO"), "Internet");
  assert.equal(nomeSugerido("PRODUTOS DE LIMPEZA"), "Limpeza");
  assert.equal(nomeSugerido("COMPRA DE UM COMPUTADOR PORTÁTIL"), "Computadores");
});

test("Equipamento só é sugerido quando a organização o semeou", () => {
  assert.equal(suggestCategory([{ id: "d1", name: "Transporte", categoryType: "expense" }], "COMPUTADOR NOVO", "expense"), undefined);
});
