# ZeroMaka SaaS — Charter do Projeto

> Documento de referência. Toda decisão de desenvolvimento deve respeitar estas regras.
> Data: 2026-07-23

## Produto

ZeroMaka é um micro SaaS de gestão financeira diária para pequenas e médias empresas angolanas.

O produto deve responder claramente:

1. Quanto dinheiro a empresa possui?
2. Quanto desse dinheiro está comprometido?
3. Quanto pode ser gasto com segurança?
4. Quanto os clientes devem?
5. Quais pagamentos vencem em breve?
6. A empresa terá dinheiro suficiente nos próximos 7, 30 e 90 dias?

## Stack

- Next.js 14 App Router · TypeScript · React · Tailwind CSS
- Supabase (PostgreSQL, autenticação, armazenamento)
- Deploy na Vercel
- **Não atualizar versões principais durante a migração inicial**, salvo quando estritamente necessário e aprovado.

## Regras de desenvolvimento

- Trabalhar em fases pequenas e verificáveis.
- Antes de editar, analisar o código relacionado e apresentar o plano.
- Não implementar várias fases numa única alteração.
- Preservar a interface atual sempre que possível; não redesenhar páginas sem solicitação explícita.
- Executar build, lint e testes após cada fase. Não declarar fase concluída com build/testes falhando.
- Documentar decisões importantes em `docs/`.
- Commits pequenos e descritivos.
- Nunca apagar funcionalidades existentes sem explicar e obter aprovação.

## Segurança e multiempresa

- Todo dado empresarial pertence a uma organização (`organization_id` em todas as tabelas empresariais).
- Row Level Security em todas as tabelas expostas.
- Um utilizador só acede a organizações das quais é membro.
- Nunca colocar chave `service_role` no navegador; não expor segredos em `NEXT_PUBLIC_*`.
- Verificar autorização no servidor **e** na base de dados; nunca confiar apenas no frontend.
- Não usar `user_metadata` para decisões de autorização.
- Nunca gravar dados financeiros sensíveis no `localStorage`.

## Regras financeiras

- Representação monetária consistente e documentada (sem floats inseguros).
- O saldo da conta não é fonte independente — deriva das movimentações.
- Operações relacionadas são atómicas: pagamento + atualização de documento + criação de movimento na **mesma transação de base de dados**.
- Movimentos confirmados não são apagados silenciosamente; correções mantêm histórico e auditoria.
- Toda mudança financeira relevante gera registo em `audit_logs`.
- Estimativas fiscais não são aconselhamento contabilístico definitivo.
- Sem faturação fiscal certificada nesta fase.

## Escopo inicial (ordem de implementação)

1. Autenticação
2. Organizações
3. Membros e funções
4. Empresa e perfil
5. Contas financeiras
6. Contactos
7. Camada de acesso aos dados
8. Row Level Security
9. Logs básicos de auditoria

### Fora de escopo (por agora)

Ranking · Conquistas · IA · WhatsApp automático · App móvel · Assinaturas/pagamentos · Emissão fiscal certificada · Previsão financeira avançada · Integração bancária.

## Processo de qualidade (por funcionalidade)

1. Definir critérios de aceitação
2. Implementar
3. Executar testes
4. Executar `npm run build`
5. Rever segurança
6. Resumir ficheiros alterados
7. Informar riscos e trabalho pendente
