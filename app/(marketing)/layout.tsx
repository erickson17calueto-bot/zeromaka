import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-ink-950">
      {/* Atalho para quem navega por teclado saltar a navegação repetida */}
      <a href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-lg focus:bg-maka-500 focus:px-4 focus:py-2 focus:text-onbrand focus:font-semibold">
        Saltar para o conteúdo
      </a>
      <MarketingHeader />
      <main id="conteudo" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
