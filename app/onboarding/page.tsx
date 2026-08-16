"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/routes";
import { track } from "@/lib/analytics";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket } from "lucide-react";

type Draft = {
  full_name: string;
  company: {
    name: string; legal_name: string; nif: string; activity: string;
    phone: string; email: string; address: string; timezone: string;
    currency: string; regime: string; fiscal_year_start_month: number;
  };
  financial: { minimum_cash_buffer: string };
  account: { name: string; type: string; bank: string; opening_balance: string };
  contacts: { cliente: string; fornecedor: string };
  obligations: {
    receber: { amount: string; due_date: string; description: string };
    pagar: { amount: string; due_date: string; description: string };
  };
};

const VAZIO: Draft = {
  full_name: "",
  company: {
    name: "", legal_name: "", nif: "", activity: "", phone: "", email: "", address: "",
    timezone: "Africa/Luanda", currency: "AOA", regime: "geral", fiscal_year_start_month: 1,
  },
  financial: { minimum_cash_buffer: "" },
  account: { name: "", type: "bank", bank: "", opening_balance: "" },
  contacts: { cliente: "", fornecedor: "" },
  obligations: {
    receber: { amount: "", due_date: "", description: "" },
    pagar: { amount: "", due_date: "", description: "" },
  },
};

const ETAPAS = ["Empresa", "Finanças", "Conta", "Contactos", "Obrigações", "Resumo"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const REGIMES = [
  { v: "geral", label: "Geral — IVA 14%", nota: "Empresas com volume de negócios elevado." },
  { v: "simplificado", label: "Simplificado — IVA 7%", nota: "Para pequenas empresas." },
  { v: "isencao", label: "Exclusão — Imposto de Selo 1%", nota: "Atividades de pequeno porte." },
];
const TIPOS_CONTA = [
  { v: "bank", label: "Banco" },
  { v: "mobile_money", label: "Carteira móvel" },
  { v: "cash", label: "Caixa físico" },
];

const kz = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-AO", { minimumFractionDigits: 2 }) : "0,00";
};

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Draft>(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Retoma o rascunho e o nome já conhecido do utilizador.
  useEffect(() => {
    (async () => {
      // getSession() lê o cookie local, sem ida ao servidor — o middleware já
      // validou a sessão com getUser() antes de servir esta página; repetir
      // essa validação aqui só soma mais uma ida e volta completa (o dobro em
      // eu-west-3, para quem acede de Angola) sem reforçar segurança nenhuma:
      // a fronteira real continua no middleware e no RLS de cada tabela.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.replace(ROUTES.entrar); return; }
      const { data: perfil } = await supabase
        .from("profiles").select("full_name, onboarding_step, onboarding_draft, onboarding_status")
        .eq("id", user.id).single();

      if (perfil?.onboarding_status === "completed") { router.replace(ROUTES.dashboard); return; }

      const rascunho = (perfil?.onboarding_draft ?? {}) as Partial<Draft>;
      setD({
        ...VAZIO, ...rascunho,
        full_name: rascunho.full_name || perfil?.full_name || (user.user_metadata?.full_name as string) || "",
        company: { ...VAZIO.company, ...(rascunho.company ?? {}) },
        financial: { ...VAZIO.financial, ...(rascunho.financial ?? {}) },
        account: { ...VAZIO.account, ...(rascunho.account ?? {}) },
        contacts: { ...VAZIO.contacts, ...(rascunho.contacts ?? {}) },
        obligations: { ...VAZIO.obligations, ...(rascunho.obligations ?? {}) },
      });
      if (perfil?.onboarding_step) setStep(Math.min(Math.max(perfil.onboarding_step, 1), 6));
      setCarregado(true);
      track("onboarding_iniciado");
    })();
  }, [supabase, router]);

  // Grava o rascunho no servidor com atraso, para um refresh não perder tudo.
  useEffect(() => {
    if (carregado) track("onboarding_etapa", { etapa: step as 1 | 2 | 3 | 4 | 5 | 6 });
  }, [step, carregado]);

  useEffect(() => {
    if (!carregado) return;
    if (guardar.current) clearTimeout(guardar.current);
    guardar.current = setTimeout(async () => {
      const { error } = await supabase.rpc("save_onboarding_progress", { p_step: step, p_draft: d });
      // Ignorar o resultado esconderia uma gravação que nunca aconteceu — o
      // utilizador só descobriria ao perder o que já tinha preenchido.
      if (error) console.error("Falha ao guardar o progresso do onboarding:", error.message);
    }, 800);
    return () => { if (guardar.current) clearTimeout(guardar.current); };
  }, [d, step, carregado, supabase]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setC = (k: keyof Draft["company"], v: string | number) =>
    setD((p) => ({ ...p, company: { ...p.company, [k]: v } }));
  const setA = (k: keyof Draft["account"], v: string) =>
    setD((p) => ({ ...p, account: { ...p.account, [k]: v } }));

  const podeAvancar =
    step === 1 ? d.full_name.trim().length >= 2 && d.company.name.trim().length >= 2
    : step === 3 ? d.account.name.trim().length >= 2
    : true;

  const concluir = async () => {
    if (busy) return;
    setError(null); setBusy(true);
    try {
      const contactos = [
        d.contacts.cliente.trim() && { name: d.contacts.cliente.trim(), kind: "cliente" },
        d.contacts.fornecedor.trim() && { name: d.contacts.fornecedor.trim(), kind: "fornecedor" },
      ].filter(Boolean);

      const obrigacoes = [
        d.contacts.cliente.trim() && Number(d.obligations.receber.amount) > 0 && {
          direction: "receivable", contact_name: d.contacts.cliente.trim(),
          amount: Number(d.obligations.receber.amount),
          due_date: d.obligations.receber.due_date || null,
          description: d.obligations.receber.description,
        },
        d.contacts.fornecedor.trim() && Number(d.obligations.pagar.amount) > 0 && {
          direction: "payable", contact_name: d.contacts.fornecedor.trim(),
          amount: Number(d.obligations.pagar.amount),
          due_date: d.obligations.pagar.due_date || null,
          description: d.obligations.pagar.description,
        },
      ].filter(Boolean);

      const { error } = await supabase.rpc("complete_onboarding", {
        p_payload: {
          profile: { full_name: d.full_name.trim() },
          organization: { name: d.company.name.trim() },
          company: { ...d.company, name: d.company.name.trim() },
          financial: { minimum_cash_buffer: Number(d.financial.minimum_cash_buffer) || 0 },
          account: { ...d.account, opening_balance: Number(d.account.opening_balance) || 0 },
          contacts: contactos,
          obligations: obrigacoes,
        },
      });
      if (error) { setError(error.message); return; }
      // Só sinais agregados: se houve saldo e se houve contactos, nunca os valores.
      track("onboarding_concluido", {
        com_saldo_inicial: Number(d.account.opening_balance) > 0,
        com_contactos: contactos.length > 0,
      });
      track("primeira_conta_criada", { tipo: d.account.type as "bank" | "mobile_money" | "cash" });
      router.replace(ROUTES.dashboard);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!carregado) {
    return <div className="min-h-screen flex items-center justify-center text-ink-500">A carregar…</div>;
  }

  return (
    <div className="min-h-screen bg-ink-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="h-9 w-9 rounded-lg bg-maka-500 flex items-center justify-center font-display text-onbrand">Z</span>
          <span className="font-display text-lg tracking-tight">Zero<span className="text-maka-500">Maka</span></span>
        </div>

        {/* Progresso */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-500 mb-2">
            <span>Etapa {step} de 6 · {ETAPAS[step - 1]}</span>
            <span>{Math.round((step / 6) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden" role="progressbar"
            aria-valuenow={step} aria-valuemin={1} aria-valuemax={6} aria-label="Progresso do onboarding">
            <div className="h-full bg-maka-500 transition-all duration-500" style={{ width: `${(step / 6) * 100}%` }} />
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        <div className="card p-6">
          {step === 1 && (
            <>
              <h1 className="font-display text-xl tracking-tight">Vamos configurar a sua empresa</h1>
              <p className="mt-1.5 text-sm text-ink-400">Só o nome é obrigatório. O resto pode preencher depois.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="label" htmlFor="nome">O seu nome<span className="text-maka-400" aria-hidden="true"> *</span></label>
                  <input id="nome" className="input" value={d.full_name} onChange={(e) => set("full_name", e.target.value)}
                    placeholder="Ex: João Silva" autoComplete="name" autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor="empresa">Nome comercial<span className="text-maka-400" aria-hidden="true"> *</span></label>
                  <input id="empresa" className="input" value={d.company.name} onChange={(e) => setC("name", e.target.value)}
                    placeholder="Ex: Maka Comércio Geral" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="legal">Nome legal</label>
                    <input id="legal" className="input" value={d.company.legal_name}
                      onChange={(e) => setC("legal_name", e.target.value)} placeholder="Ex: Maka Comércio, Lda" />
                  </div>
                  <div>
                    <label className="label" htmlFor="nif">NIF</label>
                    <input id="nif" className="input" value={d.company.nif}
                      onChange={(e) => setC("nif", e.target.value)} placeholder="5417089321" inputMode="numeric" />
                  </div>
                  <div>
                    <label className="label" htmlFor="atividade">Atividade</label>
                    <input id="atividade" className="input" value={d.company.activity}
                      onChange={(e) => setC("activity", e.target.value)} placeholder="Ex: Comércio a retalho" />
                  </div>
                  <div>
                    <label className="label" htmlFor="tel">Telefone</label>
                    <input id="tel" className="input" type="tel" value={d.company.phone}
                      onChange={(e) => setC("phone", e.target.value)} placeholder="+244 900 000 000" />
                  </div>
                  <div>
                    <label className="label" htmlFor="mail">E-mail da empresa</label>
                    <input id="mail" className="input" type="email" value={d.company.email}
                      onChange={(e) => setC("email", e.target.value)} placeholder="geral@empresa.ao" />
                  </div>
                  <div>
                    <label className="label" htmlFor="morada">Localização</label>
                    <input id="morada" className="input" value={d.company.address}
                      onChange={(e) => setC("address", e.target.value)} placeholder="Ex: Nova Vida, Luanda" />
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-display text-xl tracking-tight">Configuração financeira</h1>
              <p className="mt-1.5 text-sm text-ink-400">O regime fiscal define como o imposto é calculado nas vendas.</p>
              <fieldset className="mt-6">
                <legend className="label">Regime fiscal</legend>
                <div className="space-y-2">
                  {REGIMES.map((r) => (
                    <label key={r.v} className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      d.company.regime === r.v ? "border-maka-500/60 bg-maka-500/10" : "border-ink-800 hover:border-ink-700"}`}>
                      <input type="radio" name="regime" value={r.v} checked={d.company.regime === r.v}
                        onChange={() => setC("regime", r.v)} className="mt-1 h-4 w-4 text-maka-500 focus:ring-2 focus:ring-maka-500/40" />
                      <span>
                        <span className="block text-sm font-medium">{r.label}</span>
                        <span className="block text-[12px] text-ink-500">{r.nota}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="moeda">Moeda</label>
                  <input id="moeda" className="input" value={d.company.currency}
                    onChange={(e) => setC("currency", e.target.value.toUpperCase())} maxLength={3} />
                </div>
                <div>
                  <label className="label" htmlFor="exercicio">Início do exercício fiscal</label>
                  <select id="exercicio" className="input" value={d.company.fiscal_year_start_month}
                    onChange={(e) => setC("fiscal_year_start_month", Number(e.target.value))}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="reserva">Reserva mínima de caixa</label>
                <input id="reserva" className="input" type="number" min={0} step="0.01"
                  value={d.financial.minimum_cash_buffer}
                  onChange={(e) => set("financial", { minimum_cash_buffer: e.target.value })}
                  placeholder="0,00" aria-describedby="reserva-hint" />
                <p id="reserva-hint" className="mt-1.5 text-[12px] text-ink-500">
                  Valor que quer manter sempre em caixa. É descontado ao Disponível de verdade. Pode deixar em branco.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="font-display text-xl tracking-tight">A sua primeira conta</h1>
              <p className="mt-1.5 text-sm text-ink-400">Pode acrescentar as restantes depois, dentro da aplicação.</p>
              <fieldset className="mt-6">
                <legend className="label">Tipo de conta</legend>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS_CONTA.map((t) => (
                    <label key={t.v} className={`rounded-lg border p-3 text-center cursor-pointer transition-colors ${
                      d.account.type === t.v ? "border-maka-500/60 bg-maka-500/10 text-maka-300" : "border-ink-800 hover:border-ink-700"}`}>
                      <input type="radio" name="tipo" value={t.v} checked={d.account.type === t.v}
                        onChange={() => setA("type", t.v)} className="sr-only" />
                      <span className="text-sm font-medium">{t.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="label" htmlFor="conta">Nome da conta<span className="text-maka-400" aria-hidden="true"> *</span></label>
                  <input id="conta" className="input" value={d.account.name} onChange={(e) => setA("name", e.target.value)}
                    placeholder={d.account.type === "cash" ? "Ex: Caixa Físico" : "Ex: BAI Empresa"} />
                </div>
                {d.account.type !== "cash" && (
                  <div>
                    <label className="label" htmlFor="banco">{d.account.type === "bank" ? "Banco" : "Operadora"}</label>
                    <input id="banco" className="input" value={d.account.bank} onChange={(e) => setA("bank", e.target.value)}
                      placeholder={d.account.type === "bank" ? "Ex: BAI" : "Ex: Unitel Money"} />
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="saldo">Saldo atual</label>
                  <input id="saldo" className="input" type="number" min={0} step="0.01"
                    value={d.account.opening_balance} onChange={(e) => setA("opening_balance", e.target.value)}
                    placeholder="0,00" aria-describedby="saldo-hint" />
                  <p id="saldo-hint" className="mt-1.5 text-[12px] text-ink-500">
                    Quanto tem nesta conta hoje. Entra como lançamento de abertura no livro financeiro.
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="font-display text-xl tracking-tight">Primeiros contactos</h1>
              <p className="mt-1.5 text-sm text-ink-400">Opcional — pode saltar e acrescentar depois.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="label" htmlFor="cliente">Um cliente</label>
                  <input id="cliente" className="input" value={d.contacts.cliente}
                    onChange={(e) => setD((p) => ({ ...p, contacts: { ...p.contacts, cliente: e.target.value } }))}
                    placeholder="Ex: Hotel Talatona" />
                </div>
                <div>
                  <label className="label" htmlFor="fornecedor">Um fornecedor</label>
                  <input id="fornecedor" className="input" value={d.contacts.fornecedor}
                    onChange={(e) => setD((p) => ({ ...p, contacts: { ...p.contacts, fornecedor: e.target.value } }))}
                    placeholder="Ex: Distribuidora Angomart" />
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1 className="font-display text-xl tracking-tight">Primeiras obrigações</h1>
              <p className="mt-1.5 text-sm text-ink-400">
                {d.contacts.cliente || d.contacts.fornecedor
                  ? "Opcional — registe o que já está pendente."
                  : "Não indicou contactos na etapa anterior, por isso esta pode ser saltada."}
              </p>

              {d.contacts.cliente && (
                <div className="mt-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-maka-400">A receber de {d.contacts.cliente}</h2>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="rec-valor">Valor</label>
                      <input id="rec-valor" className="input" type="number" min={0} step="0.01"
                        value={d.obligations.receber.amount}
                        onChange={(e) => setD((p) => ({ ...p, obligations: { ...p.obligations, receber: { ...p.obligations.receber, amount: e.target.value } } }))}
                        placeholder="0,00" />
                    </div>
                    <div>
                      <label className="label" htmlFor="rec-data">Vencimento</label>
                      <input id="rec-data" className="input" type="date" value={d.obligations.receber.due_date}
                        onChange={(e) => setD((p) => ({ ...p, obligations: { ...p.obligations, receber: { ...p.obligations.receber, due_date: e.target.value } } }))} />
                    </div>
                  </div>
                </div>
              )}

              {d.contacts.fornecedor && (
                <div className="mt-6">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-maka-400">A pagar a {d.contacts.fornecedor}</h2>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="pag-valor">Valor</label>
                      <input id="pag-valor" className="input" type="number" min={0} step="0.01"
                        value={d.obligations.pagar.amount}
                        onChange={(e) => setD((p) => ({ ...p, obligations: { ...p.obligations, pagar: { ...p.obligations.pagar, amount: e.target.value } } }))}
                        placeholder="0,00" />
                    </div>
                    <div>
                      <label className="label" htmlFor="pag-data">Vencimento</label>
                      <input id="pag-data" className="input" type="date" value={d.obligations.pagar.due_date}
                        onChange={(e) => setD((p) => ({ ...p, obligations: { ...p.obligations, pagar: { ...p.obligations.pagar, due_date: e.target.value } } }))} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-maka-500/15 text-maka-400">
                <Rocket size={21} aria-hidden="true" />
              </div>
              <h1 className="mt-4 font-display text-xl tracking-tight">Tudo pronto, {d.full_name.split(" ")[0]}</h1>
              <p className="mt-1.5 text-sm text-ink-400">Confirme os dados antes de criar a empresa.</p>

              <dl className="mt-6 divide-y divide-ink-800">
                {[
                  ["Empresa", d.company.name],
                  ["Regime fiscal", REGIMES.find((r) => r.v === d.company.regime)?.label ?? "—"],
                  ["Primeira conta", `${d.account.name}${d.account.bank ? ` · ${d.account.bank}` : ""}`],
                  ["Saldo de abertura", `Kz ${kz(d.account.opening_balance)}`],
                  ["Reserva mínima", `Kz ${kz(d.financial.minimum_cash_buffer)}`],
                  ["Contactos", [d.contacts.cliente, d.contacts.fornecedor].filter(Boolean).join(", ") || "Nenhum"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-sm text-ink-400">{k}</dt>
                    <dd className="text-sm font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-[12px] text-ink-500 leading-relaxed">
                A seguir vai poder registar movimentos, acompanhar cobranças e ver quanto está realmente
                disponível. Tudo isto pode ser alterado mais tarde em Empresa.
              </p>
            </>
          )}

          {/* Navegação */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || busy}
              className="btn-ghost disabled:opacity-40">
              <ArrowLeft size={15} aria-hidden="true" /> Voltar
            </button>

            <div className="flex items-center gap-2">
              {step >= 4 && step <= 5 && (
                <button onClick={() => setStep((s) => s + 1)} disabled={busy} className="btn-ghost">Saltar</button>
              )}
              {step < 6 ? (
                <button onClick={() => setStep((s) => Math.min(6, s + 1))} disabled={!podeAvancar || busy}
                  className="btn-primary disabled:opacity-50">
                  Continuar <ArrowRight size={15} aria-hidden="true" />
                </button>
              ) : (
                <button onClick={concluir} disabled={busy} className="btn-primary disabled:opacity-60">
                  {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Criar a minha empresa <Check size={15} aria-hidden="true" /></>}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] text-ink-500">
          O progresso é guardado automaticamente. Pode fechar e continuar depois.
        </p>
      </div>
    </div>
  );
}
