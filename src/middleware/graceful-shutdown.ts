import { logger } from '../utils/logger';

export function setupGracefulShutdown(shutdownFn: () => Promise<void>) {
  process.on('SIGTERM', shutdownFn);
  process.on('SIGINT', shutdownFn);

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    console.error('Uncaught exception:', error);
    shutdownFn();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdownFn();
  });
}
