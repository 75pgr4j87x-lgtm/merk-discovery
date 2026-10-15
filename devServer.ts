import { createServer as createViteServer } from 'vite';
import express from 'express';
import path from 'node:path';
import app from './server.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const staticPath = path.resolve(process.cwd(), 'public');
    app.use(express.static(staticPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DiscoveryFlow server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start development server:', error);
  process.exit(1);
});