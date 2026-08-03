"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RECOVERY_NOTICE } from "@/lib/auth/messages";
import { ROUTES } from "@/lib/routes";
import { ArrowRight, Loader2 } from "lucide-react";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy || !email) return;
    setBusy(true);
    try {
      const supabase = createClient();
      // O resultado é ignorado de propósito: mostrar "este e-mail não existe"
      // permitiria descobrir que contas estão registadas.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(ROUTES.redefinirSenha)}`,
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-2xl">Recuperar palavra-passe</h1>
      <p className="text-sm text-ink-400 mt-1 mb-6">
        Introduz o teu e-mail para receber um link de recuperação.
      </p>

      {sent ? (
        <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
          {RECOVERY_NOTICE}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" placeholder="teu@email.ao" value={email}
              autoComplete="email" required autoFocus onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !email} className="btn-primary w-full justify-center disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Enviar link <ArrowRight size={15} aria-hidden="true" /></>}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-ink-400">
        Lembraste? <Link href={ROUTES.entrar} className="text-maka-400 hover:underline font-medium">Voltar ao login</Link>
      </p>
    </>
  );
}
