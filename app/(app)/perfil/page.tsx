"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { levelFor, fmtDate } from "@/lib/data";
import { Loader2, Lock, Flame } from "lucide-react";

function maskAngola(v: string) {
  const digits = v.replace(/\D/g, "").replace(/^244/, "").slice(0, 9);
  let out = "+244";
  if (digits.length > 0) out += " " + digits.slice(0, 3);
  if (digits.length > 3) out += " " + digits.slice(3, 6);
  if (digits.length > 6) out += " " + digits.slice(6, 9);
  return out;
}

export default function PerfilPage() {
  const { profile, updateProfile } = useStore();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lv = levelFor(profile.xp);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const save = () => {
    setSaving(true); setSaved(false);
    setTimeout(() => {
      updateProfile({ name, phone, email });
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 700);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header><h1 className="font-display text-2xl md:text-3xl tracking-tight">Meu perfil</h1></header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        <div className="card p-6 md:col-span-2 md:sticky md:top-6 text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-maka-500 flex items-center justify-center font-display text-2xl text-onbrand">{initials}</div>
          <div className="mt-3 font-display text-lg">{name}</div>
          <div className="text-[12px] text-ink-400">{email}</div>
          <div className="mt-3 inline-flex rounded-full bg-maka-500/15 border border-maka-500/40 text-maka-300 text-[11px] font-bold uppercase tracking-wider px-3 py-1">Plano {profile.plan}</div>
          <div className="mt-4 h-1.5 rounded-full bg-ink-800 overflow-hidden"><div className="h-full bg-maka-500" style={{ width: `${Math.round(lv.progress * 100)}%` }} /></div>
          <div className="mt-2 text-[11px] text-ink-400">Nível {lv.level} · {lv.name} · {profile.xp.toLocaleString("pt-AO")} XP</div>
          <div className="mt-3 flex justify-center gap-4 text-[12px] text-ink-300"><span className="flex items-center gap-1 text-maka-400"><Flame size={13} /> {profile.streak} dias</span><span>Membro desde 2026</span></div>
        </div>

        <div className="md:col-span-3 space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold">Informação pessoal</h2>
            <div><label className="label">Nome completo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label">Telefone (Angola)</label><input className="input" value={phone} onChange={(e) => setPhone(maskAngola(e.target.value))} placeholder="+244 9XX XXX XXX" /></div>
            <div><label className="label">E-mail</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">Dados bloqueados <Lock size={14} className="text-ink-500" /></h2>
            {[["Número do B.I.", profile.bi], ["Plano atual", `Plano ${profile.plan}`], ["Próxima renovação", fmtDate(profile.renewal)]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-dashed border-ink-700 px-3 py-2.5 flex items-center justify-between text-sm"><span className="text-ink-400">{k}</span><span className="font-medium">{v}</span></div>
            ))}
            <p className="text-[11px] text-ink-500">Por segurança, o B.I. só pode ser corrigido pelo suporte após verificação de identidade. Os dados da empresa editam-se em Empresa.</p>
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full justify-center disabled:opacity-60">{saving ? <><Loader2 size={15} className="animate-spin" /> A guardar…</> : saved ? "Guardado com sucesso!" : "Guardar alterações"}</button>
        </div>
      </div>
    </div>
  );
}
