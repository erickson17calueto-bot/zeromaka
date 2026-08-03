import { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/routes";

// Toda a aplicação vive sob /app e é privada, por isso basta bloquear esse
// prefixo em vez de manter uma lista de páginas — não há risco de esquecer uma.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_ROUTES,
      disallow: [
        "/app/",
        "/onboarding",
        "/entrar",
        "/criar-conta",
        "/recuperar-senha",
        "/redefinir-senha",
        "/login",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: "https://zeromaka.com/sitemap.xml",
  };
}
