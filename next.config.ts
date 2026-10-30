import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: { cpus: 1 },
  webpack(config) {
    // This exact official export retains parse5 without Node-only URL loaders.
    config.resolve.alias = {
      ...config.resolve.alias,
      'cheerio$': path.join(process.cwd(), 'node_modules/cheerio/dist/browser/index.js'),
    };
    return config;
  },
};

export default nextConfig;
