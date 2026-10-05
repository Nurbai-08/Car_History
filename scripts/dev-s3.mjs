import S3rver from 's3rver';
import { mkdirSync } from 'node:fs';

const endpoint = new URL(process.env.STORAGE_ENDPOINT ?? 'http://127.0.0.1:9000');
const bucket = process.env.STORAGE_BUCKET ?? 'carhistory';
const directory = process.argv[2];

if (!directory) throw new Error('Storage directory argument required');

mkdirSync(directory, { recursive: true });

const server = new S3rver({
  port: Number(endpoint.port || 9000),
  address: endpoint.hostname,
  silent: true,
  directory,
  configureBuckets: [{ name: bucket }],
});

server.middleware.unshift(async (ctx, next) => {
  if (!ctx.get('authorization') && !ctx.query['X-Amz-Signature']) {
    ctx.status = 403;
    ctx.body = 'Private bucket: signed request required';
    return;
  }
  await next();
});

await server.run();
console.log(`Private local S3 storage ready on ${endpoint.port} (bucket ${bucket})`);
