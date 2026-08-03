"use client";
import { useStore } from "@/lib/store";
import { seedRanking } from "@/lib/data";
import { Medal, Crown } from "lucide-react";

export default function RankingPage() {
  const { profile } = useStore();
  const rows = seedRanking
    .map((r) => (r.me ? { ...r, xp: profile.xp, name: profile.name } : r))
    .sort((a, b) => b.xp - a.xp);
  const myIdx = rows.findIndex((r: any) => r.me);
  const ahead = myIdx > 0 ? rows[myIdx - 1].xp - rows[myIdx].xp : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">Ranking semanal</h1>
        <p className="text-sm text-ink-400 mt-1">Compara a tua disciplina financeira com outros gestores ZeroMaka.</p>
      </header>

      {myIdx > 0 && (
        <div className="card p-4 border-maka-500/30 text-sm text-ink-300">
          Estás a <span className="text-maka-400 font-semibold">{ahead.toLocaleString("pt-AO")} XP</span> do lugar #{myIdx}. Liquida faturas vencidas para subir mais rápido.
        </div>
      )}

      <div className="card divide-y divide-ink-800">
        {rows.map((r: any, i) => (
          <div key={r.name} className={`p-4 flex items-center gap-4 ${r.me ? "bg-maka-500/5" : ""}`}>
            <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              i === 0 ? "bg-yellow-500/15 text-yellow-400" : i === 1 ? "bg-ink-300/15 text-ink-300" : i === 2 ? "bg-maka-700/30 text-maka-400" : "bg-ink-800 text-ink-400"}`}>
              {i === 0 ? <Crown size={17} /> : `#${i + 1}`}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold truncate ${r.me ? "text-maka-300" : ""}`}>{r.name}{r.me ? " (tu)" : ""}</div>
              <div className="text-[11px] text-ink-500">Saúde financeira: {r.health}%</div>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-300">
              <Medal size={15} className="text-maka-400" /> {r.xp.toLocaleString("pt-AO")} XP
            </div>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-ink-500">O ranking é anónimo por defeito — só o teu nome aparece completo para ti. Reinicia toda a segunda-feira.</p>
    </div>
  );
}
