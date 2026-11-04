import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // linting runs through `pnpm lint` (root ESLint flat config)
  transpilePackages: [
    '@pencil/engine',
    '@pencil/package-pages',
    '@pencil/benchmarks',
    '@pencil/parcels',
    '@pencil/assistant',
    '@pencil/db',
    '@pencil/exports',
  ],
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs', 'postgres'],
};

export default nextConfig;
