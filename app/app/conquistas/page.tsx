"use client";
import { useStore } from "@/lib/store";
import { levelFor, LEVELS } from "@/lib/data";
import { Trophy, Lock, Flame, Star } from "lucide-react";

export default function ConquistasPage() {
  const { badges, profile } = useStore();
  const lv = levelFor(profile.xp);
  const unlocked = badges.filter((b) => b.unlocked);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="h-page">Conquistas</h1>
        <p className="text-sm text-ink-400 mt-1">Cada boa decisão financeira vale XP. Sobe de nível gerindo bem o teu dinheiro.</p>
      </header>

      <div className="card p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-14 w-14 rounded-xl bg-maka-500/15 border border-maka-500/40 flex items-center justify-center text-maka-400"><Star size={26} /></div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-display text-lg">Nível {lv.level} — {lv.name}</div>
            <div className="mt-2 h-2 rounded-full bg-ink-800 overflow-hidden">
              <div className="h-full bg-maka-500" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-[12px] text-ink-400">
              {profile.xp.toLocaleString("pt-AO")} XP{lv.next ? ` · faltam ${(lv.next.min - profile.xp).toLocaleString("pt-AO")} XP para ${lv.next.name}` : " · nível máximo!"}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1.5 text-maka-400 font-display text-xl"><Flame size={19} />{profile.streak}</div>
            <div className="text-[11px] text-ink-500 uppercase tracking-wider font-bold">Dias de streak</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {badges.map((b) => (
          <div key={b.id} className={`card p-4 flex items-center gap-4 ${b.unlocked ? "border-maka-500/30" : "opacity-70"}`}>
            <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${b.unlocked ? "bg-maka-500/15 text-maka-400" : "bg-ink-800 text-ink-500"}`}>
              {b.unlocked ? <Trophy size={19} /> : <Lock size={17} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-[12px] text-ink-400">{b.desc}</div>
            </div>
            <div className={`text-[12px] font-bold shrink-0 ${b.unlocked ? "text-maka-400" : "text-ink-500"}`}>+{b.xp} XP</div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Níveis do ZeroMaka</h2>
        <div className="space-y-2">
          {LEVELS.map((l) => (
            <div key={l.level} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${l.level === lv.level ? "bg-maka-500/10 border border-maka-500/30 text-maka-300" : "text-ink-400"}`}>
              <span>Nível {l.level} — {l.name}</span>
              <span className="text-[12px]">{l.min.toLocaleString("pt-AO")}+ XP</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-500">{unlocked.length} de {badges.length} conquistas desbloqueadas.</p>
      </div>
    </div>
  );
}
