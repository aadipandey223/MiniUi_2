import { createVaultApiApp } from '../shared/vaultApi.ts';

// Vercel Serverless Function entry point (zero Vite dependency, no server.listen())
const { app } = createVaultApiApp({ mode: 'serverless' });

export default app;
