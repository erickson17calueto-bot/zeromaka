import { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/routes";

const BASE = "https://zeromaka.com";

// Prioridades por página: a entrada e as páginas de decisão pesam mais do que
// as legais. Gerado a partir de PUBLIC_ROUTES para o sitemap nunca conter uma
// página privada por engano.
const PRIORIDADE: Record<string, number> = {
  "/": 1,
  "/funcionalidades": 0.9,
  "/precos": 0.9,
  "/seguranca": 0.7,
  "/sobre": 0.6,
  "/ajuda": 0.6,
  "/contacto": 0.6,
  "/termos": 0.3,
  "/privacidade": 0.3,
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((rota) => ({
    url: rota === "/" ? BASE : `${BASE}${rota}`,
    changeFrequency: "monthly" as const,
    priority: PRIORIDADE[rota] ?? 0.5,
  }));
}
