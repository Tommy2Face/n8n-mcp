import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function createBearerAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token !== process.env.AUTH_TOKEN) {
      logger.warn('Authentication failed', {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized'
        },
        id: null
      });
      return;
    }
    next();
  };
}
