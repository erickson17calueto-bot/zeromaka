"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function OnboardingPage() {
  const { createOrganization } = useStore();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !companyName.trim() || !userName.trim()) {
      setError("Preenche todos os campos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createOrganization(orgName.trim(), companyName.trim(), userName.trim());
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar organização.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 bg-ink-900 rounded-2xl p-8 border border-ink-800">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-display text-ink-100">Bem-vindo ao ZeroMaka</h1>
          <p className="text-sm text-ink-400">Configura a tua organização para começar.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">O teu nome</label>
            <input value={userName} onChange={e => setUserName(e.target.value)}
              className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-maka-500/40"
              placeholder="Ex: João Silva" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">Nome da organização</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)}
              className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-maka-500/40"
              placeholder="Ex: Maka Lda" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1">Nome da empresa</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-maka-500/40"
              placeholder="Ex: Maka Comércio Geral" />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-maka-500 hover:bg-maka-600 disabled:opacity-50 text-onbrand font-medium py-2.5 text-sm transition-colors">
          {loading ? "A criar…" : "Criar organização"}
        </button>
      </form>
    </div>
  );
}
