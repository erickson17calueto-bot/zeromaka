import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider, NO_FLASH_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "ZeroMaka — Gestão financeira sem maka",
  description: "ERP financeiro para negócios angolanos. Contas, faturas, transações e caixa em Kwanzas."
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
