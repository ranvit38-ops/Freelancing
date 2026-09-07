/** @type {import('next').NextConfig} */

/**
 * Server Actions verify that the browser's Origin matches the server's Host.
 * Behind a proxy that rewrites the host — GitHub Codespaces, a tunnel, a
 * platform preview URL — those differ and every form is rejected. List the
 * proxy hosts here so the check passes without being switched off.
 */
const proxyOrigins = ['*.app.github.dev', '*.github.dev', '*.gitpod.io'];

const extra = (process.env.LABFLOW_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  eslint: { dirs: ['src'] },
  experimental: {
    serverComponentsExternalPackages: ['pg'],
    serverActions: { allowedOrigins: [...proxyOrigins, ...extra] },
  },
};
export default nextConfig;
