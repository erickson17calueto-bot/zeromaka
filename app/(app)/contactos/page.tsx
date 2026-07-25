"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { ContactKind, Contact, PAYMENT_TERMS, PaymentTerm, SOCIO_ROLES, SocioRole } from "@/lib/data";
import { Plus, X, Trash2, Pencil, Building, Truck, UserRound, Phone, MapPin, Mail, CreditCard } from "lucide-react";

const KINDS: { value: ContactKind; label: string; icon: any }[] = [
  { value: "cliente", label: "Clientes", icon: Building },
  { value: "fornecedor", label: "Fornecedores", icon: Truck },
  { value: "socio", label: "Sócios", icon: UserRound }
];

const empty = { name: "", phone: "", nif: "", email: "", location: "", paymentTerm: "credito30" as PaymentTerm, role: "gerente" as SocioRole, notes: "" };

export default function ContactosPage() {
  const { contacts, addContact, editContact, removeContact } = useStore();
  const [tab, setTab] = useState<ContactKind>("cliente");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [f, setF] = useState({ ...empty });
  const [err, setErr] = useState("");

  const list = useMemo(() => contacts.filter((c) => c.kind === tab), [contacts, tab]);
  const isSocio = tab === "socio";

  const openNew = () => { setEditing(null); setF({ ...empty }); setErr(""); setShow(true); };
  const openEdit = (c: Contact) => {
    setEditing(c);
    setF({ name: c.name, phone: c.phone || "", nif: c.nif || "", email: c.email || "", location: c.location || "", paymentTerm: c.paymentTerm || "credito30", role: c.role || "gerente", notes: c.notes || "" });
    setErr(""); setShow(true);
  };

  const submit = () => {
    setErr("");
    if (!f.name.trim() || !f.phone.trim()) { setErr("Nome e telefone são obrigatórios."); return; }
    if (!isSocio && (!f.nif.trim() || !f.location.trim())) { setErr("Para clientes e fornecedores, NIF e localização são obrigatórios."); return; }
    const base: Omit<Contact, "id"> = {
      name: f.name.trim(), kind: tab, phone: f.phone.trim(),
      nif: f.nif.trim() || undefined, email: f.email.trim() || undefined,
      location: f.location.trim() || undefined, notes: f.notes.trim() || undefined,
      paymentTerm: isSocio ? undefined : f.paymentTerm, role: isSocio ? f.role : undefined
    };
    if (editing) editContact(editing.id, base); else addContact(base);
    setShow(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Contactos</h1>
          <p className="text-sm text-ink-400 mt-1">Clientes, fornecedores e sócios — com forma de pagamento e função.</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> Novo contacto</button>
      </header>

      <div className="flex gap-2">
        {KINDS.map((k) => {
          const Icon = k.icon; const count = contacts.filter((c) => c.kind === k.value).length;
          return (
            <button key={k.value} onClick={() => setTab(k.value)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm border transition-colors ${tab === k.value ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
              <Icon size={14} /> {k.label} <span className="text-[11px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((c) => (
          <div key={c.id} className="card p-4 group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                {c.role && <div className="inline-block mt-1 rounded-full bg-maka-500/15 text-maka-300 text-[10px] font-bold px-2 py-0.5">{SOCIO_ROLES[c.role]}</div>}
                <div className="mt-1.5 space-y-1 text-[12px] text-ink-400">
                  {c.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {c.phone}</div>}
                  {c.location && <div className="flex items-center gap-1.5"><MapPin size={12} /> {c.location}</div>}
                  {c.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {c.email}</div>}
                  {c.paymentTerm && <div className="flex items-center gap-1.5 text-emerald-400/90"><CreditCard size={12} /> {PAYMENT_TERMS[c.paymentTerm]}</div>}
                  {c.nif && <div className="text-ink-500">NIF: {c.nif}</div>}
                  {c.notes && <div className="text-ink-500">{c.notes}</div>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEdit(c)} className="text-ink-500 hover:text-maka-400"><Pencil size={15} /></button>
                <button onClick={() => removeContact(c.id)} className="text-ink-500 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="card p-8 text-center text-sm text-ink-500 sm:col-span-2">Sem contactos nesta categoria.</div>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">{editing ? "Editar" : "Novo"} {tab}</h3>
              <button onClick={() => setShow(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Nome <span className="text-maka-400">*</span></label>
                <input className="input" placeholder="Nome do contacto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Telefone <span className="text-maka-400">*</span></label>
                  <input className="input" placeholder="+244 …" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                </div>
                <div>
                  <label className="label">NIF {!isSocio && <span className="text-maka-400">*</span>}</label>
                  <input className="input" placeholder="—" value={f.nif} onChange={(e) => setF({ ...f, nif: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Localização {!isSocio && <span className="text-maka-400">*</span>}</label>
                <input className="input" placeholder="Ex.: Talatona, Luanda" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
              </div>
              <div>
                <label className="label">E-mail <span className="text-ink-500">(opcional)</span></label>
                <input className="input" type="email" placeholder="—" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>

              {isSocio ? (
                <div>
                  <label className="label">Função do sócio</label>
                  <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as SocioRole })}>
                    {(Object.keys(SOCIO_ROLES) as SocioRole[]).map((r) => <option key={r} value={r}>{SOCIO_ROLES[r]}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">Forma de pagamento</label>
                  <select className="input" value={f.paymentTerm} onChange={(e) => setF({ ...f, paymentTerm: e.target.value as PaymentTerm })}>
                    {(Object.keys(PAYMENT_TERMS) as PaymentTerm[]).map((t) => <option key={t} value={t}>{PAYMENT_TERMS[t]}</option>)}
                  </select>
                  <p className="text-[11px] text-ink-500 mt-1">Define se {tab === "cliente" ? "o cliente paga" : "pagas ao fornecedor"} a pronto ou a crédito (e quantos dias).</p>
                </div>
              )}

              <div>
                <label className="label">Notas <span className="text-ink-500">(opcional)</span></label>
                <input className="input" placeholder="Observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              </div>
              {err && <p className="text-sm text-red-400">{err}</p>}
              <button onClick={submit} className="btn-primary w-full justify-center">{editing ? "Guardar alterações" : "Guardar contacto"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
