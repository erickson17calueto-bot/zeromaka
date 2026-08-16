import { redirect } from "next/navigation";

// O fecho de período passou para a aba "Governança" de /app/administracao.
// O editor de papéis e o visualizador de auditoria que também viviam aqui
// eram uma segunda cópia do que já existe nas abas Equipa/Auditoria — não
// foram movidos, só deixaram de estar duplicados. Mantido como redirect
// para não partir marcadores/links.
export default function GovernancaRedirect() {
  redirect("/app/administracao?tab=governanca");
}
