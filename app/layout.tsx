import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider, NO_FLASH_SCRIPT } from "@/lib/theme";

const DESCRICAO =
  "Saiba quanto pode gastar antes que falte dinheiro. Gestão financeira para pequenas e médias empresas em Angola — contas, faturas, impostos e caixa em Kwanzas.";

export const metadata: Metadata = {
  metadataBase: new URL("https://zeromaka.com"),
  title: {
    // As páginas definem só o seu nome; o sufixo da marca é acrescentado aqui.
    default: "ZeroMaka — Gestão financeira sem maka",
    template: "%s — ZeroMaka",
  },
  description: DESCRICAO,
  applicationName: "ZeroMaka",
  keywords: [
    "zeromaka", "zero maka", "gestão financeira Angola", "software financeiro Angola",
    "contas a receber", "fluxo de caixa", "IVA Angola", "kwanzas", "PME Angola",
  ],
  openGraph: {
    title: "ZeroMaka — Gestão financeira sem maka",
    description: DESCRICAO,
    url: "https://zeromaka.com",
    siteName: "ZeroMaka",
    locale: "pt_AO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZeroMaka — Gestão financeira sem maka",
    description: DESCRICAO,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script anti-flash escreve a classe do tema
    // no <html> antes da hidratação, o que o React veria como atributo extra.
    <html lang="pt-AO" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ThemeProvider>
          <StoreProvider>{children}</StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
