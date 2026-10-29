/** @type {import('next').NextConfig} */

/**
 * Server Actions reject a request whose browser Origin differs from the
 * server's Host. Behind a proxy that rewrites the host, GitHub Codespaces, a
 * tunnel, a platform preview URL, they always differ, and every form on the
 * site fails with "Invalid Server Actions request".
 *
 * Codespaces publishes its own hostname, so name that exactly rather than
 * trusting a wildcard. The wildcards stay as a fallback for tunnels and for
 * ports other than 3001.
 */
const codespace =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? [
        `${process.env.CODESPACE_NAME}-3001.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
        `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
      ]
    : [];

const proxyOrigins = [
  'localhost:3001',
  '127.0.0.1:3001',
  // Anyone can host a page on these, so they are trusted in development only.
  // A deployment names its own domain through NEXT_PUBLIC_APP_URL below.
  ...(process.env.NODE_ENV === 'production' ? [] : ['*.app.github.dev', '*.github.dev', '*.gitpod.io', '*.repl.co']),
];

/**
 * Sent with every response. No other site may frame Labquill, so a page
 * cannot lay it under an invisible layer and steer a click onto "Delete this
 * lab". Links out carry only the site's origin, never a full address, so a
 * reset or calendar token in a URL cannot leak through a Referer. Browsers
 * may not guess a file's type, and the site is HTTPS-only once visited.
 * A full Content-Security-Policy would also have to allow Google Sheets,
 * Drive, YouTube and PayPal, and is left until it can be tested against all
 * of them; frame-ancestors is the part that guards against clickjacking.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const extra = (process.env.LABFLOW_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * The deployed domain is already declared once, for PayPal redirects and email
 * links. Deriving the allowed origin from it means a real deployment needs no
 * second variable saying the same thing, and forms do not silently fail on a
 * host that terminates TLS in front of the app.
 */
const deployed = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? [new URL(process.env.NEXT_PUBLIC_APP_URL).host] : [];
  } catch {
    return [];
  }
})();

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  eslint: { dirs: ['src'] },
  // The guide's screenshots are already sized, and nothing else goes through
  // next/image. Unused, the optimizer endpoint is only attack surface: Next 14
  // carries open advisories against it, remote code execution among them.
  images: { unoptimized: true },
  // Bundles the server and only the dependencies it actually reaches, so the
  // container does not need node_modules or a package manager to boot.
  output: 'standalone',
  experimental: {
    // src/instrumentation.ts starts the yearly renewal reminders.
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pg'],
    serverActions: {
      allowedOrigins: [...codespace, ...deployed, ...proxyOrigins, ...extra],
      // A protocol PDF or a run's files arrive with the form itself; the 1 MB
      // default rejected an ordinary scanned protocol.
      bodySizeLimit: '30mb',
    },
  },
};
export default nextConfig;
