/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança. Antes disto, a única proteção que chegava ao
// browser era o HSTS que a Vercel injeta — não havia CSP, nem X-Frame-Options,
// nem nosniff. Numa aplicação que aprova requisições e movimenta dinheiro, a
// ausência de frame-ancestors permitia clickjacking (embutir /app num iframe
// alheio e enganar o utilizador a clicar em "Aprovar").
//
// O que a CSP tem de deixar passar, confirmado no código:
//   - fontes do Google (fonts.googleapis.com / fonts.gstatic.com)
//   - o browser fala diretamente com o Supabase (connect-src)
//   - logos de empresa por URL https e imagens embutidas (data:)
//   - em dev, o Fast Refresh do Next precisa de 'unsafe-eval' e de scripts
//     inline próprios; em produção nada disso é permitido.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return "https://*.supabase.co";
  }
})();

const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' é aqui uma limitação conhecida e deliberada, não um
  // descuido. Foi tentado restringir por hash (SHA-256 do NO_FLASH_SCRIPT) e
  // verificou-se num build de produção que parte a aplicação: além do nosso
  // script, o Next injeta os seus próprios scripts inline de hidratação
  // (self.__next_f.push(...)), cujo conteúdo varia com os dados de cada página
  // e por isso não tem hash fixo. Com a CSP por hash, o browser bloqueia-os e
  // a página fica servida mas sem interatividade nenhuma.
  //
  // A alternativa oficial é um nonce por pedido gerado no middleware, mas isso
  // obriga o layout raiz a ler headers() a cada pedido, o que torna TODO o
  // site dinâmico e faz perder o rendering estático das páginas públicas —
  // uma decisão de custo/arquitetura, não uma correção de segurança simples.
  //
  // O que continua a proteger, mesmo com 'unsafe-inline': connect-src impede
  // exfiltração para domínios de terceiros, frame-ancestors bloqueia
  // clickjacking, object-src/base-uri/form-action fecham vetores clássicos, e
  // o XSS que existia está corrigido na origem (escape + validação de URL).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co wss://*.supabase.co`,
  // O PDF/impressão corre num iframe about:blank criado por JS (mesmo origin).
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Anti-clickjacking. X-Frame-Options fica também, para browsers antigos.
  "frame-ancestors 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
