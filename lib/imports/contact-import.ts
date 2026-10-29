export type ImportContactKind = "cliente" | "fornecedor";

export type ContactImportFields = {
  name: string;
  nif?: string;
  phone?: string;
  email?: string;
  location?: string;
  paymentTerm?: string;
  notes?: string;
};

export type ExistingImportContact = ContactImportFields & {
  id?: string;
  kind: string;
};

export type ContactDuplicate = {
  field: "nif" | "phone" | "email" | "name";
  match: ExistingImportContact;
};

export const CONTACT_IMPORT_FIELDS = ["name", "nif", "phone", "email", "location", "paymentTerm", "notes"] as const;
export type ContactImportField = typeof CONTACT_IMPORT_FIELDS[number];

const HEADER_ALIASES: Record<ContactImportField, string[]> = {
  name: ["nome", "nome completo", "nome cliente", "nome fornecedor", "cliente", "fornecedor", "razao social", "designacao", "entidade", "contacto", "contact"],
  nif: ["nif", "n i f", "nuit", "numero contribuinte", "numero de contribuinte", "contribuinte", "tax id"],
  phone: ["telefone", "telemovel", "celular", "numero telefone", "numero de telefone", "telefone principal", "phone", "mobile"],
  email: ["email", "e mail", "correio eletronico", "correio electronico"],
  location: ["localizacao", "morada", "endereco", "endereco completo", "municipio", "address", "location"],
  paymentTerm: ["prazo pagamento", "prazo de pagamento", "condicao pagamento", "condicoes pagamento", "payment term"],
  notes: ["observacoes", "observacao", "notas", "nota", "notes"],
};

export function contactImportKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function identifierKey(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function phoneKey(value: unknown): string {
  const raw = String(value ?? "").replace(/\D/g, "");
  const digits = raw.startsWith("00244") ? raw.slice(2) : raw;
  return digits.length === 9 ? `244${digits}` : digits;
}

export function detectContactColumns(headers: string[]): Partial<Record<ContactImportField, string>> {
  const found: Partial<Record<ContactImportField, string>> = {};
  const unused = new Set(headers);
  for (const field of CONTACT_IMPORT_FIELDS) {
    const alias = HEADER_ALIASES[field];
    const exact = headers.find(header => unused.has(header) && alias.includes(contactImportKey(header)));
    const near = exact ?? headers.find(header => unused.has(header) && alias.some(a => {
      const key = contactImportKey(header);
      return key.startsWith(`${a} `) || key.endsWith(` ${a}`);
    }));
    if (near) { found[field] = near; unused.delete(near); }
  }
  return found;
}

export function contactFromRow(raw: Record<string, string>, mapping: Partial<Record<ContactImportField, string>>): ContactImportFields {
  const field = (key: ContactImportField) => String(raw[mapping[key] || ""] || "").trim().replace(/\s+/g, " ");
  return {
    name: field("name"), nif: field("nif"), phone: field("phone"), email: field("email"),
    location: field("location"), paymentTerm: field("paymentTerm"), notes: field("notes"),
  };
}

export function findContactDuplicate(candidate: ContactImportFields, existing: ExistingImportContact[]): ContactDuplicate | null {
  const nif = identifierKey(candidate.nif);
  const phone = phoneKey(candidate.phone);
  const email = String(candidate.email || "").trim().toLowerCase();
  const name = contactImportKey(candidate.name);
  if (nif) {
    const match = existing.find(c => identifierKey(c.nif) === nif);
    if (match) return { field: "nif", match };
  }
  if (phone) {
    const match = existing.find(c => phoneKey(c.phone) === phone);
    if (match) return { field: "phone", match };
  }
  if (email) {
    const match = existing.find(c => String(c.email || "").trim().toLowerCase() === email);
    if (match) return { field: "email", match };
  }
  if (name) {
    const match = existing.find(c => contactImportKey(c.name) === name);
    if (match) return { field: "name", match };
  }
  return null;
}

/** Índice reutilizável para rever ficheiros longos sem comparar cada linha com todas as anteriores. */
export function createContactDuplicateIndex(existing: ExistingImportContact[]) {
  const byNif = new Map<string, ExistingImportContact>();
  const byPhone = new Map<string, ExistingImportContact>();
  const byEmail = new Map<string, ExistingImportContact>();
  const byName = new Map<string, ExistingImportContact>();
  const add = (contact: ExistingImportContact) => {
    const nif = identifierKey(contact.nif);
    const phone = phoneKey(contact.phone);
    const email = String(contact.email || "").trim().toLowerCase();
    const name = contactImportKey(contact.name);
    if (nif && !byNif.has(nif)) byNif.set(nif, contact);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, contact);
    if (email && !byEmail.has(email)) byEmail.set(email, contact);
    if (name && !byName.has(name)) byName.set(name, contact);
  };
  existing.forEach(add);
  return {
    add,
    find(candidate: ContactImportFields): ContactDuplicate | null {
      const nif = identifierKey(candidate.nif);
      const phone = phoneKey(candidate.phone);
      const email = String(candidate.email || "").trim().toLowerCase();
      const name = contactImportKey(candidate.name);
      if (nif && byNif.has(nif)) return { field: "nif", match: byNif.get(nif)! };
      if (phone && byPhone.has(phone)) return { field: "phone", match: byPhone.get(phone)! };
      if (email && byEmail.has(email)) return { field: "email", match: byEmail.get(email)! };
      if (name && byName.has(name)) return { field: "name", match: byName.get(name)! };
      return null;
    },
  };
}

export const PAYMENT_TERM_VALUES = ["pronto", "credito15", "credito30", "credito60", "credito90", "mensal"] as const;

export function parseContactPaymentTerm(value: string): typeof PAYMENT_TERM_VALUES[number] | undefined {
  const key = contactImportKey(value);
  if (!key) return undefined;
  if ((PAYMENT_TERM_VALUES as readonly string[]).includes(key)) return key as typeof PAYMENT_TERM_VALUES[number];
  if (["pronto", "a pronto", "imediato", "imediata", "cash"].includes(key)) return "pronto";
  if (["mensal", "mensalmente"].includes(key)) return "mensal";
  const days = key.match(/(?:^| )(15|30|60|90)(?: |$)/)?.[1];
  return days ? `credito${days}` as typeof PAYMENT_TERM_VALUES[number] : undefined;
}
