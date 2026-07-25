"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

/**
 * Zona de perigo — repõe a organização do zero.
 * Guardas do lado do servidor (RPC reset_organization_data): só o proprietário
 * pode, e tem de escrever o nome exato da organização. Aqui repetimos a
 * confirmação para evitar cliques acidentais.
 */
export default function DangerZone() {
  const { orgId } = useStore();
  // A confirmação é comparada com organizations.name no servidor — que pode
  // diferir do nome comercial da empresa. Vamos buscar o nome verdadeiro.
  const [orgName, setOrgName] = useState("");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    createClient().from("organizations").select("name").eq("id", orgId).single()
      .then(({ data }) => { if (!cancelled && data?.name) setOrgName(data.name); });
    return () => { cancelled = true; };
  }, [orgId]);

  const matches = !!orgName && text.trim().toLowerCase() === orgName.trim().toLowerCase();

  const run = async () => {
    if (!orgId || !matches) return;
    setBusy(true); setErr(null);
    const { data, error } = await createClient().rpc("reset_organization_data", {
      p_org_id: orgId, p_confirmation: text.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const payload = (data as { apagado?: Record<string, number> })?.apagado ?? {};
    setDone(payload);
  };

  // Depois de apagar tudo, recarrega para o estado em memória não ficar dessincronizado.
  const close = () => {
    if (done) { window.location.reload(); return; }
    setOpen(false); setText(""); setErr(null); setDone(null);
  };

  return (
    <section className="card border-red-500/40 p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[15px] text-red-400">Zona de perigo</h2>
          <p className="text-[12px] text-ink-500 mt-1 leading-snug">
            Apaga todos os dados desta empresa — contas, contactos, faturas, pagamentos, lançamentos,
            reservas e requisições — para recomeçares do zero. A empresa, os membros e o registo de
            auditoria são mantidos. <strong className="text-ink-300">Esta ação não pode ser desfeita.</strong>
          </p>
          <button onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-xs font-semibold transition-colors">
            <Trash2 size={14} /> Repor dados da empresa
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={close}>
          <div className="card max-w-md w-full p-6 border-red-500/40 pop" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-500/15 flex items-center justify-center text-red-400">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="font-display text-lg">{done ? "Dados repostos" : "Repor dados da empresa"}</h3>
              </div>
              <button onClick={close} className="text-ink-500 hover:text-ink-300"><X size={18} /></button>
            </div>

            {done ? (
              <>
                <p className="text-sm text-ink-300 mt-4">Foi apagado:</p>
                <div className="mt-3 space-y-1 text-sm">
                  {[["contas", "Contas"], ["contactos", "Contactos"], ["faturas", "Faturas"],
                    ["pagamentos", "Pagamentos"], ["lancamentos", "Lançamentos"],
                    ["reservas", "Reservas"], ["requisicoes", "Requisições"]].map(([k, label]) => (
                    <div key={k} className="flex justify-between border-b border-ink-800 py-1.5">
                      <span className="text-ink-400">{label}</span>
                      <span className="font-semibold">{done[k] ?? 0}</span>
                    </div>
                  ))}
                </div>
                <button onClick={close} className="btn-primary w-full justify-center mt-5">Fechar</button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-300 mt-4 leading-relaxed">
                  Vais apagar <strong>todos</strong> os dados financeiros de <strong>{orgName}</strong>.
                  Não há forma de recuperar. Só o proprietário da empresa pode fazer isto.
                </p>
                <label className="label mt-5">
                  Escreve <span className="text-red-400">{orgName}</span> para confirmar
                </label>
                <input className="input" value={text} onChange={e => setText(e.target.value)}
                  placeholder={orgName} autoFocus autoComplete="off" />
                {err && <p className="text-[12px] text-red-400 mt-2">{err}</p>}
                <div className="flex gap-2 justify-end mt-5">
                  <button onClick={close} className="btn-ghost">Cancelar</button>
                  <button onClick={run} disabled={!matches || busy}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 transition-colors inline-flex items-center gap-2">
                    {busy ? <><Loader2 size={14} className="animate-spin" /> A apagar…</> : <><Trash2 size={14} /> Apagar tudo</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
