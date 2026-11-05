import type { Request, Response } from 'express';
import app from '../../server.js';

export default function handler(req: Request, res: Response) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('__studio_path');

  if (path !== null) {
    url.searchParams.delete('__studio_path');
    url.searchParams.delete('path');
    req.url = `/api/studio/${path}${url.search}`;
  }

  return app(req, res);
}
