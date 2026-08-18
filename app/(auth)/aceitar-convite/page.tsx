"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/messages";
import { ROUTES } from "@/lib/routes";
import PasswordInput from "@/components/PasswordInput";
import { ArrowRight, Loader2, PartyPopper } from "lucide-react";

// Última etapa de quem aceitou um convite por email: o link já criou sessão
// e /auth/callback já chamou accept_organization_invite() (a adesão à
// organização já existe nesta altura) — falta só a pessoa escolher o nome
// que quer usar e definir a própria palavra-passe.
export default function AceitarConvitePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, []);

  const mismatch = confirm.length > 0 && pass !== confirm;
  const valid = name.trim().length >= 2 && pass.length >= 6 && pass === confirm;

  const submit = async () => {
    if (busy || !valid) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const nome = name.trim();
      const { data: userData, error: updErr } = await supabase.auth.updateUser({
        password: pass, data: { full_name: nome },
      });
      if (updErr) { setError(friendlyAuthError(updErr.message)); return; }

      const uid = userData.user?.id;
      if (uid) await supabase.from("profiles").update({ full_name: nome }).eq("id", uid);

      router.push(ROUTES.dashboard);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (hasSession === null) {
    return <p className="text-sm text-ink-500">A validar o convite…</p>;
  }

  if (!hasSession) {
    return (
      <>
        <h1 className="font-display text-2xl">Convite inválido</h1>
        <p className="text-sm text-ink-400 mt-2">
          Este link de convite expirou ou já foi usado. Pede à pessoa que te convidou para enviar um novo.
        </p>
        <Link href={ROUTES.entrar} className="btn-primary w-full justify-center mt-6">
          Ir para o login <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="h-11 w-11 rounded-xl bg-maka-500/15 flex items-center justify-center text-maka-400">
        <PartyPopper size={21} aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-display text-2xl">Falta pouco</h1>
      <p className="text-sm text-ink-400 mt-1 mb-6">
        Escolhe o teu nome e uma palavra-passe para entrares na organização.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="label" htmlFor="nome">O teu nome</label>
          <input id="nome" className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ana Silva" autoComplete="name" autoFocus required />
        </div>

        <PasswordInput id="password" label="Palavra-passe" value={pass} onChange={setPass}
          autoComplete="new-password" required hint="Mínimo 6 caracteres." />

        <div>
          <PasswordInput id="confirm" label="Confirmar palavra-passe" value={confirm} onChange={setConfirm}
            autoComplete="new-password" onEnter={submit} required />
          {mismatch && <p role="alert" className="mt-1.5 text-[12px] text-red-400">As palavras-passe não coincidem.</p>}
        </div>

        <button type="submit" disabled={busy || !valid} className="btn-primary w-full justify-center disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Entrar na organização <ArrowRight size={15} aria-hidden="true" /></>}
        </button>
      </form>
    </>
  );
}
