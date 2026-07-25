"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { REGIMES, TaxRegime, CommissionMember } from "@/lib/data";
import { Loader2, Building2, Upload, Percent, Plus, Trash2, Users } from "lucide-react";
import DangerZone from "@/components/DangerZone";

export default function EmpresaPage() {
  const { company, updateCompany } = useStore();
  const [name, setName] = useState(company.name);
  const [nif, setNif] = useState(company.nif);
  const [address, setAddress] = useState(company.address);
  const [phone, setPhone] = useState(company.phone);
  const [email, setEmail] = useState(company.email || "");
  const [regime, setRegime] = useState<TaxRegime>(company.regime);
  const [logo, setLogo] = useState(company.logo);

  // Comissões
  const [paysCommercial, setPaysCommercial] = useState(company.commissions.paysCommercial);
  const [members, setMembers] = useState<CommissionMember[]>(company.commissions.members);
  const [paysClients, setPaysClients] = useState(company.commissions.paysClients);
  const [clientPercent, setClientPercent] = useState(String(company.commissions.clientPercent || ""));
  const [clientNote, setClientNote] = useState(company.commissions.clientNote);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setLogo(r.result as string); r.readAsDataURL(f);
  };

  const addMember = () => setMembers((m) => [...m, { id: "m" + Date.now(), name: "", percent: 0 }]);
  const setMember = (id: string, patch: Partial<CommissionMember>) => setMembers((m) => m.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeMember = (id: string) => setMembers((m) => m.filter((x) => x.id !== id));

  const save = () => {
    setSaving(true); setSaved(false);
    setTimeout(() => {
      updateCompany({
        name, nif, address, phone, email, regime, logo,
        commissions: {
          paysCommercial,
          members: members.filter((m) => m.name.trim()).map((m) => ({ ...m, percent: Number(m.percent) || 0 })),
          paysClients, clientPercent: Number(clientPercent) || 0, clientNote
        }
      });
      setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    }, 500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">Empresa</h1>
        <p className="text-sm text-ink-400 mt-1">Estes dados alimentam as faturas, os documentos impressos e o cálculo de impostos.</p>
      </header>

      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl border border-ink-700 bg-ink-950 flex items-center justify-center overflow-hidden shrink-0">
            {logo ? <img src={logo} alt="logo" className="h-full w-full object-cover" /> : <Building2 className="text-ink-600" size={26} />}
          </div>
          <div>
            <label className="btn-ghost cursor-pointer"><Upload size={15} /> Carregar logótipo<input type="file" accept="image/*" onChange={onLogo} className="hidden" /></label>
            <p className="text-[11px] text-ink-500 mt-1.5">Aparece nas requisições e relatórios exportados.</p>
          </div>
        </div>

        <div><label className="label">Nome da empresa</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">NIF</label><input className="input" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
          <div><label className="label">Telefone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Endereço</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><label className="label">E-mail</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>

        <div>
          <label className="label">Regime tributário</label>
          <div className="space-y-2">
            {(Object.keys(REGIMES) as TaxRegime[]).map((r) => (
              <button key={r} onClick={() => setRegime(r)} className={`w-full text-left rounded-lg border p-3 transition-colors ${regime === r ? "border-maka-500 bg-maka-500/10" : "border-ink-700 hover:border-ink-500"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{REGIMES[r].label}</span>
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${regime === r ? "bg-maka-500 text-onbrand" : "bg-ink-800 text-ink-300"}`}>{REGIMES[r].tax}</span>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-500 mt-2">O imposto fica contido no valor da fatura (por dentro) e serve de referência no apuramento — Geral 14%, Simplificado 7%, Exclusão 1%.</p>
        </div>
      </div>

      {/* Comissões */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2"><Percent size={17} className="text-maka-400" /><h2 className="font-display text-lg">Comissões</h2></div>

        <div className="rounded-lg border border-ink-700 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium flex items-center gap-2"><Users size={15} className="text-ink-400" /> Paga comissão ao departamento comercial?</span>
            <input type="checkbox" checked={paysCommercial} onChange={(e) => setPaysCommercial(e.target.checked)} className="h-4 w-4 accent-maka-500" />
          </label>
          {paysCommercial && (
            <div className="mt-4 space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex gap-2 items-center">
                  <input className="input flex-1" placeholder="Nome do membro" value={m.name} onChange={(e) => setMember(m.id, { name: e.target.value })} />
                  <div className="relative w-24">
                    <input className="input pr-6" type="number" placeholder="0" value={m.percent || ""} onChange={(e) => setMember(m.id, { percent: Number(e.target.value) })} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-sm">%</span>
                  </div>
                  <button onClick={() => removeMember(m.id)} className="text-ink-500 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                </div>
              ))}
              <button onClick={addMember} className="btn-ghost w-full justify-center"><Plus size={14} /> Adicionar membro</button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-ink-700 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">Paga comissão a clientes / parceiros?</span>
            <input type="checkbox" checked={paysClients} onChange={(e) => setPaysClients(e.target.checked)} className="h-4 w-4 accent-maka-500" />
          </label>
          {paysClients && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Percentagem por venda</label>
                <div className="relative"><input className="input pr-6" type="number" placeholder="0" value={clientPercent} onChange={(e) => setClientPercent(e.target.value)} /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-sm">%</span></div>
              </div>
              <div><label className="label">Nota / valor mensal</label><input className="input" placeholder="Ex.: 50.000 Kz/mês" value={clientNote} onChange={(e) => setClientNote(e.target.value)} /></div>
            </div>
          )}
          <p className="text-[11px] text-ink-500 mt-3">A configuração fica guardada. O lançamento automático destas comissões como saída chega na Fase 2.</p>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary w-full justify-center disabled:opacity-60">
        {saving ? <><Loader2 size={15} className="animate-spin" /> A guardar…</> : saved ? "Guardado com sucesso!" : "Guardar definições"}
      </button>

      <DangerZone />
    </div>
  );
}
