import { Request, Response, NextFunction } from 'express';
import { HSTS_MAX_AGE } from '../config/constants';

export function createSecurityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE}; includeSubDomains`);
    next();
  };
}
