import { Request, Response, NextFunction } from 'express';
import { CORS_MAX_AGE } from '../config/constants';

export function createCorsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', CORS_MAX_AGE);

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
