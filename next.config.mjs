/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'flagsmith-nodejs'],
  },
};

export default nextConfig;
