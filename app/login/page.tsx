"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const go = () => {
    login(email);
    router.push("/");
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
          <h2 className="font-display text-2xl">Entrar</h2>
          <p className="text-sm text-ink-400 mt-1 mb-6">Modo demonstração — entra com qualquer e-mail.</p>
          <div className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" placeholder="teu@email.ao" value={email}
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
            </div>
            <div>
              <label className="label">Palavra-passe</label>
              <input className="input" type="password" placeholder="••••••••" value={pass}
                onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
            </div>
            <button onClick={go} className="btn-primary w-full justify-center">Entrar no ZeroMaka <ArrowRight size={15} /></button>
          </div>
          <p className="mt-6 text-[12px] text-ink-500">Ao entrar, os dados de demonstração são carregados localmente no teu navegador. Nada é enviado para servidores.</p>
        </div>
      </div>
    </div>
  );
}
