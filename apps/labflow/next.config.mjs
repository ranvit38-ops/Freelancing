/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { dirs: ['src'] },
  experimental: { serverComponentsExternalPackages: ['pg'] },
};
export default nextConfig;
