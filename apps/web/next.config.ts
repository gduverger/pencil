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
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs', 'postgres', 'playwright'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Workspace packages are transpiled, so their imports of these Node-only libraries would be
      // bundled (PGlite's WASM loader then breaks); keep them as runtime requires instead.
      config.externals = [
        ...(config.externals ?? []),
        {
          '@electric-sql/pglite': 'commonjs @electric-sql/pglite',
          postgres: 'commonjs postgres',
          exceljs: 'commonjs exceljs',
          playwright: 'commonjs playwright',
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
