/** @type {import('next').NextConfig} */
const rawApiUrl = process.env.API_URL || 'http://localhost:4000';
const apiUrl = rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')
  ? rawApiUrl
  : rawApiUrl.includes(':') && !rawApiUrl.includes('.')
  ? `http://${rawApiUrl}`
  : `https://${rawApiUrl}`;

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@barbershop/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
