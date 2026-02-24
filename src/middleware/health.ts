import { Request, Response } from 'express';
import { APP_VERSION } from '../config/constants';

export interface HealthOptions {
  mode: string;
  extraFields?: () => Record<string, unknown>;
}

export function createHealthEndpoint(opts: HealthOptions) {
  return (req: Request, res: Response) => {
    const base: Record<string, unknown> = {
      status: 'ok',
      mode: opts.mode,
      version: APP_VERSION,
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      timestamp: new Date().toISOString()
    };

    if (opts.extraFields) {
      Object.assign(base, opts.extraFields());
    }

    res.json(base);
  };
}
