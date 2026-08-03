import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Que dados o ZeroMaka recolhe, para que os usa e que direitos tem sobre eles.",
  alternates: { canonical: "/privacidade" },
};

const ATUALIZADO = "3 de agosto de 2026";

export default function PrivacidadePage() {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
        <h1 className="font-display text-3xl tracking-tight">Política de privacidade</h1>
        <p className="mt-3 text-[13px] text-ink-500">Última atualização: {ATUALIZADO}</p>

        <div className="mt-10 space-y-9">
          <section>
            <h2 className="font-display text-xl tracking-tight">Que dados recolhemos</h2>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-sm font-semibold">Dados de conta</dt>
                <dd className="mt-1 text-sm text-ink-400 leading-relaxed">
                  Nome e endereço de e-mail. A palavra-passe é guardada apenas como hash — nem nós a conseguimos ler.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">Dados da empresa</dt>
                <dd className="mt-1 text-sm text-ink-400 leading-relaxed">
                  O que introduzir sobre a sua organização: nome, NIF, morada, contactos e regime fiscal.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">Dados financeiros</dt>
                <dd className="mt-1 text-sm text-ink-400 leading-relaxed">
                  Contas, movimentos, faturas, contactos de clientes e fornecedores, reservas e requisições
                  que registar ou importar.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">Dados técnicos mínimos</dt>
                <dd className="mt-1 text-sm text-ink-400 leading-relaxed">
                  Registos técnicos necessários ao funcionamento e à segurança do serviço, como erros da
                  aplicação e registos de auditoria das alterações feitas na sua organização.
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Para que usamos os dados</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Exclusivamente para lhe prestar o serviço: autenticar a sua sessão, guardar e apresentar a
              informação financeira da sua empresa, gerar relatórios e comunicar consigo sobre o serviço.
            </p>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              <strong className="text-ink-100">Não vendemos os seus dados.</strong> Não os partilhamos com
              terceiros para publicidade nem os usamos para perfilar utilizadores.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Quem tem acesso</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Apenas os membros que convidar para a sua organização, dentro do papel que lhes atribuir.
              A própria base de dados impede o acesso aos dados da sua empresa por parte de quem não é membro dela.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Fornecedores que usamos</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Para operar o serviço recorremos a fornecedores de infraestrutura que alojam a aplicação e a
              base de dados, e que processam os dados por nossa conta. Os dados são transmitidos por ligação
              cifrada. Não são partilhados com nenhuma outra entidade.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Quanto tempo guardamos</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Enquanto a sua conta existir. Se pedir a eliminação da conta, apagamos os dados associados,
              salvo o que tenhamos de conservar por obrigação legal.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Os seus direitos</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-300 leading-relaxed">
              <li>Aceder aos dados que temos sobre si.</li>
              <li>Corrigir dados incorretos, diretamente na aplicação.</li>
              <li>Exportar os seus dados em PDF ou Excel, a qualquer momento.</li>
              <li>Pedir a eliminação da sua conta e dos dados associados.</li>
            </ul>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Para exercer qualquer destes direitos,{" "}
              <Link href="/contacto" className="text-maka-400 hover:underline">contacte-nos</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Cookies</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Usamos apenas cookies necessários ao funcionamento: os que mantêm a sua sessão iniciada.
              Não usamos cookies de publicidade nem de rastreio entre sites, por isso não lhe mostramos
              um aviso de consentimento a pedir algo que não fazemos.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">Alterações</h2>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Se esta política mudar de forma significativa, avisamos por e-mail ou na aplicação antes de a
              alteração produzir efeito.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
