import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'fs';
import path from 'path';
import { n8nDocumentationToolsFinal } from './tools-update';
import { n8nManagementTools } from './tools-n8n-manager';
import { logger } from '../utils/logger';
import { NodeRepository } from '../database/node-repository';
import { DatabaseAdapter, createDatabaseAdapter } from '../database/database-adapter';
import { SimpleCache } from '../utils/simple-cache';
import { TemplateService } from '../templates/template-service';
import { isN8nApiConfigured } from '../config/n8n-api';
import { APP_VERSION, SERVER_NAME, PROTOCOL_VERSION } from '../config/constants';
import * as n8nHandlers from './handlers-n8n-manager';
import { handleUpdatePartialWorkflow } from './handlers-workflow-diff';
import { toolHandlers, HandlerContext } from './handlers';

export class N8NDocumentationMCPServer {
  private server: Server;
  private db: DatabaseAdapter | null = null;
  private repository: NodeRepository | null = null;
  private templateService: TemplateService | null = null;
  private initialized: Promise<void>;
  private cache = new SimpleCache();

  constructor() {
    // Try multiple database paths
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'nodes.db'),
      path.join(__dirname, '../../data', 'nodes.db'),
      './data/nodes.db'
    ];

    let dbPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        dbPath = p;
        break;
      }
    }

    if (!dbPath) {
      logger.error('Database not found in any of the expected locations:', possiblePaths);
      throw new Error('Database nodes.db not found. Please run npm run rebuild first.');
    }

    // Initialize database asynchronously
    this.initialized = this.initializeDatabase(dbPath);

    logger.info('Initializing n8n Documentation MCP server');

    this.server = new Server(
      {
        name: SERVER_NAME,
        version: APP_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async initializeDatabase(dbPath: string): Promise<void> {
    try {
      this.db = await createDatabaseAdapter(dbPath);
      this.repository = new NodeRepository(this.db);
      this.templateService = new TemplateService(this.db);
      logger.info(`Initialized database from: ${dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw new Error(`Failed to open database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
    if (!this.db || !this.repository) {
      throw new Error('Database not initialized');
    }
  }

  private getContext(): HandlerContext {
    return {
      db: this.db!,
      repository: this.repository!,
      templateService: this.templateService!,
      cache: this.cache,
    };
  }

  private setupHandlers(): void {
    // Handle initialization
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      const response = {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: APP_VERSION,
        },
      };

      if (process.env.DEBUG_MCP === 'true') {
        console.error('Initialize handler called, returning:', JSON.stringify(response));
      }

      return response;
    });

    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [...n8nDocumentationToolsFinal];

      if (isN8nApiConfigured()) {
        tools.push(...n8nManagementTools);
        logger.info('n8n management tools enabled');
      } else {
        logger.info('n8n management tools disabled (API not configured)');
      }

      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.debug(`Executing tool: ${name}`, { args });
        const result = await this.executeTool(name, args);
        logger.debug(`Tool ${name} executed successfully`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async executeTool(name: string, args: any): Promise<any> {
    // Check handler registry first (documentation, validation, template, workflow tools)
    const handler = toolHandlers[name];
    if (handler) {
      await this.ensureInitialized();
      return handler(this.getContext(), args || {});
    }

    // n8n management tools (already in separate handler files)
    switch (name) {
      case 'n8n_create_workflow':
        return n8nHandlers.handleCreateWorkflow(args);
      case 'n8n_get_workflow':
        return n8nHandlers.handleGetWorkflow(args);
      case 'n8n_get_workflow_details':
        return n8nHandlers.handleGetWorkflowDetails(args);
      case 'n8n_get_workflow_structure':
        return n8nHandlers.handleGetWorkflowStructure(args);
      case 'n8n_get_workflow_minimal':
        return n8nHandlers.handleGetWorkflowMinimal(args);
      case 'n8n_update_full_workflow':
        return n8nHandlers.handleUpdateWorkflow(args);
      case 'n8n_update_partial_workflow':
        return handleUpdatePartialWorkflow(args);
      case 'n8n_delete_workflow':
        return n8nHandlers.handleDeleteWorkflow(args);
      case 'n8n_list_workflows':
        return n8nHandlers.handleListWorkflows(args);
      case 'n8n_validate_workflow':
        await this.ensureInitialized();
        if (!this.repository) throw new Error('Repository not initialized');
        return n8nHandlers.handleValidateWorkflow(args, this.repository);
      case 'n8n_trigger_webhook_workflow':
        return n8nHandlers.handleTriggerWebhookWorkflow(args);
      case 'n8n_get_execution':
        return n8nHandlers.handleGetExecution(args);
      case 'n8n_list_executions':
        return n8nHandlers.handleListExecutions(args);
      case 'n8n_delete_execution':
        return n8nHandlers.handleDeleteExecution(args);
      case 'n8n_health_check':
        return n8nHandlers.handleHealthCheck();
      case 'n8n_list_available_tools':
        return n8nHandlers.handleListAvailableTools();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Accept any transport
  async connect(transport: any): Promise<void> {
    await this.ensureInitialized();
    await this.server.connect(transport);
    logger.info('MCP Server connected', {
      transportType: transport.constructor.name
    });
  }

  destroy(): void {
    this.cache.destroy();
  }

  async run(): Promise<void> {
    await this.ensureInitialized();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Force flush stdout for Docker environments
    if (!process.stdout.isTTY || process.env.IS_DOCKER) {
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
        const result = originalWrite(chunk, encoding, callback);
        process.stdout.emit('drain');
        return result;
      };
    }

    logger.info('n8n Documentation MCP Server running on stdio transport');
    process.stdin.resume();
  }
}
