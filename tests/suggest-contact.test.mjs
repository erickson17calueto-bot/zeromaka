import test from "node:test";
import assert from "node:assert/strict";
import { suggestContact } from "../.test-build/imports/suggest-contact.js";

const CONTACTS = [
  { id: "c1", name: "XYZ Comércio, Lda", nif: "5417123456", phone: "+244 923 456 789" },
  { id: "c2", name: "João Kiala", nif: "003456789LA042", whatsapp: "923111222" },
  { id: "c3", name: "Fornecedor Genérico" },
  { id: "c4", name: "XYZ Serviços", nif: "5417999999" },
];

test("NIF exato ganha a qualquer outra pista", () => {
  const r = suggestContact(CONTACTS, { name: "outro nome qualquer", nif: "5417123456" });
  assert.equal(r?.contact.id, "c1");
  assert.equal(r?.tier, "nif");
});

test("NIF com pontuação e espaços diferentes ainda casa (mantém as letras)", () => {
  const r = suggestContact(CONTACTS, { nif: "003.456.789-la042" });
  assert.equal(r?.contact.id, "c2");
  assert.equal(r?.tier, "nif");
});

test("NIF com letras diferentes não é tratado como igual só por partilhar os dígitos", () => {
  const r = suggestContact(CONTACTS, { nif: "003456789XX042" });
  assert.equal(r, undefined);
});

test("telefone bate mesmo com indicativo internacional e formatação", () => {
  const r = suggestContact(CONTACTS, { name: "", phone: "00244923456789" });
  assert.equal(r?.contact.id, "c1");
  assert.equal(r?.tier, "phone");
});

test("whatsapp também é tentado quando o telefone não bate", () => {
  const r = suggestContact(CONTACTS, { phone: "923 111 222" });
  assert.equal(r?.contact.id, "c2");
  assert.equal(r?.tier, "phone");
});

test("nome exatamente igual, ignorando acentos e maiúsculas", () => {
  const r = suggestContact(CONTACTS, { name: "joao kiala" });
  assert.equal(r?.contact.id, "c2");
  assert.equal(r?.tier, "exact_name");
});

test("nome aproximado: pista mais curta contida no nome registado", () => {
  const CONTATOS_SEM_AMBIGUIDADE = CONTACTS.filter(c => c.id !== "c4"); // remove o "XYZ Serviços" que também bateria
  const r = suggestContact(CONTATOS_SEM_AMBIGUIDADE, { name: "XYZ" });
  assert.equal(r?.contact.id, "c1");
  assert.equal(r?.tier, "fuzzy_name");
});

test("nome aproximado ambíguo (duas empresas 'XYZ') não escolhe nenhuma", () => {
  const r = suggestContact(CONTACTS, { name: "XYZ" });
  assert.equal(r, undefined);
});

test("'Lda'/'Comércio' sozinhos não geram falso positivo", () => {
  const r = suggestContact(CONTACTS, { name: "Lda" });
  assert.equal(r, undefined);
});

test("sem nenhuma pista, não sugere nada", () => {
  assert.equal(suggestContact(CONTACTS, {}), undefined);
});

test("ignora contactos arquivados", () => {
  const arquivado = [{ id: "c9", name: "Arquivado", nif: "1111111111", isArchived: true }];
  assert.equal(suggestContact(arquivado, { nif: "1111111111" }), undefined);
});

test("sem contactos não rebenta", () => {
  assert.equal(suggestContact([], { name: "qualquer", nif: "123" }), undefined);
});
