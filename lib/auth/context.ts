export function isExpiredSession(error: { code?: string } | null | undefined): boolean {
  return error?.code === "ZM_SESSION_EXPIRED" || error?.code === "PGRST301";
}

/** Only memberships returned under RLS may supply the active organization. */
export function activeOrganization(currentId: string | null | undefined, memberships: { id: string }[]): string | null {
  return memberships.find(org => org.id === currentId)?.id ?? memberships[0]?.id ?? null;
}

export const EXPIRED_LOGIN = "/entrar?aviso=sessao-expirada&next=%2Fapp%2Fdashboard";
