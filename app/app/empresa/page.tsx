import { redirect } from "next/navigation";

// O perfil da empresa (e a zona de perigo) passaram a viver dentro da aba
// "Perfil" de /app/administracao — um único sítio para tudo o que só
// owner/admin deveriam poder tocar, em vez de uma página sem qualquer
// proteção de UI. Mantido como redirect para não partir marcadores/links.
export default function EmpresaRedirect() {
  redirect("/app/administracao?tab=perfil");
}
