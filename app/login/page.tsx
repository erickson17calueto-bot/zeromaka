"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Loader2 } from "lucide-react";

// Mensagens de erro do Supabase traduzidas para o utilizador
function friendlyError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou palavra-passe incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirma o teu e-mail antes de entrar (verifica a caixa de entrada).";
  if (msg.includes("User already registered")) return "Este e-mail já tem conta. Usa \"Entrar\".";
  if (msg.includes("Password should be at least")) return "A palavra-passe deve ter pelo menos 6 caracteres.";
  if (msg.includes("valid email")) return "Introduz um e-mail válido.";
  return "Não foi possível concluir. Tenta novamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setError(null); setNotice(null); setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) { setError(friendlyError(error.message)); return; }
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pass });
        if (error) { setError(friendlyError(error.message)); return; }
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          // Confirmação de e-mail ativa no projeto
          setNotice("Conta criada. Verifica o teu e-mail para confirmar antes de entrar.");
          setMode("signin");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-maka-600 p-12 text-ink-950">
        <div className="font-display text-2xl">ZERO<span className="text-ink-950/60">MAKA</span></div>
        <div>
          <h1 className="font-display text-4xl leading-tight">Gestão financeira<br />sem maka.</h1>
          <p className="mt-4 max-w-md text-ink-950/80 font-medium">
            Contas, faturas e caixa do teu negócio — tudo em Kwanzas, feito para a realidade angolana. BAI, Unitel Money, caixa físico: o teu dinheiro todo num só lugar.
          </p>
        </div>
        <div className="text-[12px] text-ink-950/60 font-medium">© 2026 ZeroMaka · Luanda, Angola</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden font-display text-2xl mb-8">ZERO<span className="text-maka-500">MAKA</span></div>
          <h2 className="font-display text-2xl">{mode === "signin" ? "Entrar" : "Criar conta"}</h2>
          <p className="text-sm text-ink-400 mt-1 mb-6">
            {mode === "signin" ? "Entra com o teu e-mail e palavra-passe." : "Cria a tua conta ZeroMaka em segundos."}
          </p>

          {error && <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          {notice && <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>}

          <div className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" placeholder="teu@email.ao" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
            </div>
            <div>
              <label className="label">Palavra-passe</label>
              <input className="input" type="password" placeholder="••••••••" value={pass}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
            </div>
            <button onClick={go} disabled={busy || !email || !pass} className="btn-primary w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <>{mode === "signin" ? "Entrar no ZeroMaka" : "Criar conta"} <ArrowRight size={15} /></>}
            </button>
          </div>

          <p className="mt-6 text-sm text-ink-400">
            {mode === "signin" ? "Ainda não tens conta?" : "Já tens conta?"}{" "}
            <button className="text-maka-400 hover:underline font-medium"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}>
              {mode === "signin" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
