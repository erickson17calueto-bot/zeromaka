"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth/messages";
import { ROUTES } from "@/lib/routes";
import PasswordInput from "@/components/PasswordInput";
import { ArrowRight, Loader2 } from "lucide-react";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O link de recuperação cria a sessão antes desta página abrir; sem ela o
  // link expirou ou foi aberto fora do fluxo.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, []);

  const mismatch = confirm.length > 0 && pass !== confirm;
  const valid = pass.length >= 6 && pass === confirm;

  const submit = async () => {
    if (busy || !valid) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) { setError(friendlyAuthError(error.message)); return; }
      router.push(`${ROUTES.entrar}?aviso=${encodeURIComponent("Palavra-passe atualizada. Entra com a nova.")}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (hasSession === null) {
    return <p className="text-sm text-ink-500">A validar o link…</p>;
  }

  if (!hasSession) {
    return (
      <>
        <h1 className="font-display text-2xl">Link inválido</h1>
        <p className="text-sm text-ink-400 mt-2">
          Este link de recuperação expirou ou já foi usado. Pede um novo.
        </p>
        <Link href={ROUTES.recuperarSenha} className="btn-primary w-full justify-center mt-6">
          Pedir novo link <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl">Nova palavra-passe</h1>
      <p className="text-sm text-ink-400 mt-1 mb-6">Escolhe uma palavra-passe nova para a tua conta.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <PasswordInput id="password" label="Nova palavra-passe" value={pass} onChange={setPass}
          autoComplete="new-password" required hint="Mínimo 6 caracteres." />

        <div>
          <PasswordInput id="confirm" label="Confirmar palavra-passe" value={confirm} onChange={setConfirm}
            autoComplete="new-password" onEnter={submit} required />
          {mismatch && <p role="alert" className="mt-1.5 text-[12px] text-red-400">As palavras-passe não coincidem.</p>}
        </div>

        <button type="submit" disabled={busy || !valid} className="btn-primary w-full justify-center disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <>Guardar palavra-passe <ArrowRight size={15} aria-hidden="true" /></>}
        </button>
      </form>
    </>
  );
}
