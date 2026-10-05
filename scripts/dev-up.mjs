#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = process.env.CARHISTORY_WORK_DIR ?? resolve(root, '../../work');
const servicesDir = join(workDir, 'services');
const stateDir = join(workDir, 'dev');
const logDir = join(stateDir, 'logs');
const pgDataDir = join(workDir, 'postgres');
const args = process.argv.slice(2);

mkdirSync(logDir, { recursive: true });

const parseEnv = (file) =>
  Object.fromEntries(
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .map((line) => line.replace(/^#.*$/, '').trim())
      .filter((line) => line.includes('='))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );

if (!existsSync(join(root, '.env'))) {
  const template = readFileSync(join(root, '.env.example'), 'utf8').replace(
    /^JWT_ACCESS_SECRET=.*$/m,
    `JWT_ACCESS_SECRET=${randomBytes(48).toString('base64url')}`,
  );
  writeFileSync(join(root, '.env'), template);
  console.log('Created .env from .env.example with a fresh JWT_ACCESS_SECRET');
}

const env = { ...parseEnv('.env.example'), ...parseEnv('.env') };
const portOf = (value, fallback) => Number(value?.match(/:(\d+)/)?.[1] ?? fallback);
const pgPort = portOf(env.DATABASE_URL, 5432);
const redisPort = portOf(env.REDIS_URL, 6379);
const s3Port = portOf(env.STORAGE_ENDPOINT, 9000);
const apiPort = Number(env.PORT ?? 3001);
const webPort = portOf(env.FRONTEND_URL, 5173);
const smtpPort = Number(env.SMTP_PORT ?? 1025);
const smtpWebPort = Number(env.SMTP_WEB_PORT ?? 8025);
const s3Bucket = env.STORAGE_BUCKET ?? 'carhistory';
const pgUser = env.DATABASE_URL?.match(/^\w+:\/\/([^:@/]+)/)?.[1] ?? 'carhistory';
const pgDatabase = env.DATABASE_URL?.match(/\/\/[^/]+\/([^?]+)/)?.[1] ?? 'carhistory';

const portOpen = (port, host = '127.0.0.1') =>
  new Promise((res) => {
    const socket = connect({ port, host });
    const done = (value) => {
      socket.destroy();
      res(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(700, () => done(false));
  });

const waitFor = async (label, port, host = '127.0.0.1', timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port, host)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} did not start on ${host}:${port} within ${timeoutMs}ms, see ${logFile(label)}`);
};

const binDirs = [
  '/opt/homebrew/opt/postgresql@18/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/usr/lib/postgresql/18/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
  '/usr/lib/postgresql/15/bin',
  '/usr/local/bin',
  '/usr/bin',
];
const findBin = (name, extra = []) => {
  for (const dir of [...extra, ...binDirs]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  const found = spawnSync('which', [name], { encoding: 'utf8' });
  return found.status === 0 && found.stdout.trim() ? found.stdout.trim() : null;
};

const logFile = (name) => join(logDir, `${name}.log`);
const launch = (name, command, commandArgs, options = {}) => {
  const fd = openSync(logFile(name), 'a');
  const child = spawn(command, commandArgs, { stdio: ['ignore', fd, fd], detached: true, ...options });
  child.unref();
  writeFileSync(join(stateDir, `${name}.pid`), String(child.pid));
  console.log(`${name} started (pid ${child.pid}, log ${logFile(name)})`);
  return child;
};

const readPid = (name) => {
  const file = join(stateDir, `${name}.pid`);
  return existsSync(file) ? Number(readFileSync(file, 'utf8')) : null;
};
const alive = (pid) =>
  Boolean(pid) &&
  (() => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  })();

const pnpm = (pnpmArgs, options = {}) => {
  const result = spawnSync('pnpm', pnpmArgs, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`pnpm ${pnpmArgs.join(' ')} failed`);
};

if (args.includes('down')) {
  for (const name of ['worker', 'web', 'api', 'mailpit', 's3', 'redis']) {
    const pid = readPid(name);
    if (!alive(pid)) continue;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`${name} stopped (pid ${pid})`);
  }
  const pgCtl = findBin('pg_ctl');
  if (pgCtl && existsSync(join(pgDataDir, 'postmaster.pid'))) {
    const result = spawnSync(pgCtl, ['stop', '-D', pgDataDir, '-m', 'fast'], { stdio: 'inherit' });
    console.log(result.status === 0 ? 'postgres stopped' : 'postgres stop failed');
  }
  process.exit(0);
}

const step = (message) => console.log(`\n== ${message}`);

step('Dependencies');
if (!existsSync(join(root, 'node_modules'))) pnpm(['install']);

step('PostgreSQL');
const pgCtl = findBin('pg_ctl');
if (await portOpen(pgPort)) {
  console.log(`postgres already listening on ${pgPort}`);
} else {
  if (!pgCtl) throw new Error('PostgreSQL not found: install postgresql@18 or add its bin directory to PATH');
  if (!existsSync(join(pgDataDir, 'PG_VERSION'))) {
    const initdb = findBin('initdb');
    if (!initdb) throw new Error('initdb not found next to pg_ctl');
    mkdirSync(pgDataDir, { recursive: true });
    const fd = openSync(logFile('initdb'), 'a');
    const result = spawnSync(initdb, ['-D', pgDataDir, '-U', pgUser, '--auth=trust'], { stdio: ['ignore', fd, fd] });
    if (result.status !== 0) throw new Error(`initdb failed, see ${logFile('initdb')}`);
    console.log(`initialised cluster ${pgDataDir} (superuser ${pgUser})`);
  }
  launch('postgres', pgCtl, ['start', '-D', pgDataDir, '-o', `-p ${pgPort} -k ${stateDir}`, '-l', logFile('postgres')]);
  await waitFor('postgres', pgPort);
  writeFileSync(join(stateDir, 'postgres.pid'), readFileSync(join(pgDataDir, 'postmaster.pid'), 'utf8').split('\n')[0]);
}

const psql = findBin('psql');
if (!psql) throw new Error('psql not found: install postgresql@18 or add its bin directory to PATH');
const tryQuery = (sql, database, user) => {
  const result = spawnSync(psql, ['-h', '127.0.0.1', '-d', database, '-tAc', sql], {
    env: { ...process.env, PGPORT: String(pgPort), PGUSER: user },
    encoding: 'utf8',
  });
  return result.status === 0 ? { ok: true, value: result.stdout.trim() } : { ok: false, error: result.stderr.trim() };
};
const adminUser = [...new Set([pgUser, 'postgres', process.env.USER].filter(Boolean))].find(
  (user) => tryQuery('select 1', 'postgres', user).ok,
);
if (!adminUser) throw new Error(`PostgreSQL on ${pgPort} rejects every candidate admin role`);
const admin = (sql) => {
  const result = tryQuery(sql, 'postgres', adminUser);
  if (!result.ok) throw new Error(`psql failed: ${result.error}`);
  return result.value;
};
const appQuery = (sql) => {
  const result = tryQuery(sql, pgDatabase, pgUser);
  if (!result.ok) throw new Error(`psql failed as ${pgUser}: ${result.error}`);
  return result.value;
};
if (admin(`select 1 from pg_roles where rolname='${pgUser}'`) !== '1') {
  admin(`create role "${pgUser}" superuser login`);
  console.log(`created role ${pgUser}`);
}
if (admin(`select 1 from pg_database where datname='${pgDatabase}'`) !== '1') {
  admin(`create database "${pgDatabase}" owner "${pgUser}"`);
  console.log(`created database ${pgDatabase}`);
}

step('Redis');
if (await portOpen(redisPort)) {
  console.log(`redis already listening on ${redisPort}`);
} else {
  const redisServer = findBin('redis-server', [join(servicesDir, 'redis-7.4.2/src')]);
  if (!redisServer) throw new Error('redis-server not found: build redis in work/services or install it');
  mkdirSync(join(stateDir, 'redis'), { recursive: true });
  launch('redis', redisServer, ['--port', String(redisPort), '--dir', join(stateDir, 'redis'), '--appendonly', 'yes']);
  await waitFor('redis', redisPort);
}

step('S3 storage');
if (await portOpen(s3Port)) {
  console.log(`s3 already listening on ${s3Port}`);
} else {
  mkdirSync(join(stateDir, 'storage'), { recursive: true });
  launch('s3', process.execPath, [join(root, 'scripts/dev-s3.mjs'), join(stateDir, 'storage')], {
    env: { ...process.env, STORAGE_ENDPOINT: env.STORAGE_ENDPOINT, STORAGE_BUCKET: s3Bucket },
  });
  await waitFor('s3', s3Port);
}

step('Mailpit');
if (await portOpen(smtpPort)) {
  console.log(`mailpit already listening on ${smtpPort}`);
} else {
  const mailpit = findBin('mailpit', [servicesDir]);
  if (!mailpit) {
    console.log('mailpit not found, skipping (outgoing email is not captured)');
  } else {
    launch('mailpit', mailpit, [
      '--smtp', `127.0.0.1:${smtpPort}`,
      '--listen', `127.0.0.1:${smtpWebPort}`,
      '--database', join(stateDir, 'mailpit.db'),
    ]);
    await waitFor('mailpit', smtpWebPort);
  }
}

step('Database');
pnpm(['--filter', '@carhistory/validation', 'build']);
pnpm(['db:generate']);
pnpm(['db:migrate']);
if (args.includes('--no-seed')) {
  console.log('seed skipped');
} else {
  const users = Number(appQuery('select count(*) from "User"'));
  if (users === 0) pnpm(['db:seed']);
  else console.log(`already seeded (${users} users)`);
}

if (args.includes('--no-app')) {
  console.log('\nInfrastructure ready. Start the app with: pnpm dev');
  process.exit(0);
}

step('Application');
const waited = [];
for (const [name, pnpmArgs, port] of [
  ['api', ['--filter', '@carhistory/api', 'dev'], apiPort],
  ['web', ['--filter', '@carhistory/web', 'dev'], webPort],
  ['worker', ['worker'], null],
]) {
  if (port && (await portOpen(port))) {
    console.log(`${name} already running on ${port}`);
    continue;
  }
  if (alive(readPid(name))) {
    console.log(`${name} already running (pid ${readPid(name)})`);
    continue;
  }
  launch(name, 'pnpm', pnpmArgs, { cwd: root });
  if (port) waited.push([name, port]);
}
if (waited.length > 0) await Promise.all(waited.map(([name, port]) => waitFor(name, port)));

console.log(
  `\nReady. web http://127.0.0.1:${webPort} | api http://127.0.0.1:${apiPort}/api/v1 | mailpit http://127.0.0.1:${smtpWebPort}`,
);
console.log('Stop everything with: pnpm dev:down');
process.exit(0);
