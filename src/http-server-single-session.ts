#!/usr/bin/env node
/**
 * Single-Session HTTP server for n8n-MCP
 * Implements Hybrid Single-Session Architecture for protocol compliance
 * while maintaining simplicity for single-player use case
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { N8NDocumentationMCPServer } from './mcp/server-update';
import { ConsoleManager } from './utils/console-manager';
import { logger } from './utils/logger';
import { DEFAULT_PORT, DEFAULT_HOST, SESSION_TIMEOUT_MS } from './config/constants';
import {
  validateEnvironment,
  createSecurityHeadersMiddleware,
  createCorsMiddleware,
  createRequestLoggerMiddleware,
  createBearerAuthMiddleware,
  createHealthEndpoint,
  notFoundHandler,
  expressErrorHandler,
  setupGracefulShutdown,
} from './middleware';
import dotenv from 'dotenv';

dotenv.config();

interface Session {
  server: N8NDocumentationMCPServer;
  transport: StreamableHTTPServerTransport;
  lastAccess: Date;
  sessionId: string;
}

export class SingleSessionHTTPServer {
  private session: Session | null = null;
  private consoleManager = new ConsoleManager();
  private expressServer: any;
  private sessionTimeout = SESSION_TIMEOUT_MS;

  constructor() {
    validateEnvironment({ throwOnMissing: true });
  }

  async handleRequest(req: express.Request, res: express.Response): Promise<void> {
    const startTime = Date.now();

    return this.consoleManager.wrapOperation(async () => {
      try {
        if (!this.session || this.isExpired()) {
          await this.resetSession();
        }

        this.session!.lastAccess = new Date();

        logger.debug('Calling transport.handleRequest...');
        await this.session!.transport.handleRequest(req, res);
        logger.debug('transport.handleRequest completed');

        const duration = Date.now() - startTime;
        logger.info('MCP request completed', {
          duration,
          sessionId: this.session!.sessionId
        });
      } catch (error) {
        logger.error('MCP request error:', error);

        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
              data: process.env.NODE_ENV === 'development'
                ? (error as Error).message
                : undefined
            },
            id: null
          });
        }
      }
    });
  }

  private async resetSession(): Promise<void> {
    if (this.session) {
      try {
        logger.info('Closing previous session', { sessionId: this.session.sessionId });
        await this.session.transport.close();
      } catch (error) {
        logger.warn('Error closing previous session:', error);
      }
    }

    try {
      logger.info('Creating new N8NDocumentationMCPServer...');
      const server = new N8NDocumentationMCPServer();

      logger.info('Creating StreamableHTTPServerTransport...');
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => 'single-session',
      });

      logger.info('Connecting server to transport...');
      await server.connect(transport);

      this.session = {
        server,
        transport,
        lastAccess: new Date(),
        sessionId: 'single-session'
      };

      logger.info('Created new single session successfully', { sessionId: this.session.sessionId });
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  private isExpired(): boolean {
    if (!this.session) return true;
    return Date.now() - this.session.lastAccess.getTime() > this.sessionTimeout;
  }

  async start(): Promise<void> {
    const app = express();

    // Shared middleware
    app.use(createSecurityHeadersMiddleware());
    app.use(createCorsMiddleware());
    app.use(createRequestLoggerMiddleware());

    // Health check with session info
    app.get('/health', createHealthEndpoint({
      mode: 'single-session',
      extraFields: () => ({
        sessionActive: !!this.session,
        sessionAge: this.session
          ? Math.floor((Date.now() - this.session.lastAccess.getTime()) / 1000)
          : null
      })
    }));

    // Main MCP endpoint with authentication
    app.post('/mcp', createBearerAuthMiddleware(), async (req: express.Request, res: express.Response): Promise<void> => {
      await this.handleRequest(req, res);
    });

    // Error handlers
    app.use(notFoundHandler);
    app.use(expressErrorHandler);

    const port = parseInt(process.env.PORT || String(DEFAULT_PORT));
    const host = process.env.HOST || DEFAULT_HOST;

    this.expressServer = app.listen(port, host, () => {
      logger.info(`n8n MCP Single-Session HTTP Server started`, { port, host });
      console.log(`n8n MCP Single-Session HTTP Server running on ${host}:${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`MCP endpoint: http://localhost:${port}/mcp`);
      console.log('\nPress Ctrl+C to stop the server');
    });

    this.expressServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
        console.error(`ERROR: Port ${port} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Single-Session HTTP server...');

    if (this.session) {
      try {
        await this.session.transport.close();
        this.session.server.destroy();
        logger.info('Session closed');
      } catch (error) {
        logger.warn('Error closing session:', error);
      }
      this.session = null;
    }

    if (this.expressServer) {
      await new Promise<void>((resolve) => {
        this.expressServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }
  }

  getSessionInfo(): { active: boolean; sessionId?: string; age?: number } {
    if (!this.session) {
      return { active: false };
    }

    return {
      active: true,
      sessionId: this.session.sessionId,
      age: Date.now() - this.session.lastAccess.getTime()
    };
  }
}

// Start if called directly
if (require.main === module) {
  const server = new SingleSessionHTTPServer();

  const shutdown = async () => {
    await server.shutdown();
    process.exit(0);
  };

  setupGracefulShutdown(shutdown);

  server.start().catch(error => {
    logger.error('Failed to start Single-Session HTTP server:', error);
    console.error('Failed to start Single-Session HTTP server:', error);
    process.exit(1);
  });
}
