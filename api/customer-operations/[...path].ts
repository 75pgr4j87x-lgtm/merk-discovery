import type { Request, Response } from 'express';
import app from '../../server.js';

export default function handler(req: Request, res: Response) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('__customer_operations_path');

  if (path !== null) {
    url.searchParams.delete('__customer_operations_path');
    url.searchParams.delete('path');
    req.url = `/api/customer-operations/${path}${url.search}`;
  }

  return app(req, res);
}
