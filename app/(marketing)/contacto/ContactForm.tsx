"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const ASSUNTOS = [
  "Quero saber mais sobre o produto",
  "Preciso de ajuda a usar o ZeroMaka",
  "Sou contabilista e acompanho várias empresas",
  "Quero participar no piloto",
  "Comunicar um problema de segurança",
  "Outro assunto",
];

export default function ContactForm() {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "", subject: "", message: "", website: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid =
    form.name.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.subject !== "" &&
    form.message.trim().length >= 10 &&
    consent;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Não foi possível enviar. Tenta novamente."); return; }
      setSent(true);
    } catch {
      setError("Não foi possível contactar o servidor. Verifica a ligação à internet.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="card p-6 text-center">
        <CheckCircle2 size={28} className="mx-auto text-maka-500" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl tracking-tight">Mensagem enviada</h2>
        <p className="mt-2 text-sm text-ink-400 leading-relaxed">
          Obrigado, {form.name.split(" ")[0]}. Recebemos a sua mensagem e respondemos para{" "}
          <span className="text-ink-200">{form.email}</span> assim que possível.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nome<span className="text-maka-400" aria-hidden="true"> *</span></label>
          <input id="name" className="input" value={form.name} onChange={set("name")}
            autoComplete="name" required placeholder="Ex: João Silva" />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail<span className="text-maka-400" aria-hidden="true"> *</span></label>
          <input id="email" className="input" type="email" value={form.email} onChange={set("email")}
            autoComplete="email" required placeholder="teu@email.ao" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Telefone <span className="font-normal normal-case tracking-normal text-ink-500">(opcional)</span></label>
          <input id="phone" className="input" type="tel" value={form.phone} onChange={set("phone")}
            autoComplete="tel" placeholder="+244 900 000 000" />
        </div>
        <div>
          <label className="label" htmlFor="company">Empresa <span className="font-normal normal-case tracking-normal text-ink-500">(opcional)</span></label>
          <input id="company" className="input" value={form.company} onChange={set("company")}
            autoComplete="organization" placeholder="Nome da empresa" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="subject">Assunto<span className="text-maka-400" aria-hidden="true"> *</span></label>
        <select id="subject" className="input" value={form.subject} onChange={set("subject")} required>
          <option value="">Escolhe um assunto…</option>
          {ASSUNTOS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="message">Mensagem<span className="text-maka-400" aria-hidden="true"> *</span></label>
        <textarea id="message" className="input min-h-[130px] resize-y" value={form.message} onChange={set("message")}
          required minLength={10} maxLength={5000} placeholder="Conte-nos em que podemos ajudar."
          aria-describedby="message-hint" />
        <p id="message-hint" className="mt-1.5 text-[12px] text-ink-500">
          Mínimo 10 caracteres. Não inclua palavras-passe nem dados bancários.
        </p>
      </div>

      {/* Campo isco para robôs — escondido de pessoas e de leitores de ecrã */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">Não preencher</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>

      <label className="flex items-start gap-2.5 text-[13px] text-ink-400 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-700 bg-ink-800 text-maka-500 focus:ring-2 focus:ring-maka-500/40" />
        <span>
          Aceito que os dados acima sejam usados para responder a este contacto, conforme a{" "}
          <a href="/privacidade" className="text-maka-400 hover:underline">Política de privacidade</a>.
        </span>
      </label>

      <button type="submit" disabled={busy || !valid} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Enviar mensagem <Send size={15} aria-hidden="true" /></>}
      </button>
    </form>
  );
}
