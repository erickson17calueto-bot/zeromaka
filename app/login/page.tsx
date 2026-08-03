import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

// A rota antiga foi renomeada para /entrar. Mantida como redirecionamento porque
// já existe em ligações partilhadas e nas Redirect URLs configuradas no Supabase.
export default function LoginRedirect() {
  redirect(ROUTES.entrar);
}
