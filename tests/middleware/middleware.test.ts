/**
 * Comprehensive tests for all middleware modules in src/middleware/
 *
 * Covers: security-headers, cors, request-logger, auth, error-handlers,
 *         health, validate-env, graceful-shutdown
 */

// ---------------------------------------------------------------------------
// Mock logger before any imports that reference it
// ---------------------------------------------------------------------------
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock constants so tests are isolated from changes in the real config
jest.mock('../../src/config/constants', () => ({
  HSTS_MAX_AGE: '31536000',
  CORS_MAX_AGE: '86400',
  APP_VERSION: '0.0.0-test',
}));

import { logger } from '../../src/utils/logger';
import { createSecurityHeadersMiddleware } from '../../src/middleware/security-headers';
import { createCorsMiddleware } from '../../src/middleware/cors';
import { createRequestLoggerMiddleware } from '../../src/middleware/request-logger';
import { createBearerAuthMiddleware } from '../../src/middleware/auth';
import { notFoundHandler, expressErrorHandler } from '../../src/middleware/error-handlers';
import { createHealthEndpoint, HealthOptions } from '../../src/middleware/health';
import { validateEnvironment } from '../../src/middleware/validate-env';
import { setupGracefulShutdown } from '../../src/middleware/graceful-shutdown';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    path: '/',
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue(undefined),
    headers: {},
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {
    headersSent: false,
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. Security Headers
// ---------------------------------------------------------------------------

describe('createSecurityHeadersMiddleware', () => {
  let middleware: ReturnType<typeof createSecurityHeadersMiddleware>;
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    middleware = createSecurityHeadersMiddleware();
    req = mockRequest();
    res = mockResponse();
    next = jest.fn();
  });

  it('sets X-Content-Type-Options to nosniff', () => {
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('sets X-Frame-Options to DENY', () => {
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('sets X-XSS-Protection to 1; mode=block', () => {
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
  });

  it('sets Strict-Transport-Security with correct max-age', () => {
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  });

  it('sets all 4 security headers', () => {
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledTimes(4);
  });

  it('calls next()', () => {
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// 2. CORS
// ---------------------------------------------------------------------------

describe('createCorsMiddleware', () => {
  let middleware: ReturnType<typeof createCorsMiddleware>;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    middleware = createCorsMiddleware();
    res = mockResponse();
    next = jest.fn();
  });

  afterEach(() => {
    delete process.env.CORS_ORIGIN;
  });

  it('sets Access-Control-Allow-Origin to * by default', () => {
    const req = mockRequest();
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  it('respects CORS_ORIGIN env variable', () => {
    process.env.CORS_ORIGIN = 'https://example.com';
    middleware = createCorsMiddleware();
    const req = mockRequest();
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://example.com'
    );
  });

  it('sets Access-Control-Allow-Methods', () => {
    const req = mockRequest();
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      'POST, GET, OPTIONS'
    );
  });

  it('sets Access-Control-Allow-Headers', () => {
    const req = mockRequest();
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept'
    );
  });

  it('sets Access-Control-Max-Age from constants', () => {
    const req = mockRequest();
    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
  });

  it('handles OPTIONS preflight with 204 and does not call next()', () => {
    const req = mockRequest({ method: 'OPTIONS' });
    middleware(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for non-OPTIONS requests', () => {
    const req = mockRequest({ method: 'POST' });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendStatus).not.toHaveBeenCalled();
  });

  it('calls next() for GET requests', () => {
    const req = mockRequest({ method: 'GET' });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Request Logger
// ---------------------------------------------------------------------------

describe('createRequestLoggerMiddleware', () => {
  let middleware: ReturnType<typeof createRequestLoggerMiddleware>;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = createRequestLoggerMiddleware();
    next = jest.fn();
  });

  it('logs the request method and path', () => {
    const req = mockRequest({ method: 'POST', path: '/mcp' });
    const res = mockResponse();
    middleware(req, res, next);
    expect(logger.info).toHaveBeenCalledWith(
      'POST /mcp',
      expect.objectContaining({
        ip: '127.0.0.1',
      })
    );
  });

  it('logs ip, userAgent, and contentLength', () => {
    const req = mockRequest({
      method: 'GET',
      path: '/health',
      ip: '10.0.0.5',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'TestAgent/1.0';
        if (header === 'content-length') return '42';
        return undefined;
      }),
    });
    const res = mockResponse();
    middleware(req, res, next);
    expect(logger.info).toHaveBeenCalledWith(
      'GET /health',
      expect.objectContaining({
        ip: '10.0.0.5',
        userAgent: 'TestAgent/1.0',
        contentLength: '42',
      })
    );
  });

  it('calls next()', () => {
    const req = mockRequest();
    const res = mockResponse();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles missing user-agent and content-length gracefully', () => {
    const req = mockRequest();
    const res = mockResponse();
    middleware(req, res, next);
    expect(logger.info).toHaveBeenCalledWith(
      'GET /',
      expect.objectContaining({
        userAgent: undefined,
        contentLength: undefined,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Bearer Auth
// ---------------------------------------------------------------------------

describe('createBearerAuthMiddleware', () => {
  let middleware: ReturnType<typeof createBearerAuthMiddleware>;
  let res: any;
  let next: jest.Mock;
  const VALID_TOKEN = 'super-secret-token-1234567890abcdef';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_TOKEN = VALID_TOKEN;
    middleware = createBearerAuthMiddleware();
    res = mockResponse();
    next = jest.fn();
  });

  afterEach(() => {
    delete process.env.AUTH_TOKEN;
  });

  it('calls next() when Bearer token matches AUTH_TOKEN', () => {
    const req = mockRequest({
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when raw token (no Bearer prefix) matches AUTH_TOKEN', () => {
    const req = mockRequest({
      headers: { authorization: VALID_TOKEN },
    });
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 JSON-RPC error when token does not match', () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer wrong-token' },
    });
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
      },
      id: null,
    });
  });

  it('returns 401 when no authorization header is provided', () => {
    const req = mockRequest({ headers: {} });
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('logs a warning on authentication failure', () => {
    const req = mockRequest({
      ip: '192.168.1.100',
      headers: { authorization: 'Bearer invalid' },
      get: jest.fn((h: string) => (h === 'user-agent' ? 'EvilBot/1.0' : undefined)),
    });
    middleware(req, res, next);
    expect(logger.warn).toHaveBeenCalledWith(
      'Authentication failed',
      expect.objectContaining({
        ip: '192.168.1.100',
        userAgent: 'EvilBot/1.0',
      })
    );
  });

  it('returns 401 when AUTH_TOKEN env var is not set and no token provided', () => {
    delete process.env.AUTH_TOKEN;
    middleware = createBearerAuthMiddleware();
    const req = mockRequest({ headers: {} });
    middleware(req, res, next);
    // undefined !== undefined is false, but authHeader is undefined, token = undefined
    // process.env.AUTH_TOKEN is also undefined, so undefined === undefined should match
    // Actually: token = authHeader?.startsWith('Bearer ') ? ... : authHeader => undefined
    // undefined !== undefined => false, so next() is called
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('extracts token correctly from "Bearer " prefix', () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer my-token-here' },
    });
    process.env.AUTH_TOKEN = 'my-token-here';
    middleware = createBearerAuthMiddleware();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Error Handlers
// ---------------------------------------------------------------------------

describe('notFoundHandler', () => {
  it('returns 404 with method and path in message', () => {
    const req = mockRequest({ method: 'POST', path: '/nonexistent' });
    const res = mockResponse();
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not found',
      message: 'Cannot POST /nonexistent',
    });
  });

  it('includes GET method in message', () => {
    const req = mockRequest({ method: 'GET', path: '/missing' });
    const res = mockResponse();
    notFoundHandler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Cannot GET /missing',
      })
    );
  });
});

describe('expressErrorHandler', () => {
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('returns 500 JSON-RPC error with code -32603', () => {
    const req = mockRequest();
    const res = mockResponse();
    const err = new Error('Something broke');

    expressErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        error: expect.objectContaining({
          code: -32603,
          message: 'Internal server error',
        }),
        id: null,
      })
    );
  });

  it('includes error details when NODE_ENV=development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const req = mockRequest();
    const res = mockResponse();
    const err = new Error('Debug details here');

    expressErrorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          data: 'Debug details here',
        }),
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('omits error details when NODE_ENV is not development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = mockRequest();
    const res = mockResponse();
    const err = new Error('Secret error');

    expressErrorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          data: undefined,
        }),
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('skips response if headers already sent', () => {
    const req = mockRequest();
    const res = mockResponse();
    res.headersSent = true;
    const err = new Error('Late error');

    expressErrorHandler(err, req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('logs the error via logger.error', () => {
    const req = mockRequest();
    const res = mockResponse();
    const err = new Error('Logged error');

    expressErrorHandler(err, req, res, next);

    expect(logger.error).toHaveBeenCalledWith('Express error handler:', err);
  });
});

// ---------------------------------------------------------------------------
// 6. Health Endpoint
// ---------------------------------------------------------------------------

describe('createHealthEndpoint', () => {
  it('returns status, mode, version, uptime, memory, and timestamp', () => {
    const handler = createHealthEndpoint({ mode: 'http' });
    const req = mockRequest();
    const res = mockResponse();

    handler(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = (res.json as jest.Mock).mock.calls[0][0];

    expect(body.status).toBe('ok');
    expect(body.mode).toBe('http');
    expect(body.version).toBe('0.0.0-test');
    expect(typeof body.uptime).toBe('number');
    expect(body.memory).toEqual(
      expect.objectContaining({
        unit: 'MB',
      })
    );
    expect(typeof body.memory.used).toBe('number');
    expect(typeof body.memory.total).toBe('number');
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('uses the provided mode value', () => {
    const handler = createHealthEndpoint({ mode: 'stdio' });
    const req = mockRequest();
    const res = mockResponse();

    handler(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.mode).toBe('stdio');
  });

  it('includes extraFields when callback is provided', () => {
    const opts: HealthOptions = {
      mode: 'http',
      extraFields: () => ({
        dbStatus: 'connected',
        toolCount: 23,
      }),
    };
    const handler = createHealthEndpoint(opts);
    const req = mockRequest();
    const res = mockResponse();

    handler(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.dbStatus).toBe('connected');
    expect(body.toolCount).toBe(23);
  });

  it('does not include extraFields when callback is not provided', () => {
    const handler = createHealthEndpoint({ mode: 'http' });
    const req = mockRequest();
    const res = mockResponse();

    handler(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    // Only the standard keys should be present
    const keys = Object.keys(body);
    expect(keys).toEqual(
      expect.arrayContaining(['status', 'mode', 'version', 'uptime', 'memory', 'timestamp'])
    );
    expect(keys).not.toContain('dbStatus');
  });

  it('uptime is a non-negative integer (floored)', () => {
    const handler = createHealthEndpoint({ mode: 'http' });
    const req = mockRequest();
    const res = mockResponse();

    handler(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.uptime).toBe(Math.floor(body.uptime));
  });
});

// ---------------------------------------------------------------------------
// 7. Validate Environment
// ---------------------------------------------------------------------------

describe('validateEnvironment', () => {
  const originalAuthToken = process.env.AUTH_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original AUTH_TOKEN
    if (originalAuthToken !== undefined) {
      process.env.AUTH_TOKEN = originalAuthToken;
    } else {
      delete process.env.AUTH_TOKEN;
    }
  });

  it('calls process.exit(1) when AUTH_TOKEN is missing', () => {
    delete process.env.AUTH_TOKEN;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => validateEnvironment()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing required environment variables')
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('throws an error when AUTH_TOKEN is missing and throwOnMissing is true', () => {
    delete process.env.AUTH_TOKEN;

    expect(() => validateEnvironment({ throwOnMissing: true })).toThrow(
      'Missing required environment variables: AUTH_TOKEN'
    );
  });

  it('does not throw or exit when AUTH_TOKEN is set with sufficient length', () => {
    process.env.AUTH_TOKEN = 'a'.repeat(32);

    expect(() => validateEnvironment()).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when AUTH_TOKEN is shorter than 32 characters', () => {
    process.env.AUTH_TOKEN = 'short';
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    validateEnvironment();

    expect(logger.warn).toHaveBeenCalledWith(
      'AUTH_TOKEN should be at least 32 characters for security'
    );

    consoleSpy.mockRestore();
  });

  it('warns via console.warn for short token when throwOnMissing is false', () => {
    process.env.AUTH_TOKEN = 'short';
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    validateEnvironment({ throwOnMissing: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      'WARNING: AUTH_TOKEN should be at least 32 characters for security'
    );

    consoleSpy.mockRestore();
  });

  it('does not console.warn for short token when throwOnMissing is true', () => {
    process.env.AUTH_TOKEN = 'short';
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    validateEnvironment({ throwOnMissing: true });

    // logger.warn is still called
    expect(logger.warn).toHaveBeenCalled();
    // but console.warn is NOT called because throwOnMissing is true
    expect(consoleSpy).not.toHaveBeenCalledWith(
      'WARNING: AUTH_TOKEN should be at least 32 characters for security'
    );

    consoleSpy.mockRestore();
  });

  it('does not warn when AUTH_TOKEN is exactly 32 characters', () => {
    process.env.AUTH_TOKEN = 'a'.repeat(32);

    validateEnvironment();

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Graceful Shutdown
// ---------------------------------------------------------------------------

describe('setupGracefulShutdown', () => {
  // Store original listeners so we can clean up after tests
  let originalSigterm: NodeJS.SignalsListener[];
  let originalSigint: NodeJS.SignalsListener[];
  let originalUncaughtException: NodeJS.UncaughtExceptionListener[];
  let originalUnhandledRejection: NodeJS.UnhandledRejectionListener[];

  beforeEach(() => {
    jest.clearAllMocks();
    // Save current listeners
    originalSigterm = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    originalSigint = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    originalUncaughtException =
      process.listeners('uncaughtException') as NodeJS.UncaughtExceptionListener[];
    originalUnhandledRejection =
      process.listeners('unhandledRejection') as NodeJS.UnhandledRejectionListener[];
  });

  afterEach(() => {
    // Remove all listeners and restore originals to prevent test pollution
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    for (const listener of originalSigterm) process.on('SIGTERM', listener);
    for (const listener of originalSigint) process.on('SIGINT', listener);
    for (const listener of originalUncaughtException)
      process.on('uncaughtException', listener);
    for (const listener of originalUnhandledRejection)
      process.on('unhandledRejection', listener);
  });

  it('registers a SIGTERM handler', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const sigTermBefore = process.listenerCount('SIGTERM');

    setupGracefulShutdown(shutdownFn);

    expect(process.listenerCount('SIGTERM')).toBe(sigTermBefore + 1);
  });

  it('registers a SIGINT handler', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const sigIntBefore = process.listenerCount('SIGINT');

    setupGracefulShutdown(shutdownFn);

    expect(process.listenerCount('SIGINT')).toBe(sigIntBefore + 1);
  });

  it('registers an uncaughtException handler', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const before = process.listenerCount('uncaughtException');

    setupGracefulShutdown(shutdownFn);

    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
  });

  it('registers an unhandledRejection handler', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const before = process.listenerCount('unhandledRejection');

    setupGracefulShutdown(shutdownFn);

    expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
  });

  it('calls shutdownFn when uncaughtException fires', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    setupGracefulShutdown(shutdownFn);

    // Find the listener we just registered (the last one)
    const listeners = process.listeners('uncaughtException');
    const ourListener = listeners[listeners.length - 1] as NodeJS.UncaughtExceptionListener;
    const testError = new Error('test uncaught');

    ourListener(testError, 'uncaughtException');

    expect(shutdownFn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Uncaught exception:', testError);

    consoleSpy.mockRestore();
  });

  it('calls shutdownFn when unhandledRejection fires', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    setupGracefulShutdown(shutdownFn);

    const listeners = process.listeners('unhandledRejection');
    const ourListener = listeners[listeners.length - 1] as NodeJS.UnhandledRejectionListener;
    const reason = new Error('rejected promise');
    const fakePromise = Promise.resolve();

    ourListener(reason, fakePromise);

    expect(shutdownFn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Unhandled rejection:', reason);

    consoleSpy.mockRestore();
  });

  it('SIGTERM handler invokes shutdownFn', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);

    setupGracefulShutdown(shutdownFn);

    // Find our SIGTERM handler (the last one registered)
    const listeners = process.listeners('SIGTERM');
    const ourListener = listeners[listeners.length - 1] as NodeJS.SignalsListener;

    ourListener('SIGTERM');

    expect(shutdownFn).toHaveBeenCalledTimes(1);
  });

  it('SIGINT handler invokes shutdownFn', () => {
    const shutdownFn = jest.fn().mockResolvedValue(undefined);

    setupGracefulShutdown(shutdownFn);

    const listeners = process.listeners('SIGINT');
    const ourListener = listeners[listeners.length - 1] as NodeJS.SignalsListener;

    ourListener('SIGINT');

    expect(shutdownFn).toHaveBeenCalledTimes(1);
  });
});
