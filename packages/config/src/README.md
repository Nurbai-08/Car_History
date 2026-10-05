# Configuration

TypeScript defaults live in `/tsconfig.base.json`; ESLint in `/eslint.config.mjs`; formatting in `/.prettierrc`.
API secrets are read only by the server. `.env.example` documents all runtime values. Vite reads only the frontend origin and API proxy destination from root environment for its dev-server configuration. The browser bundle never receives JWT, SMTP or storage secrets.
