import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const u=new URL(process.env.DATABASE_URL),output=resolve(process.argv[2]??`backups/carhistory-${new Date().toISOString().replaceAll(':','-')}.dump`);
mkdirSync(resolve(output,'..'),{recursive:true});
const result=spawnSync('pg_dump',['--format=custom','--file',output],{stdio:'inherit',env:{...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1)}});
if(result.status!==0)process.exit(result.status??1);console.log(`Backup saved to ${output}`);
