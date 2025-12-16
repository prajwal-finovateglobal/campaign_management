/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://cms-backend.finovateglobal.com/:path*', // Proxy to backend
      },
    ];
  },
};

module.exports = nextConfig;

