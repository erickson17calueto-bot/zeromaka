"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/messages";
import { ROUTES } from "@/lib/routes";
import PasswordInput from "@/components/PasswordInput";
import { track } from "@/lib/analytics";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";

export default function CriarContaPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const valid = name.trim().length >= 2 && email.includes("@") && pass.length >= 6 && terms;

  const submit = async () => {
    if (busy || !valid) return;
    setError(null);
    setBusy(true);
    track("registo_iniciado");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          // Guardado no utilizador para o perfil já nascer com nome.
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(friendlyAuthError(error.message)); return; }
      track("registo_concluido");

      if (data.session) {
        // Confirmação de e-mail desligada no projeto — entra já.
        router.push(ROUTES.onboarding);
        router.refresh();
      } else {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-maka-500/15 border border-maka-500/40 flex items-center justify-center text-maka-400 mb-4">
          <MailCheck size={22} aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl">Confirma o teu e-mail</h1>
        <p className="text-sm text-ink-400 mt-2">
          Enviámos um link para <span className="text-ink-200 font-medium">{email}</span>. Abre-o para ativar a conta.
        </p>
        <p className="text-[13px] text-ink-500 mt-4">Não recebeste? Verifica o spam.</p>
        <button onClick={resend} disabled={busy}
          className="mt-2 text-sm text-maka-400 hover:underline font-medium disabled:opacity-60">
          {busy ? "A reenviar…" : "Reenviar e-mail"}
        </button>
        <p className="mt-6 text-sm text-ink-400">
          <Link href={ROUTES.entrar} className="text-maka-400 hover:underline font-medium">Voltar ao início de sessão</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl">Criar conta</h1>
      <p className="text-sm text-ink-400 mt-1 mb-6">
        Gratuito. Os dados da empresa são configurados a seguir.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="label" htmlFor="nome">
            O teu nome<span className="text-maka-400" aria-hidden="true"> *</span>
          </label>
          <input id="nome" className="input" type="text" placeholder="Ex: João Silva" value={name}
            autoComplete="name" required autoFocus onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="email">
            E-mail<span className="text-maka-400" aria-hidden="true"> *</span>
          </label>
          <input id="email" className="input" type="email" placeholder="teu@email.ao" value={email}
            autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
        </div>

        <PasswordInput id="password" label="Palavra-passe" value={pass} onChange={setPass}
          autoComplete="new-password" onEnter={submit} required hint="Mínimo 6 caracteres." />

        <label className="flex items-start gap-2.5 text-[13px] text-ink-400 cursor-pointer">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-700 bg-ink-800 text-maka-500 focus:ring-2 focus:ring-maka-500/40" />
          <span>
            Aceito os <Link href="/termos" className="text-maka-400 hover:underline">Termos de utilização</Link> e a{" "}
            <Link href="/privacidade" className="text-maka-400 hover:underline">Política de privacidade</Link>.
          </span>
        </label>

        <button type="submit" disabled={busy || !valid} className="btn-primary w-full justify-center disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Criar conta <ArrowRight size={15} aria-hidden="true" /></>}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-400">
        Já tens conta? <Link href={ROUTES.entrar} className="text-maka-400 hover:underline font-medium">Entrar</Link>
      </p>
    </>
  );
}
