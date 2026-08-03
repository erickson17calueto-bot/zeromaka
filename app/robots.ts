import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/onboarding"],
      disallow: ["/api/", "/contas", "/transacoes", "/faturas", "/cobrancas", "/contas-a-pagar", "/reservas", "/recorrencias", "/reconciliacao", "/planeamento", "/documentos", "/importacoes", "/governanca", "/patrimonio", "/requisicoes", "/capital", "/contactos", "/relatorios", "/conquistas", "/ranking", "/empresa", "/perfil"],
    },
    sitemap: "https://zeromaka.com/sitemap.xml",
  };
}
