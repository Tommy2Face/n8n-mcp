#!/usr/bin/env node
/**
 * Fixed HTTP server for n8n-MCP — manual JSON-RPC dispatch
 * Recommended HTTP implementation (USE_FIXED_HTTP=true)
 */
import express from 'express';
import { n8nDocumentationToolsFinal } from './mcp/tools-update';
import { N8NDocumentationMCPServer } from './mcp/server-update';
import { logger } from './utils/logger';
import { APP_VERSION, SERVER_NAME, DEFAULT_PORT, DEFAULT_HOST, SHUTDOWN_TIMEOUT_MS } from './config/constants';
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

let expressServer: any;

async function shutdown() {
  logger.info('Shutting down HTTP server...');
  console.log('Shutting down HTTP server...');

  if (expressServer) {
    expressServer.close(() => {
      logger.info('HTTP server closed');
      console.log('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
  } else {
    process.exit(0);
  }
}

export async function startFixedHTTPServer() {
  validateEnvironment();

  const app = express();

  // Shared middleware
  app.use(createSecurityHeadersMiddleware());
  app.use(createCorsMiddleware());
  app.use(createRequestLoggerMiddleware());

  // Create a single persistent MCP server instance
  const mcpServer = new N8NDocumentationMCPServer();
  logger.info('Created persistent MCP server instance');

  // Health check
  app.get('/health', createHealthEndpoint({ mode: 'http-fixed' }));

  // Version endpoint (unique to fixed server)
  app.get('/version', (req, res) => {
    res.json({
      version: APP_VERSION,
      buildTime: new Date().toISOString(),
      tools: n8nDocumentationToolsFinal.map(t => t.name),
      commit: process.env.GIT_COMMIT || 'unknown'
    });
  });

  // Test tools endpoint (unique to fixed server)
  app.get('/test-tools', async (req, res) => {
    try {
      const result = await mcpServer.executeTool('get_node_essentials', { nodeType: 'nodes-base.httpRequest' });
      res.json({ status: 'ok', hasData: !!result, toolCount: n8nDocumentationToolsFinal.length });
    } catch (error) {
      res.json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Main MCP endpoint — manual JSON-RPC dispatch
  app.post('/mcp', createBearerAuthMiddleware(), async (req: express.Request, res: express.Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Collect the raw body (no body parser — StreamableHTTPServerTransport compatibility)
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const jsonRpcRequest = JSON.parse(body);
          logger.debug('Received JSON-RPC request:', { method: jsonRpcRequest.method });

          let response;

          switch (jsonRpcRequest.method) {
            case 'initialize':
              response = {
                jsonrpc: '2.0',
                result: {
                  protocolVersion: '1.0',
                  capabilities: { tools: {}, resources: {} },
                  serverInfo: { name: SERVER_NAME, version: APP_VERSION }
                },
                id: jsonRpcRequest.id
              };
              break;

            case 'tools/list':
              response = {
                jsonrpc: '2.0',
                result: { tools: n8nDocumentationToolsFinal },
                id: jsonRpcRequest.id
              };
              break;

            case 'tools/call': {
              const toolName = jsonRpcRequest.params?.name;
              const toolArgs = jsonRpcRequest.params?.arguments || {};

              try {
                const result = await mcpServer.executeTool(toolName, toolArgs);
                response = {
                  jsonrpc: '2.0',
                  result: {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                  },
                  id: jsonRpcRequest.id
                };
              } catch (error) {
                response = {
                  jsonrpc: '2.0',
                  error: {
                    code: -32603,
                    message: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`
                  },
                  id: jsonRpcRequest.id
                };
              }
              break;
            }

            default:
              response = {
                jsonrpc: '2.0',
                error: { code: -32601, message: `Method not found: ${jsonRpcRequest.method}` },
                id: jsonRpcRequest.id
              };
          }

          res.setHeader('Content-Type', 'application/json');
          res.json(response);

          const duration = Date.now() - startTime;
          logger.info('MCP request completed', { duration, method: jsonRpcRequest.method });
        } catch (error) {
          logger.error('Error processing request:', error);
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error', data: error instanceof Error ? error.message : 'Unknown error' },
            id: null
          });
        }
      });
    } catch (error) {
      logger.error('MCP request error:', error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
          },
          id: null
        });
      }
    }
  });

  // Error handlers
  app.use(notFoundHandler);
  app.use(expressErrorHandler);

  const port = parseInt(process.env.PORT || String(DEFAULT_PORT));
  const host = process.env.HOST || DEFAULT_HOST;

  expressServer = app.listen(port, host, () => {
    logger.info(`n8n MCP Fixed HTTP Server started`, { port, host });
    console.log(`n8n MCP Fixed HTTP Server running on ${host}:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log('\nPress Ctrl+C to stop the server');
  });

  expressServer.on('error', (error: any) => {
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

  setupGracefulShutdown(shutdown);
}

// Make executeTool public on the server
declare module './mcp/server-update' {
  interface N8NDocumentationMCPServer {
    executeTool(name: string, args: any): Promise<any>;
  }
}

// Start if called directly
if (require.main === module) {
  startFixedHTTPServer().catch(error => {
    logger.error('Failed to start Fixed HTTP server:', error);
    console.error('Failed to start Fixed HTTP server:', error);
    process.exit(1);
  });
}
