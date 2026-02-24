import {
  listNodeTemplates,
  getTemplate,
  searchTemplates,
  getTemplatesForTask,
} from '../../../src/mcp/handlers/template-handlers';
import { SimpleCache } from '../../../src/utils/simple-cache';
import { HandlerContext } from '../../../src/mcp/handlers/types';

// Suppress logger output during tests
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// --- helpers -----------------------------------------------------------

/** Build a mock template object as returned by TemplateService */
function makeTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Sample Template',
    description: 'A sample workflow template',
    author: { name: 'Author', username: 'author', verified: true },
    nodes: ['n8n-nodes-base.httpRequest'],
    views: 100,
    created: '2025-01-01',
    url: 'https://n8n.io/workflows/1',
    ...overrides,
  };
}

/** Build a HandlerContext with mock dependencies and a real SimpleCache */
function createContext(overrides: {
  templateService?: Record<string, any>;
} = {}): HandlerContext {
  const db = {
    prepare: jest.fn(() => ({
      all: jest.fn(() => []),
      get: jest.fn(() => undefined),
      run: jest.fn(),
      iterate: jest.fn(),
      pluck: jest.fn().mockReturnThis(),
      expand: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      columns: jest.fn(() => []),
      bind: jest.fn().mockReturnThis(),
    })),
    exec: jest.fn(),
    close: jest.fn(),
    pragma: jest.fn(),
    inTransaction: false,
    transaction: jest.fn((fn: any) => fn()),
  } as any;

  const repository = {
    getNode: jest.fn(() => null),
    getAITools: jest.fn(() => []),
    saveNode: jest.fn(),
  } as any;

  const templateService = {
    listNodeTemplates: jest.fn(async () => []),
    getTemplate: jest.fn(async () => null),
    searchTemplates: jest.fn(async () => []),
    getTemplatesForTask: jest.fn(async () => []),
    listAvailableTasks: jest.fn(() => [
      'ai_automation',
      'data_sync',
      'webhook_processing',
      'email_automation',
      'slack_integration',
      'data_transformation',
      'file_processing',
      'scheduling',
      'api_integration',
      'database_operations',
    ]),
    ...(overrides.templateService ?? {}),
  } as any;

  const cache = new SimpleCache();

  return { db, repository, templateService, cache };
}

let ctxForCleanup: HandlerContext | null = null;

afterEach(() => {
  if (ctxForCleanup) {
    ctxForCleanup.cache.destroy();
    ctxForCleanup = null;
  }
});

// --- listNodeTemplates -------------------------------------------------

describe('listNodeTemplates', () => {
  it('returns templates when matching nodes are found', async () => {
    const templates = [
      makeTemplate({ id: 1, name: 'HTTP Workflow' }),
      makeTemplate({ id: 2, name: 'API Integration' }),
    ];
    const ctx = createContext({
      templateService: {
        listNodeTemplates: jest.fn(async () => templates),
      },
    });
    ctxForCleanup = ctx;

    const result = await listNodeTemplates(ctx, {
      nodeTypes: ['n8n-nodes-base.httpRequest'],
      limit: 10,
    });

    expect(result.templates).toEqual(templates);
    expect(result.count).toBe(2);
    expect(result.tip).toContain('get_template');
    expect(ctx.templateService.listNodeTemplates).toHaveBeenCalledWith(
      ['n8n-nodes-base.httpRequest'],
      10
    );
  });

  it('returns empty message when no templates match', async () => {
    const ctx = createContext({
      templateService: {
        listNodeTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    const result = await listNodeTemplates(ctx, {
      nodeTypes: ['n8n-nodes-base.nonexistent'],
    });

    expect(result.templates).toEqual([]);
    expect(result.message).toContain('No templates found');
    expect(result.message).toContain('n8n-nodes-base.nonexistent');
    expect(result.tip).toContain('fetch:templates');
  });

  it('uses default limit of 10 when not provided', async () => {
    const ctx = createContext({
      templateService: {
        listNodeTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    await listNodeTemplates(ctx, { nodeTypes: ['n8n-nodes-base.slack'] });

    expect(ctx.templateService.listNodeTemplates).toHaveBeenCalledWith(
      ['n8n-nodes-base.slack'],
      10
    );
  });

  it('passes custom limit to template service', async () => {
    const ctx = createContext({
      templateService: {
        listNodeTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    await listNodeTemplates(ctx, {
      nodeTypes: ['n8n-nodes-base.slack'],
      limit: 5,
    });

    expect(ctx.templateService.listNodeTemplates).toHaveBeenCalledWith(
      ['n8n-nodes-base.slack'],
      5
    );
  });

  it('throws when templateService is not initialized', async () => {
    const ctx = createContext();
    ctx.templateService = undefined as any;
    ctxForCleanup = ctx;

    await expect(
      listNodeTemplates(ctx, { nodeTypes: ['n8n-nodes-base.httpRequest'] })
    ).rejects.toThrow('Template service not initialized');
  });

  it('handles multiple node types in the filter', async () => {
    const templates = [makeTemplate()];
    const ctx = createContext({
      templateService: {
        listNodeTemplates: jest.fn(async () => templates),
      },
    });
    ctxForCleanup = ctx;

    await listNodeTemplates(ctx, {
      nodeTypes: ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.slack'],
    });

    expect(ctx.templateService.listNodeTemplates).toHaveBeenCalledWith(
      ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.slack'],
      10
    );
  });
});

// --- getTemplate -------------------------------------------------------

describe('getTemplate', () => {
  it('returns template when found by ID', async () => {
    const template = makeTemplate({ id: 42, name: 'My Workflow' });
    const ctx = createContext({
      templateService: {
        getTemplate: jest.fn(async () => template),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplate(ctx, { templateId: 42 });

    expect(result.template).toEqual(template);
    expect(result.usage).toContain('Import this workflow JSON');
    expect(ctx.templateService.getTemplate).toHaveBeenCalledWith(42);
  });

  it('returns error when template is not found', async () => {
    const ctx = createContext({
      templateService: {
        getTemplate: jest.fn(async () => null),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplate(ctx, { templateId: 999 });

    expect(result.error).toContain('Template 999 not found');
    expect(result.tip).toContain('list_node_templates');
  });

  it('throws when templateService is not initialized', async () => {
    const ctx = createContext();
    ctx.templateService = undefined as any;
    ctxForCleanup = ctx;

    await expect(
      getTemplate(ctx, { templateId: 1 })
    ).rejects.toThrow('Template service not initialized');
  });

  it('passes the correct templateId to the service', async () => {
    const ctx = createContext({
      templateService: {
        getTemplate: jest.fn(async () => null),
      },
    });
    ctxForCleanup = ctx;

    await getTemplate(ctx, { templateId: 123 });

    expect(ctx.templateService.getTemplate).toHaveBeenCalledWith(123);
  });
});

// --- searchTemplates ---------------------------------------------------

describe('searchTemplates', () => {
  it('returns matching templates for a query', async () => {
    const templates = [
      makeTemplate({ id: 1, name: 'Slack Notification' }),
      makeTemplate({ id: 2, name: 'Slack Bot' }),
    ];
    const ctx = createContext({
      templateService: {
        searchTemplates: jest.fn(async () => templates),
      },
    });
    ctxForCleanup = ctx;

    const result = await searchTemplates(ctx, { query: 'slack' });

    expect(result.templates).toEqual(templates);
    expect(result.count).toBe(2);
    expect(result.query).toBe('slack');
  });

  it('returns empty message when no templates match the query', async () => {
    const ctx = createContext({
      templateService: {
        searchTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    const result = await searchTemplates(ctx, { query: 'nonexistent' });

    expect(result.templates).toEqual([]);
    expect(result.message).toContain('No templates found matching');
    expect(result.message).toContain('nonexistent');
    expect(result.tip).toContain('fetch:templates');
  });

  it('uses default limit of 20 when not provided', async () => {
    const ctx = createContext({
      templateService: {
        searchTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    await searchTemplates(ctx, { query: 'test' });

    expect(ctx.templateService.searchTemplates).toHaveBeenCalledWith('test', 20);
  });

  it('passes custom limit to template service', async () => {
    const ctx = createContext({
      templateService: {
        searchTemplates: jest.fn(async () => []),
      },
    });
    ctxForCleanup = ctx;

    await searchTemplates(ctx, { query: 'test', limit: 5 });

    expect(ctx.templateService.searchTemplates).toHaveBeenCalledWith('test', 5);
  });

  it('throws when templateService is not initialized', async () => {
    const ctx = createContext();
    ctx.templateService = undefined as any;
    ctxForCleanup = ctx;

    await expect(
      searchTemplates(ctx, { query: 'test' })
    ).rejects.toThrow('Template service not initialized');
  });

  it('includes query in the response for non-empty results', async () => {
    const templates = [makeTemplate()];
    const ctx = createContext({
      templateService: {
        searchTemplates: jest.fn(async () => templates),
      },
    });
    ctxForCleanup = ctx;

    const result = await searchTemplates(ctx, { query: 'automation' });

    expect(result.query).toBe('automation');
  });
});

// --- getTemplatesForTask -----------------------------------------------

describe('getTemplatesForTask', () => {
  it('returns templates for a known task', async () => {
    const templates = [
      makeTemplate({ id: 1, name: 'AI Chatbot' }),
      makeTemplate({ id: 2, name: 'AI Data Analysis' }),
    ];
    const ctx = createContext({
      templateService: {
        getTemplatesForTask: jest.fn(async () => templates),
        listAvailableTasks: jest.fn(() => ['ai_automation', 'data_sync']),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplatesForTask(ctx, { task: 'ai_automation' });

    expect(result.task).toBe('ai_automation');
    expect(result.templates).toEqual(templates);
    expect(result.count).toBe(2);
    expect(result.description).toContain('AI-powered');
  });

  it('returns available tasks when no templates found for task', async () => {
    const availableTasks = ['ai_automation', 'data_sync', 'webhook_processing'];
    const ctx = createContext({
      templateService: {
        getTemplatesForTask: jest.fn(async () => []),
        listAvailableTasks: jest.fn(() => availableTasks),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplatesForTask(ctx, { task: 'unknown_task' });

    expect(result.templates).toBeUndefined();
    expect(result.message).toContain('No templates found for task');
    expect(result.message).toContain('unknown_task');
    expect(result.availableTasks).toEqual(availableTasks);
    expect(result.tip).toContain('search_templates');
  });

  it('returns a known description for known task types', async () => {
    const templates = [makeTemplate()];
    const knownTasks: Record<string, string> = {
      ai_automation: 'AI-powered',
      data_sync: 'Synchronize data',
      webhook_processing: 'Process incoming webhooks',
      email_automation: 'Send, receive, and process emails',
      slack_integration: 'Integrate with Slack',
      data_transformation: 'Transform, clean, and manipulate',
      file_processing: 'Handle file',
      scheduling: 'Schedule recurring',
      api_integration: 'Connect to external APIs',
      database_operations: 'Query, insert, update',
    };

    for (const [task, expectedSubstring] of Object.entries(knownTasks)) {
      const ctx = createContext({
        templateService: {
          getTemplatesForTask: jest.fn(async () => templates),
          listAvailableTasks: jest.fn(() => []),
        },
      });

      const result = await getTemplatesForTask(ctx, { task });
      expect(result.description).toContain(expectedSubstring);

      ctx.cache.destroy();
    }
  });

  it('returns generic description for unknown task type with results', async () => {
    const templates = [makeTemplate()];
    const ctx = createContext({
      templateService: {
        getTemplatesForTask: jest.fn(async () => templates),
        listAvailableTasks: jest.fn(() => []),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplatesForTask(ctx, { task: 'custom_task' });

    expect(result.description).toBe('Workflow templates for this task');
  });

  it('throws when templateService is not initialized', async () => {
    const ctx = createContext();
    ctx.templateService = undefined as any;
    ctxForCleanup = ctx;

    await expect(
      getTemplatesForTask(ctx, { task: 'ai_automation' })
    ).rejects.toThrow('Template service not initialized');
  });

  it('calls both getTemplatesForTask and listAvailableTasks on the service', async () => {
    const ctx = createContext({
      templateService: {
        getTemplatesForTask: jest.fn(async () => []),
        listAvailableTasks: jest.fn(() => ['ai_automation']),
      },
    });
    ctxForCleanup = ctx;

    await getTemplatesForTask(ctx, { task: 'ai_automation' });

    expect(ctx.templateService.getTemplatesForTask).toHaveBeenCalledWith('ai_automation');
    expect(ctx.templateService.listAvailableTasks).toHaveBeenCalled();
  });

  it('includes count in response when templates are found', async () => {
    const templates = [makeTemplate(), makeTemplate({ id: 2 }), makeTemplate({ id: 3 })];
    const ctx = createContext({
      templateService: {
        getTemplatesForTask: jest.fn(async () => templates),
        listAvailableTasks: jest.fn(() => []),
      },
    });
    ctxForCleanup = ctx;

    const result = await getTemplatesForTask(ctx, { task: 'data_sync' });

    expect(result.count).toBe(3);
  });
});
