import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de utilização",
  description: "Condições de utilização do ZeroMaka.",
  alternates: { canonical: "/termos" },
};

const ATUALIZADO = "3 de agosto de 2026";

export default function TermosPage() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
        <h1 className="font-display text-3xl tracking-tight">Termos de utilização</h1>
        <p className="mt-3 text-[13px] text-ink-500">Última atualização: {ATUALIZADO}</p>

        <div className="mt-10 space-y-9">
          <section>
            <h2 className="font-display text-xl tracking-tight">1. O que é o ZeroMaka</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              O ZeroMaka é uma aplicação web de gestão financeira para empresas. Permite registar contas,
              movimentos, faturas a receber e a pagar, reservas e requisições, e gerar relatórios de gestão.
            </p>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              O ZeroMaka <strong className="text-ink-100">não é</strong> um programa de faturação certificado,
              não substitui serviços de contabilidade e os seus relatórios não constituem demonstrações
              financeiras certificadas.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">2. Conta e responsabilidade</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-300 leading-relaxed">
              <li>Para usar o serviço tem de criar uma conta com um e-mail válido e uma palavra-passe.</li>
              <li>É responsável por manter a palavra-passe em segredo e por toda a atividade feita na sua conta.</li>
              <li>Se convidar membros para a sua organização, é responsável pelos acessos que lhes atribui.</li>
              <li>Deve ter pelo menos 18 anos e capacidade para agir em nome da empresa que registar.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">3. Os seus dados</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Os dados que introduz continuam a ser seus. Nós apenas os alojamos e processamos para lhe
              prestar o serviço. Pode exportá-los a qualquer momento em PDF ou Excel. O tratamento de dados
              pessoais está descrito na{" "}
              <Link href="/privacidade" className="text-maka-400 hover:underline">Política de privacidade</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">4. Utilização aceitável</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">Ao usar o ZeroMaka concorda em não:</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-300 leading-relaxed">
              <li>Tentar aceder a dados de outra organização de que não seja membro.</li>
              <li>Testar, contornar ou explorar falhas de segurança sem nos comunicar previamente.</li>
              <li>Usar o serviço para atividades ilegais ou para registar informação que sabe ser falsa com intuito de fraude.</li>
              <li>Sobrecarregar a plataforma de forma automatizada ao ponto de prejudicar outros utilizadores.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">5. Preço</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              O ZeroMaka está atualmente gratuito. Se vierem a existir planos pagos, será avisado com
              antecedência e nenhuma conta passa a ser cobrada sem que escolha um plano de forma explícita.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">6. Disponibilidade e limitação de responsabilidade</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              O serviço é fornecido tal como está, sem garantia de disponibilidade permanente. Estando em
              fase de lançamento e gratuito, não oferecemos um acordo de nível de serviço.
            </p>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              As decisões de negócio que tomar com base na informação do ZeroMaka são da sua
              responsabilidade. Recomendamos que mantenha as suas próprias cópias dos dados relevantes,
              usando a exportação disponível na aplicação.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">7. Suspensão e cancelamento</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Pode deixar de usar o serviço quando quiser. Podemos suspender contas que violem estes termos,
              procurando avisar antes sempre que possível.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">8. Alterações a estes termos</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Se alterarmos estes termos de forma significativa, avisamos por e-mail ou na própria aplicação
              antes de as alterações produzirem efeito.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">9. Contacto</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Dúvidas sobre estes termos? <Link href="/contacto" className="text-maka-400 hover:underline">Fale connosco</Link>.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
