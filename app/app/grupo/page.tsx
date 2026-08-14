"use client";
import { useEffect, useState } from "react";
import { useStore, OrgSnapshot } from "@/lib/store";
import { fmtKz } from "@/lib/data";
import { Building2, Layers, ArrowRight, Loader2 } from "lucide-react";

type Row = { id: string; name: string; role: string; snapshot: OrgSnapshot | null; error: boolean };

function monthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export default function GrupoPage() {
  const { organizations, orgId, switchOrganization, getOrgSnapshot } = useStore();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (organizations.length === 0) return;
    let cancelled = false;
    setRows(null);
    (async () => {
      const { start, end } = monthRange();
      const results = await Promise.all(organizations.map(async (o) => {
        const snapshot = await getOrgSnapshot(o.id, start, end);
        return { id: o.id, name: o.name, role: o.role, snapshot, error: snapshot === null };
      }));
      if (!cancelled) setRows(results);
    })();
    return () => { cancelled = true; };
  }, [organizations, getOrgSnapshot]);

  const totals = rows?.reduce((acc, r) => {
    if (!r.snapshot) return acc;
    return {
      balance: acc.balance + r.snapshot.balance,
      result: acc.result + r.snapshot.result,
      receivableOpen: acc.receivableOpen + r.snapshot.receivableOpen,
      payableOpen: acc.payableOpen + r.snapshot.payableOpen,
    };
  }, { balance: 0, result: 0, receivableOpen: 0, payableOpen: 0 });

  const doSwitch = async (id: string) => {
    if (id === orgId) return;
    setSwitching(id);
    await switchOrganization(id);
    setSwitching(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight flex items-center gap-2">
          <Layers size={24} className="text-maka-400" /> Painel de grupo
        </h1>
        <p className="text-sm text-ink-400 mt-1">
          Um retrato do mês atual de cada empresa a que tens acesso, lado a lado. Cada empresa continua totalmente separada — isto é só uma vista de leitura para comparar.
        </p>
      </header>

      {organizations.length <= 1 && (
        <div className="card p-8 text-center">
          <Building2 className="mx-auto text-ink-600 mb-3" size={32} />
          <p className="text-sm text-ink-400">Só tens acesso a uma empresa. O painel de grupo compara várias — cria ou entra numa segunda em Administração &gt; Empresas.</p>
        </div>
      )}

      {organizations.length > 1 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-[11px] uppercase tracking-wider text-ink-500">
                    <th className="text-left font-semibold px-4 py-3">Empresa</th>
                    <th className="text-right font-semibold px-4 py-3">Saldo atual</th>
                    <th className="text-right font-semibold px-4 py-3">Resultado do mês</th>
                    <th className="text-right font-semibold px-4 py-3">A receber (aberto)</th>
                    <th className="text-right font-semibold px-4 py-3">A pagar (aberto)</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {rows === null && (
                    <tr><td colSpan={6} className="p-8 text-center text-ink-500">
                      <Loader2 className="mx-auto mb-2 animate-spin" size={20} /> A carregar…
                    </td></tr>
                  )}
                  {rows?.map(r => {
                    const active = r.id === orgId;
                    return (
                      <tr key={r.id} className={active ? "bg-maka-500/5" : ""}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 size={15} className={active ? "text-maka-400 shrink-0" : "text-ink-500 shrink-0"} />
                            <span className="truncate font-medium">{r.name}</span>
                            {active && <span className="shrink-0 text-[10px] text-maka-400 font-bold uppercase">aqui</span>}
                          </div>
                        </td>
                        {r.error ? (
                          <td colSpan={4} className="px-4 py-3 text-right text-[12px] text-red-400">Não foi possível carregar</td>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right font-medium">{fmtKz(r.snapshot!.balance)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${r.snapshot!.result >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(r.snapshot!.result)}</td>
                            <td className="px-4 py-3 text-right text-ink-300">{fmtKz(r.snapshot!.receivableOpen)}</td>
                            <td className="px-4 py-3 text-right text-ink-300">{fmtKz(r.snapshot!.payableOpen)}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right">
                          {!active && (
                            <button onClick={() => void doSwitch(r.id)} disabled={switching === r.id}
                              className="btn-ghost text-xs shrink-0 disabled:opacity-40">
                              {switching === r.id ? "A entrar…" : <>Entrar <ArrowRight size={12} /></>}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totals && rows && rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-ink-800 text-sm font-semibold">
                      <td className="px-4 py-3">Total do grupo</td>
                      <td className="px-4 py-3 text-right">{fmtKz(totals.balance)}</td>
                      <td className={`px-4 py-3 text-right ${totals.result >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(totals.result)}</td>
                      <td className="px-4 py-3 text-right">{fmtKz(totals.receivableOpen)}</td>
                      <td className="px-4 py-3 text-right">{fmtKz(totals.payableOpen)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <p className="text-[11px] text-ink-500">
            Resultado do mês exclui aportes e retiradas de capital (não são lucro). A receber/a pagar mostram só documentos ainda em aberto.
          </p>
        </>
      )}
    </div>
  );
}
