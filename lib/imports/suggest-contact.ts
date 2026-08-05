// Adivinhar o contacto (cliente/fornecedor) de uma linha importada.
//
// A coluna de contacto de um extrato raramente traz o nome exatamente igual
// ao registado no ZeroMaka: abreviado, com ou sem "Lda", às vezes só o NIF ou
// o telefone. Corrigir contacto a contacto num ficheiro de centenas de linhas
// não é trabalho para ninguém — por isso a correspondência tenta, por ordem
// de confiança, o identificador mais forte primeiro:
//   1. NIF (identificador fiscal — sem ambiguidade quando bate certo)
//   2. Telefone/WhatsApp (só dígitos, ignora +244/espaços/traços)
//   3. Nome exatamente igual, normalizado
//   4. Nome aproximado — só quando um único contacto contém (ou está contido
//      em) todas as palavras significativas da pista; com mais do que um
//      candidato possível, não escolhe por nenhum deles.
//
// É sempre uma sugestão: aparece no seletor de contacto da linha, que o
// utilizador pode trocar ou limpar antes de aprovar.

import { normalizar } from "./suggest-account";

export type ContactoSugerivel = {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  nif?: string;
  isArchived?: boolean;
};

export type ContactMatchTier = "nif" | "phone" | "exact_name" | "fuzzy_name";
export type ContactMatch<T> = { contact: T; tier: ContactMatchTier };

const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "e", "ltda", "lda", "sa", "s.a", "spa",
  "limitada", "unipessoal", "empresa", "comercio", "comercial", "grupo",
]);

function apenasDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D+/g, "");
}

// O NIF angolano de pessoa singular mistura dígitos e letras (ex: BI
// "003456789LA042") — ao contrário do telefone, não dá para descartar as
// letras sem risco de confundir pessoas diferentes. Só se normaliza
// maiúsculas/pontuação/espaços.
function normalizarNif(valor: string | null | undefined): string {
  return String(valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// Compara dois números já reduzidos a dígitos, tolerando indicativos
// internacionais de comprimento diferente ("00244…" vs "+244…" vs sem
// indicativo nenhum): um é sufixo do outro, e o mais curto tem de ter pelo
// menos 7 dígitos para não casar por coincidência.
function telefonesCorrespondem(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  return menor.length >= 7 && maior.endsWith(menor);
}

function palavrasSignificativas(nome: string): string[] {
  return normalizar(nome).split(" ").filter(w => w.length > 1 && !PALAVRAS_IGNORADAS.has(w));
}

export function suggestContact<T extends ContactoSugerivel>(
  contacts: T[],
  pistas: { name?: string | null; nif?: string | null; phone?: string | null },
): ContactMatch<T> | undefined {
  const abertos = contacts.filter(c => !c.isArchived);
  if (!abertos.length) return undefined;

  const nifPista = normalizarNif(pistas.nif);
  if (nifPista) {
    const porNif = abertos.filter(c => c.nif && normalizarNif(c.nif) === nifPista);
    if (porNif.length === 1) return { contact: porNif[0], tier: "nif" };
  }

  const telPista = apenasDigitos(pistas.phone);
  if (telPista.length >= 7) {
    const porTelefone = abertos.filter(c =>
      telefonesCorrespondem(telPista, apenasDigitos(c.phone)) ||
      telefonesCorrespondem(telPista, apenasDigitos(c.whatsapp))
    );
    if (porTelefone.length === 1) return { contact: porTelefone[0], tier: "phone" };
  }

  const nomePista = normalizar(pistas.name || "");
  if (!nomePista) return undefined;

  const porNomeExato = abertos.filter(c => normalizar(c.name) === nomePista);
  if (porNomeExato.length === 1) return { contact: porNomeExato[0], tier: "exact_name" };

  const palavrasPista = palavrasSignificativas(pistas.name || "");
  if (!palavrasPista.length) return undefined;

  const candidatos = abertos.filter(c => {
    const palavrasC = palavrasSignificativas(c.name);
    if (!palavrasC.length) return false;
    const [menor, maior] = palavrasPista.length <= palavrasC.length
      ? [palavrasPista, palavrasC] : [palavrasC, palavrasPista];
    const setMaior = new Set(maior);
    return menor.every(w => setMaior.has(w));
  });

  if (candidatos.length === 1) return { contact: candidatos[0], tier: "fuzzy_name" };
  return undefined;
}
