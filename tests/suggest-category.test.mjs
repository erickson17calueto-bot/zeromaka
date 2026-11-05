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

test("não atribui fornecedor só por constar pagamento ou transferência", () => {
  assert.equal(nomeSugerido("Pagamento REF 8891"), undefined);
  assert.equal(nomeSugerido("Transferência interna"), undefined);
  assert.equal(nomeSugerido("Taxista REF 8891"), undefined);
});

test("reconhece categoria própria da organização apenas no sentido certo", () => {
  const categorias = [
    ...TODAS,
    { id: "custom-1", name: "Formação técnica", categoryType: "expense", isActive: true },
  ];
  assert.equal(suggestCategory(categorias, "Formação técnica da equipa", "expense")?.id, "custom-1");
  assert.equal(suggestCategory(categorias, "Formação técnica da equipa", "income"), undefined);
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

const NOVA_TAXONOMIA = [
  // Operacional
  { id: "op", name: "Operacional", categoryType: "expense" },
  { id: "op1", name: "Compra de mercadoria", categoryType: "expense", parentId: "op" },
  { id: "op2", name: "Combustível", categoryType: "expense", parentId: "op" },
  { id: "op3", name: "Manutenção de viaturas", categoryType: "expense", parentId: "op" },
  { id: "op4", name: "Entregas e logística", categoryType: "expense", parentId: "op" },
  { id: "op5", name: "Transporte de pessoal", categoryType: "expense", parentId: "op" },
  // Administrativo
  { id: "adm", name: "Administrativo", categoryType: "expense" },
  { id: "adm1", name: "Renda do escritório", categoryType: "expense", parentId: "adm" },
  { id: "adm2", name: "Água (EPAL)", categoryType: "expense", parentId: "adm" },
  { id: "adm3", name: "Eletricidade (ENDE)", categoryType: "expense", parentId: "adm" },
  { id: "adm4", name: "Material de escritório", categoryType: "expense", parentId: "adm" },
  { id: "adm5", name: "Material de limpeza", categoryType: "expense", parentId: "adm" },
  { id: "adm6", name: "Internet", categoryType: "expense", parentId: "adm" },
  { id: "adm7", name: "Telefone e comunicações", categoryType: "expense", parentId: "adm" },
  { id: "adm8", name: "Equipamentos informáticos", categoryType: "expense", parentId: "adm" },
  // Pessoal
  { id: "pes", name: "Pessoal", categoryType: "expense" },
  { id: "pes1", name: "Salários", categoryType: "expense", parentId: "pes" },
  { id: "pes2", name: "Subsídios", categoryType: "expense", parentId: "pes" },
  { id: "pes3", name: "Segurança social (INSS)", categoryType: "expense", parentId: "pes" },
  // Impostos e Taxas
  { id: "imp", name: "Impostos e Taxas", categoryType: "expense" },
  { id: "imp1", name: "IVA", categoryType: "expense", parentId: "imp" },
  { id: "imp2", name: "Taxas municipais", categoryType: "expense", parentId: "imp" },
  // Despesas Financeiras
  { id: "fin", name: "Despesas Financeiras", categoryType: "expense" },
  { id: "fin1", name: "Comissões bancárias", categoryType: "expense", parentId: "fin" },
  // Receita Operacional
  { id: "ro", name: "Receita Operacional", categoryType: "income" },
  { id: "ro1", name: "Venda de mercadoria", categoryType: "income", parentId: "ro" },
  { id: "ro2", name: "Prestação de serviços", categoryType: "income", parentId: "ro" },
  { id: "ro3", name: "Comissões recebidas", categoryType: "income", parentId: "ro" },
  // Receita Não Operacional
  { id: "rno", name: "Receita Não Operacional", categoryType: "income" },
  { id: "rno1", name: "Juros recebidos", categoryType: "income", parentId: "rno" },
  { id: "rno2", name: "Outros rendimentos", categoryType: "income", parentId: "rno" },
];

test("nova taxonomia contabilística categoriza com precisão despesas e receitas", () => {
  const sugerirD = (d) => suggestCategory(NOVA_TAXONOMIA, d, "expense")?.name;
  const sugerirR = (d) => suggestCategory(NOVA_TAXONOMIA, d, "income")?.name;

  // Operacional
  assert.equal(sugerirD("ABASTECIMENTO GASÓLEO"), "Combustível");
  assert.equal(sugerirD("COMPRA DE MERCADORIA P/ REVENDA"), "Compra de mercadoria");
  assert.equal(sugerirD("REVISÃO DA VIATURA E PNEUS"), "Manutenção de viaturas");
  assert.equal(sugerirD("ENTREGA DA MERCADORIA"), "Entregas e logística");

  // Administrativo
  assert.equal(sugerirD("PAGAMENTO DE RENDA DO ESCRITÓRIO"), "Renda do escritório");
  assert.equal(sugerirD("FACTURA DA EPAL ÁGUA"), "Água (EPAL)");
  assert.equal(sugerirD("ENERGIA DA ENDE"), "Eletricidade (ENDE)");
  assert.equal(sugerirD("RECARGA UNITEL 5000 UTT"), "Telefone e comunicações");
  assert.equal(sugerirD("INTERNET FIBRA DO ESCRITÓRIO"), "Internet");
  assert.equal(sugerirD("DETERGENTE E LIXÍVIA P/ LIMPEZA"), "Material de limpeza");
  assert.equal(sugerirD("COMPRA DE COMPUTADOR PORTÁTIL"), "Equipamentos informáticos");

  // Pessoal
  assert.equal(sugerirD("SALÁRIOS DA EQUIPA - MARÇO"), "Salários");
  assert.equal(sugerirD("PAGAMENTO DE SUBSÍDIO DE FÉRIAS"), "Subsídios");
  assert.equal(sugerirD("GUIA DA SEGURANÇA SOCIAL INSS"), "Segurança social (INSS)");

  // Impostos e Despesas Financeiras
  assert.equal(sugerirD("PAGAMENTO DE IVA TRIMESTRAL"), "IVA");
  assert.equal(sugerirD("COMISSÃO BANCÁRIA MANUTENÇÃO CONTA"), "Comissões bancárias");

  // Receitas
  assert.equal(sugerirR("VENDA DE MERCADORIA LOJA"), "Venda de mercadoria");
  assert.equal(sugerirR("PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA"), "Prestação de serviços");
  assert.equal(sugerirR("COMISSÕES DE PARCERIA RECEBIDAS"), "Comissões recebidas");
  assert.equal(sugerirR("JUROS BANCÁRIOS RECEBIDOS"), "Juros recebidos");
});
