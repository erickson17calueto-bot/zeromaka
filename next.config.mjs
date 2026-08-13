/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança. Antes disto, a única proteção que chegava ao
// browser era o HSTS que a Vercel injeta — não havia CSP, nem X-Frame-Options,
// nem nosniff. Numa aplicação que aprova requisições e movimenta dinheiro, a
// ausência de frame-ancestors permitia clickjacking (embutir /app num iframe
// alheio e enganar o utilizador a clicar em "Aprovar").
//
// O que a CSP tem de deixar passar, confirmado no código:
//   - script inline: app/layout.tsx injeta o NO_FLASH_SCRIPT com
//     dangerouslySetInnerHTML, daí o 'unsafe-inline' em script-src. O ideal
//     seria um nonce, mas isso obriga a tornar o layout dinâmico — fica como
//     melhoria futura, não como bloqueio agora.
//   - fontes do Google (fonts.googleapis.com / fonts.gstatic.com)
//   - o browser fala diretamente com o Supabase (connect-src)
//   - logos de empresa por URL https e imagens embutidas (data:)
//   - o mapa de origem em dev precisa de 'unsafe-eval'
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
