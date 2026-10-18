import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Permite dois builds lado a lado nos testes e2e (com e sem Supabase configurado).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
