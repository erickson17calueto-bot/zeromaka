"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Building2, Calculator, CheckCircle2, Plus, RefreshCw, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { fmtDate, fmtKz } from "@/lib/data";

type CostCenter = { id: string; code: string; name: string; description?: string; active: boolean };
type Asset = { id: string; cost_center_id?: string; code: string; name: string; asset_category: string; acquisition_date: string; purchase_cost: number; salvage_value: number; useful_life_months: number; status: "active" | "disposed" | "fully_depreciated"; notes?: string };
type DepreciationEvent = { id: string; asset_id: string; period_start: string; period_end: string; amount: number; notes?: string; created_at: string };
const isoToday = () => new Date().toISOString().slice(0, 10);
const elapsedMonths = (date: string) => { const start = new Date(`${date}T00:00:00`); const end = new Date(`${isoToday()}T00:00:00`); let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(); if (end.getDate() < start.getDate()) months--; return Math.max(0, months); };
const depreciation = (asset: Asset) => { const depreciable = Math.max(0, asset.purchase_cost - asset.salvage_value); const monthly = depreciable / asset.useful_life_months; const accumulated = Math.min(depreciable, monthly * elapsedMonths(asset.acquisition_date)); return { monthly, accumulated, net: asset.purchase_cost - accumulated }; };

export default function PatrimonioPage() {
  const { orgId } = useStore();
  const supabase = useMemo(() => createClient(), []);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depreciationEvents, setDepreciationEvents] = useState<DepreciationEvent[]>([]);
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [centerCode, setCenterCode] = useState("");
  const [centerName, setCenterName] = useState("");
  const [centerDescription, setCenterDescription] = useState("");
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("Equipamento");
  const [acquisitionDate, setAcquisitionDate] = useState(isoToday());
  const [purchaseCost, setPurchaseCost] = useState("");
  const [salvageValue, setSalvageValue] = useState("0");
  const [usefulLife, setUsefulLife] = useState("36");
  const [costCenterId, setCostCenterId] = useState("");
  const [assetNotes, setAssetNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [c, a, e] = await Promise.all([
      supabase.from("cost_centers").select("*").eq("organization_id", orgId).order("name"),
      supabase.from("fixed_assets").select("*").eq("organization_id", orgId).order("acquisition_date", { ascending: false }),
      supabase.from("fixed_asset_depreciation_events").select("*").eq("organization_id", orgId).order("period_start", { ascending: false }),
    ]);
    if (c.data) setCenters(c.data);
    if (a.data) setAssets(a.data.map(x => ({ ...x, purchase_cost: Number(x.purchase_cost), salvage_value: Number(x.salvage_value), useful_life_months: Number(x.useful_life_months) })));
    if (e.data) setDepreciationEvents(e.data.map(x => ({ ...x, amount: Number(x.amount) })));
    if (c.error || a.error || e.error) setMessage((c.error || a.error || e.error)?.message || "Não foi possível carregar o património.");
  }, [orgId, supabase]);
  useEffect(() => { load(); }, [load]);

  const visibleAssets = assets.filter(a => !selectedCenter || a.cost_center_id === selectedCenter);
  const selectedAsset = assets.find(a => a.id === selectedAssetId) || visibleAssets[0];
  const totalCost = visibleAssets.reduce((s, a) => s + a.purchase_cost, 0);
  const totalNet = visibleAssets.reduce((s, a) => s + depreciation(a).net, 0);

  const saveCenter = async (event: FormEvent) => {
    event.preventDefault(); if (!orgId || !centerCode.trim() || !centerName.trim()) return;
    setSaving(true); setMessage(""); const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("cost_centers").insert({ organization_id: orgId, created_by: user?.id, code: centerCode.trim(), name: centerName.trim(), description: centerDescription.trim() || null });
    setSaving(false); if (error) { setMessage(error.message); return; }
    setCenterCode(""); setCenterName(""); setCenterDescription(""); await load();
  };
  const saveAsset = async (event: FormEvent) => {
    event.preventDefault(); if (!orgId || !assetCode.trim() || !assetName.trim() || !purchaseCost || Number(purchaseCost) <= 0 || Number(salvageValue) > Number(purchaseCost)) return;
    setSaving(true); setMessage(""); const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("fixed_assets").insert({ organization_id: orgId, created_by: user?.id, cost_center_id: costCenterId || null, code: assetCode.trim(), name: assetName.trim(), asset_category: assetCategory.trim() || "Outros", acquisition_date: acquisitionDate, purchase_cost: Number(purchaseCost), salvage_value: Number(salvageValue) || 0, useful_life_months: Number(usefulLife) || 1, notes: assetNotes.trim() || null });
    setSaving(false); if (error) { setMessage(error.message); return; }
    setAssetCode(""); setAssetName(""); setPurchaseCost(""); setAssetNotes(""); await load();
  };
  const dispose = async (asset: Asset) => { const { error } = await supabase.from("fixed_assets").update({ status: asset.status === "disposed" ? "active" : "disposed", updated_at: new Date().toISOString() }).eq("id", asset.id); if (error) setMessage(error.message); else await load(); };
  const recordDepreciation = async (asset: Asset) => {
    const start = new Date(); start.setDate(1);
    const end = new Date(start); end.setMonth(end.getMonth() + 1, 0);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("fixed_asset_depreciation_events").insert({
      organization_id: orgId, asset_id: asset.id,
      period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
      amount: depreciation(asset).monthly, created_by: user?.id,
      notes: "Estimativa mensal de depreciação linear",
    });
    if (error) setMessage(error.message); else await load();
  };
  const selectedDep = selectedAsset ? depreciation(selectedAsset) : null;
  const schedule = selectedAsset && selectedDep ? Array.from({ length: Math.min(12, Math.max(0, selectedAsset.useful_life_months - elapsedMonths(selectedAsset.acquisition_date))) }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1, 1); return { month: d.toLocaleDateString("pt-PT", { month: "short", year: "numeric" }), amount: selectedDep.monthly }; }) : [];

  return <div className="max-w-6xl mx-auto space-y-6"><header className="flex items-end justify-between flex-wrap gap-3"><div><div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><Wrench size={17} /> Património e estrutura</div><h1 className="font-display text-2xl md:text-3xl tracking-tight mt-1">Ativos e centros de custo</h1><p className="text-sm text-ink-400 mt-1">Organiza equipamentos, acompanha valor líquido e separa responsabilidades.</p></div><button className="btn-ghost" onClick={load}><RefreshCw size={15} /> Atualizar</button></header>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Ativos visíveis</div><div className="font-display text-2xl mt-1">{visibleAssets.length}</div></div><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Custo de aquisição</div><div className="font-display text-xl mt-1">{fmtKz(totalCost)}</div></div><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Valor líquido estimado</div><div className="font-display text-xl mt-1 text-maka-400">{fmtKz(totalNet)}</div></div></div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><form onSubmit={saveCenter} className="card p-5 space-y-4"><div className="flex items-center gap-2 font-semibold"><Building2 size={16} className="text-maka-400" /> Novo centro de custo</div><div className="grid grid-cols-3 gap-2"><div><label className="label">Código</label><input className="input" value={centerCode} onChange={e => setCenterCode(e.target.value)} placeholder="CC-01" required /></div><div className="col-span-2"><label className="label">Nome</label><input className="input" value={centerName} onChange={e => setCenterName(e.target.value)} placeholder="Operações" required /></div></div><div><label className="label">Descrição</label><input className="input" value={centerDescription} onChange={e => setCenterDescription(e.target.value)} placeholder="Área ou unidade responsável" /></div><button className="btn-primary" disabled={saving}><Plus size={15} /> Criar centro</button><div className="pt-3 border-t border-ink-800"><label className="label">Filtrar ativos por centro</label><select className="input" value={selectedCenter} onChange={e => setSelectedCenter(e.target.value)}><option value="">Todos os centros</option>{centers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div></form>

      <form onSubmit={saveAsset} className="card p-5 space-y-4"><div className="flex items-center gap-2 font-semibold"><Plus size={16} className="text-maka-400" /> Registar ativo fixo</div><div className="grid grid-cols-3 gap-2"><div><label className="label">Código</label><input className="input" value={assetCode} onChange={e => setAssetCode(e.target.value)} placeholder="AT-001" required /></div><div className="col-span-2"><label className="label">Nome</label><input className="input" value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="Computador portátil" required /></div></div><div className="grid grid-cols-2 gap-2"><div><label className="label">Categoria</label><input className="input" value={assetCategory} onChange={e => setAssetCategory(e.target.value)} /></div><div><label className="label">Centro de custo</label><select className="input" value={costCenterId} onChange={e => setCostCenterId(e.target.value)}><option value="">Sem centro</option>{centers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div></div><div className="grid grid-cols-3 gap-2"><div><label className="label">Aquisição</label><input className="input" type="date" value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)} required /></div><div><label className="label">Custo</label><input className="input" type="number" min="0.01" step="0.01" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} required /></div><div><label className="label">Residual</label><input className="input" type="number" min="0" step="0.01" value={salvageValue} onChange={e => setSalvageValue(e.target.value)} /></div></div><div className="grid grid-cols-2 gap-2"><div><label className="label">Vida útil (meses)</label><input className="input" type="number" min="1" value={usefulLife} onChange={e => setUsefulLife(e.target.value)} /></div><div><label className="label">Notas</label><input className="input" value={assetNotes} onChange={e => setAssetNotes(e.target.value)} placeholder="Nº de série, localização…" /></div></div><button className="btn-primary" disabled={saving}><Plus size={15} /> Guardar ativo</button>{message && <p className="text-sm text-red-400">{message}</p>}</form></div>

    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start"><section className="card overflow-hidden"><div className="p-5 border-b border-ink-800"><h2 className="font-semibold">Ativos registados</h2><p className="text-xs text-ink-500 mt-1">A estimativa usa depreciação linear entre custo e valor residual.</p></div>{visibleAssets.length === 0 ? <div className="p-10 text-center text-sm text-ink-500">Ainda não há ativos neste filtro.</div> : <div className="divide-y divide-ink-800">{visibleAssets.map(asset => { const d = depreciation(asset); const center = centers.find(c => c.id === asset.cost_center_id); return <button key={asset.id} className={`w-full text-left p-4 hover:bg-ink-900/60 ${selectedAsset?.id === asset.id ? "bg-maka-500/5" : ""}`} onClick={() => setSelectedAssetId(asset.id)}><div className="flex justify-between gap-3"><div><div className="font-semibold">{asset.code} · {asset.name}</div><div className="text-xs text-ink-500 mt-1">{asset.asset_category} · {center ? `${center.code} · ${center.name}` : "Sem centro"} · {asset.status === "disposed" ? "Baixado" : "Ativo"}</div></div><div className="text-right"><div className="font-display text-lg">{fmtKz(d.net)}</div><div className="text-[11px] text-ink-500">líquido estimado</div></div></div><div className="mt-3 flex justify-between text-xs text-ink-500"><span>Aquisição: {fmtDate(asset.acquisition_date)}</span><span>Depreciação/mês: {fmtKz(d.monthly)}</span></div></button>; })}</div>}</section>

      <section className="card p-5"><div className="flex items-center gap-2 font-semibold"><Calculator size={16} className="text-maka-400" /> Depreciação estimada</div>{selectedAsset && selectedDep ? <><div className="mt-4"><div className="font-semibold">{selectedAsset.name}</div><div className="text-xs text-ink-500 mt-1">{selectedAsset.useful_life_months} meses · {elapsedMonths(selectedAsset.acquisition_date)} decorridos</div></div><div className="grid grid-cols-2 gap-2 mt-4"><div className="rounded-lg bg-ink-900 p-3"><div className="text-[11px] text-ink-500">Acumulada</div><div className="font-semibold mt-1">{fmtKz(selectedDep.accumulated)}</div></div><div className="rounded-lg bg-ink-900 p-3"><div className="text-[11px] text-ink-500">Mensal</div><div className="font-semibold mt-1">{fmtKz(selectedDep.monthly)}</div></div></div><div className="mt-5 text-xs text-ink-500">Próximos meses</div><div className="mt-2 space-y-2">{schedule.map(row => <div key={row.month} className="flex justify-between text-xs"><span>{row.month}</span><span className="text-maka-400">{fmtKz(row.amount)}</span></div>)}{schedule.length === 0 && <div className="text-xs text-ink-500">Ativo totalmente depreciado.</div>}</div><div className="space-y-2 mt-5"><button className="btn-primary w-full" onClick={() => recordDepreciation(selectedAsset)}><CheckCircle2 size={14} /> Registar estimativa deste mês</button><button className="btn-ghost w-full" onClick={() => dispose(selectedAsset)}><Archive size={14} /> {selectedAsset.status === "disposed" ? "Reativar ativo" : "Marcar como baixado"}</button></div><div className="mt-4">{depreciationEvents.filter(e => e.asset_id === selectedAsset.id).slice(0, 6).map(e => <div key={e.id} className="flex justify-between text-xs text-ink-500 py-1"><span>{fmtDate(e.period_start)}</span><span className="text-maka-400">{fmtKz(e.amount)}</span></div>)}</div><p className="text-[10px] text-ink-600 mt-3">Isto é uma estimativa patrimonial. O lançamento contabilístico de depreciação depende da conta e política configuradas.</p></> : <div className="py-10 text-center text-sm text-ink-500">Seleciona um ativo para ver a projeção.</div>}</section></div>
  </div>;
}