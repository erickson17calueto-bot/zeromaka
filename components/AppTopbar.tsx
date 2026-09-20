"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, FileText } from "lucide-react";
import { useStore } from "@/lib/store";

const PAGE_CONTEXT: Record<string, string> = {
  "/app/dashboard": "Visão geral",
  "/app/contas": "Contas",
  "/app/transacoes": "Movimentos",
  "/app/faturas": "A receber",
  "/app/cobrancas": "Cobranças",
  "/app/contas-a-pagar": "A pagar",
  "/app/importacoes": "Importar ficheiros",
  "/app/requisicoes": "Requisições",
  "/app/emprestimos": "Empréstimos e adiantamentos",
  "/app/relatorios": "Relatórios",
};

function pageContext(pathname: string) {
  return PAGE_CONTEXT[pathname] || "Gestão financeira";
}

/** Barra de contexto da área privada. Mantém os atalhos existentes; não cria funcionalidades fictícias. */
export default function AppTopbar() {
  const pathname = usePathname();
  const { organizations, orgId, profile } = useStore();
  const organization = organizations.find((item) => item.id === orgId);
  const initials = profile.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="workspace-topbar">
      <div className="min-w-0 flex items-center gap-2 text-sm">
        <span className="font-medium text-ink-200 truncate">{organization?.name || "ZeroMaka"}</span>
        <span className="text-ink-600">/</span>
        <span className="text-ink-500 truncate">{pageContext(pathname)}</span>
        <span className="hidden sm:inline-flex items-center gap-1.5 ml-2 text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sessão ativa
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Link href="/app/documentos" className="topbar-action" title="Documentos e alertas" aria-label="Documentos e alertas">
          <FileText size={16} />
        </Link>
        <Link href="/app/documentos" className="topbar-action" title="Ver alertas" aria-label="Ver alertas">
          <Bell size={16} />
        </Link>
        <Link href="/ajuda" className="topbar-action hidden sm:flex" title="Ajuda" aria-label="Ajuda">
          <CircleHelp size={16} />
        </Link>
        <Link href="/app/perfil" className="ml-1 h-8 w-8 rounded-full border border-maka-500/30 bg-maka-500/10 flex items-center justify-center text-[10px] font-bold text-maka-300" title="Meu perfil" aria-label="Meu perfil">
          {initials}
        </Link>
      </div>
    </header>
  );
}
