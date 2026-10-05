import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',fullyParallel:false,workers:1,retries:0,timeout:60000,use:{baseURL:process.env.E2E_BASE_URL??'http://localhost:5173',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:[['list'],['html',{open:'never'}]]});
