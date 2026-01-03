import type {NextConfig} from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'export',
  // Allow imports from core directory outside web (for Turbopack)
  turbopack: {
    resolveAlias: {
      '@core': path.resolve(__dirname, '../core'),
    },
  },
  // Webpack config for fallback
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@core': path.resolve(__dirname, '../core'),
    };
    // Resolve .js imports to .ts files in core directory
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
