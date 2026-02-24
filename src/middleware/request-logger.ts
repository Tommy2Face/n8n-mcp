import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function createRequestLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      contentLength: req.get('content-length')
    });
    next();
  };
}
