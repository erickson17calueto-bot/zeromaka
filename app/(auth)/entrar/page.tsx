"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/messages";
import { ROUTES, safeNext } from "@/lib/routes";
import PasswordInput from "@/components/PasswordInput";
import { ArrowRight, Loader2 } from "lucide-react";

function EntrarForm() {
  const router = useRouter();
  const params = useSearchParams();
  // safeNext bloqueia redirecionamentos para fora do site (open redirect).
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("erro"));
  const notice = params.get("aviso");

  const go = async () => {
    if (busy || !email || !pass) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) { setError(friendlyAuthError(error.message)); return; }
      router.push(next || ROUTES.dashboard);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-2xl">Entrar</h1>
      <p className="text-sm text-ink-400 mt-1 mb-6">Entra com o teu e-mail e palavra-passe.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
      {notice && !error && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>
      )}

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" placeholder="teu@email.ao" value={email}
            autoComplete="email" required autoFocus onChange={(e) => setEmail(e.target.value)} />
        </div>

        <PasswordInput id="password" label="Palavra-passe" value={pass} onChange={setPass}
          autoComplete="current-password" onEnter={go} required />

        <button type="submit" disabled={busy || !email || !pass}
          className="btn-primary w-full justify-center disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Entrar no ZeroMaka <ArrowRight size={15} aria-hidden="true" /></>}
        </button>
      </form>

      <p className="mt-3 text-sm">
        <Link href={ROUTES.recuperarSenha} className="text-ink-400 hover:text-maka-400 hover:underline">
          Esqueci a palavra-passe
        </Link>
      </p>

      <p className="mt-4 text-sm text-ink-400">
        Ainda não tens conta?{" "}
        <Link href={ROUTES.criarConta} className="text-maka-400 hover:underline font-medium">Criar conta</Link>
      </p>
    </>
  );
}

export default function EntrarPage() {
  // useSearchParams exige um limite de Suspense para a página poder ser pré-renderizada.
  return (
    <Suspense fallback={<div className="text-sm text-ink-500">A carregar…</div>}>
      <EntrarForm />
    </Suspense>
  );
}
