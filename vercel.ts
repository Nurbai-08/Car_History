import { routes, type VercelConfig } from '@vercel/config/v1';

const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');

if (!backendUrl && process.env.VERCEL) {
  throw new Error('BACKEND_URL must point to the public Railway API URL');
}

export const config: VercelConfig = {
  framework: 'vite',
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand:
    'pnpm --filter @carhistory/validation build && pnpm --filter @carhistory/web build',
  outputDirectory: 'apps/web/dist',
  rewrites: [
    routes.rewrite('/api/:path*', `${backendUrl ?? 'http://127.0.0.1:3001'}/api/:path*`),
    routes.rewrite('/:path*', '/index.html'),
  ],
};
