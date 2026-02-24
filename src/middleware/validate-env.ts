import { logger } from '../utils/logger';

export interface ValidateEnvOptions {
  /** If true, throw instead of process.exit (useful for class constructors) */
  throwOnMissing?: boolean;
}

export function validateEnvironment(opts: ValidateEnvOptions = {}) {
  const required = ['AUTH_TOKEN'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(message);

    if (opts.throwOnMissing) {
      throw new Error(message);
    }

    console.error(`ERROR: ${message}`);
    console.error('Generate AUTH_TOKEN with: openssl rand -base64 32');
    process.exit(1);
  }

  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.length < 32) {
    logger.warn('AUTH_TOKEN should be at least 32 characters for security');
    if (!opts.throwOnMissing) {
      console.warn('WARNING: AUTH_TOKEN should be at least 32 characters for security');
    }
  }
}
