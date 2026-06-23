/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow remote images if a client points logo/og images at a CDN.
  // SETUP REQUIRED: add the client's image host here if they use external images.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
