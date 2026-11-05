import type { Request, Response } from 'express';
import app from '../server.js';

export default function handler(req: Request, res: Response) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('__betadesk_path');

  if (path !== null) {
    url.searchParams.delete('__betadesk_path');
    req.url = `/api/betadesk/${path}${url.search}`;
  }

  return app(req, res);
}
