/** @type {import('next').NextConfig} */

/**
 * Server Actions reject a request whose browser Origin differs from the
 * server's Host. Behind a proxy that rewrites the host — GitHub Codespaces, a
 * tunnel, a platform preview URL — they always differ, and every form on the
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
  '*.app.github.dev',
  '*.github.dev',
  '*.gitpod.io',
  '*.repl.co',
];

const extra = (process.env.LABFLOW_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  eslint: { dirs: ['src'] },
  experimental: {
    serverComponentsExternalPackages: ['pg'],
    serverActions: { allowedOrigins: [...codespace, ...proxyOrigins, ...extra] },
  },
};
export default nextConfig;
