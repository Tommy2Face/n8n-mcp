import {
  listNodes,
  searchNodes,
  listAITools,
  getDatabaseStatistics,
  getNodeInfo,
  getNodeDocumentation,
  getNodeAsToolInfo,
} from '../../../src/mcp/handlers/documentation-handlers';
import { SimpleCache } from '../../../src/utils/simple-cache';
import { HandlerContext, NodeRow } from '../../../src/mcp/handlers/types';

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

/** Create a NodeRow matching the database schema */
function makeNodeRow(overrides: Partial<NodeRow> = {}): NodeRow {
  return {
    node_type: 'n8n-nodes-base.httpRequest',
    package_name: 'n8n-nodes-base',
    display_name: 'HTTP Request',
    description: 'Makes HTTP requests to any URL',
    category: 'Data',
    development_style: 'programmatic',
    is_ai_tool: 0,
    is_trigger: 0,
    is_webhook: 0,
    is_versioned: 0,
    version: '1',
    documentation: null as any,
    properties_schema: '[]',
    operations: '[]',
    credentials_required: '[]',
    ...overrides,
  };
}

/** Create a parsed node object as returned by NodeRepository.getNode */
function makeParsedNode(overrides: Record<string, any> = {}) {
  return {
    nodeType: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    description: 'Makes HTTP requests to any URL',
    category: 'Data',
    developmentStyle: 'programmatic',
    package: 'n8n-nodes-base',
    isAITool: false,
    isTrigger: false,
    isWebhook: false,
    isVersioned: false,
    version: '1',
    properties: [],
    operations: [],
    credentials: [],
    hasDocumentation: false,
    ...overrides,
  };
}

/** Build a mock PreparedStatement whose `.all()` and `.get()` return controlled data */
function mockStatement(data: { all?: any[]; get?: any }) {
  return {
    all: jest.fn((..._args: any[]) => data.all ?? []),
    get: jest.fn((..._args: any[]) => data.get ?? undefined),
    run: jest.fn(),
    iterate: jest.fn(),
    pluck: jest.fn().mockReturnThis(),
    expand: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    columns: jest.fn(() => []),
    bind: jest.fn().mockReturnThis(),
  };
}

/** Build a HandlerContext with mock db, repository, templateService, and a real cache */
function createContext(overrides: {
  prepareReturn?: ReturnType<typeof mockStatement>;
  repositoryNodes?: Record<string, any>;
  aiTools?: any[];
} = {}): HandlerContext {
  const stmt = overrides.prepareReturn ?? mockStatement({});

  const db = {
    prepare: jest.fn(() => stmt),
    exec: jest.fn(),
    close: jest.fn(),
    pragma: jest.fn(),
    inTransaction: false,
    transaction: jest.fn((fn: any) => fn()),
  } as any;

  const repository = {
    getNode: jest.fn((nodeType: string) => {
      if (overrides.repositoryNodes) {
        return overrides.repositoryNodes[nodeType] ?? null;
      }
      return null;
    }),
    getAITools: jest.fn(() => overrides.aiTools ?? []),
    saveNode: jest.fn(),
  } as any;

  const templateService = {
    listNodeTemplates: jest.fn(async () => []),
    getTemplate: jest.fn(async () => null),
    searchTemplates: jest.fn(async () => []),
  } as any;

  const cache = new SimpleCache();

  return { db, repository, templateService, cache };
}

// --- afterEach to clean up SimpleCache intervals -----------------------

let ctxForCleanup: HandlerContext | null = null;

afterEach(() => {
  if (ctxForCleanup) {
    ctxForCleanup.cache.destroy();
    ctxForCleanup = null;
  }
});

// --- listNodes ---------------------------------------------------------

describe('listNodes', () => {
  it('returns mapped nodes from the database', async () => {
    const rows: NodeRow[] = [
      makeNodeRow(),
      makeNodeRow({
        node_type: 'n8n-nodes-base.slack',
        display_name: 'Slack',
        description: 'Send Slack messages',
      }),
    ];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await listNodes(ctx, {});

    expect(result.totalCount).toBe(2);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toEqual(
      expect.objectContaining({
        nodeType: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
        isAITool: false,
        isTrigger: false,
      })
    );
  });

  it('passes category filter to the query', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await listNodes(ctx, { category: 'Data' });

    // The SQL should contain category filter
    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('category = ?');
  });

  it('passes package filter with variants', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await listNodes(ctx, { package: 'n8n-nodes-base' });

    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('package_name IN');
  });

  it('applies limit when provided', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await listNodes(ctx, { limit: 5 });

    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT ?');
  });

  it('applies developmentStyle filter', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await listNodes(ctx, { developmentStyle: 'declarative' });

    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('development_style = ?');
  });

  it('applies isAITool filter', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await listNodes(ctx, { isAITool: true });

    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('is_ai_tool = ?');
  });

  it('returns totalCount equal to the number of nodes', async () => {
    const rows = [makeNodeRow()];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await listNodes(ctx, {});
    expect(result.totalCount).toBe(1);
  });

  it('maps is_ai_tool = 1 to isAITool: true', async () => {
    const rows = [makeNodeRow({ is_ai_tool: 1 })];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await listNodes(ctx, {});
    expect(result.nodes[0].isAITool).toBe(true);
  });

  it('returns empty array when no nodes match', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await listNodes(ctx, { category: 'nonexistent' });
    expect(result.nodes).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

// --- searchNodes -------------------------------------------------------

describe('searchNodes', () => {
  it('returns results for a text query', async () => {
    const rows = [makeNodeRow()];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await searchNodes(ctx, { query: 'http' });

    expect(result.query).toBe('http');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        nodeType: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
      })
    );
    expect(result.totalCount).toBe(1);
  });

  it('returns empty results for whitespace-only query', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await searchNodes(ctx, { query: '   ' });

    expect(result.results).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('handles exact phrase search with quotes', async () => {
    const rows = [makeNodeRow()];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await searchNodes(ctx, { query: '"HTTP Request"' });

    expect(result.query).toBe('"HTTP Request"');
    expect(result.results).toHaveLength(1);

    // The SQL should use LIKE for exact phrase
    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('LIKE ?');
  });

  it('splits multi-word queries into OR conditions', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await searchNodes(ctx, { query: 'send email' });

    const sql = (ctx.db.prepare as jest.Mock).mock.calls[0][0] as string;
    // Each word generates 3 LIKE conditions (node_type, display_name, description)
    expect(sql).toContain('OR');
  });

  it('uses default limit of 20', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await searchNodes(ctx, { query: 'test' });

    // Last param should be the limit value (20)
    const allArgs = stmt.all.mock.calls[0];
    const lastArg = allArgs[allArgs.length - 1];
    expect(lastArg).toBe(20);
  });

  it('accepts custom limit', async () => {
    const stmt = mockStatement({ all: [] });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await searchNodes(ctx, { query: 'test', limit: 5 });

    const allArgs = stmt.all.mock.calls[0];
    const lastArg = allArgs[allArgs.length - 1];
    expect(lastArg).toBe(5);
  });

  it('returns results with correct shape', async () => {
    const rows = [
      makeNodeRow({
        node_type: 'n8n-nodes-base.slack',
        display_name: 'Slack',
        description: 'Messaging',
        category: 'Communication',
        package_name: 'n8n-nodes-base',
      }),
    ];
    const stmt = mockStatement({ all: rows });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await searchNodes(ctx, { query: 'slack' });

    expect(result.results[0]).toEqual({
      nodeType: 'n8n-nodes-base.slack',
      displayName: 'Slack',
      description: 'Messaging',
      category: 'Communication',
      package: 'n8n-nodes-base',
    });
  });
});

// --- listAITools -------------------------------------------------------

describe('listAITools', () => {
  it('returns tools array from repository', async () => {
    const tools = [
      { nodeType: 'n8n-nodes-base.openAi', displayName: 'OpenAI', description: 'AI', package: 'n8n-nodes-base' },
    ];
    const ctx = createContext({ aiTools: tools });
    ctxForCleanup = ctx;

    const result = await listAITools(ctx, {});

    expect(result.tools).toEqual(tools);
    expect(result.totalCount).toBe(1);
    expect(ctx.repository.getAITools).toHaveBeenCalled();
  });

  it('includes requirements information', async () => {
    const ctx = createContext({ aiTools: [] });
    ctxForCleanup = ctx;

    const result = await listAITools(ctx, {});

    expect(result.requirements).toBeDefined();
    expect(result.requirements.environmentVariable).toBe('N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true');
    expect(result.requirements.nodeProperty).toBe('usableAsTool: true');
  });

  it('includes usage information with examples', async () => {
    const ctx = createContext({ aiTools: [] });
    ctxForCleanup = ctx;

    const result = await listAITools(ctx, {});

    expect(result.usage).toBeDefined();
    expect(result.usage.description).toContain('usableAsTool');
    expect(result.usage.examples).toBeInstanceOf(Array);
    expect(result.usage.examples.length).toBeGreaterThan(0);
  });

  it('returns zero totalCount when no AI tools exist', async () => {
    const ctx = createContext({ aiTools: [] });
    ctxForCleanup = ctx;

    const result = await listAITools(ctx, {});
    expect(result.totalCount).toBe(0);
    expect(result.tools).toEqual([]);
  });
});

// --- getDatabaseStatistics --------------------------------------------

describe('getDatabaseStatistics', () => {
  it('returns statistics object with correct shape', async () => {
    // First call: aggregate stats; second call: package breakdown
    const callIndex = { current: 0 };
    const statsRow = {
      total: 100,
      ai_tools: 10,
      triggers: 20,
      versioned: 5,
      with_docs: 50,
      packages: 3,
      categories: 8,
    };
    const packageRows = [
      { package_name: 'n8n-nodes-base', count: 80 },
      { package_name: '@n8n/n8n-nodes-langchain', count: 15 },
      { package_name: 'community', count: 5 },
    ];

    const getStmt = mockStatement({ get: statsRow });
    const allStmt = mockStatement({ all: packageRows });

    const ctx = createContext();
    // Override prepare to return different statements on successive calls
    (ctx.db.prepare as jest.Mock).mockImplementation(() => {
      callIndex.current++;
      if (callIndex.current === 1) return getStmt;
      return allStmt;
    });
    ctxForCleanup = ctx;

    const result = await getDatabaseStatistics(ctx, {});

    expect(result.totalNodes).toBe(100);
    expect(result.statistics.aiTools).toBe(10);
    expect(result.statistics.triggers).toBe(20);
    expect(result.statistics.versionedNodes).toBe(5);
    expect(result.statistics.nodesWithDocumentation).toBe(50);
    expect(result.statistics.documentationCoverage).toBe('50%');
    expect(result.statistics.uniquePackages).toBe(3);
    expect(result.statistics.uniqueCategories).toBe(8);
    expect(result.packageBreakdown).toHaveLength(3);
    expect(result.packageBreakdown[0]).toEqual({
      package: 'n8n-nodes-base',
      nodeCount: 80,
    });
  });

  it('calculates documentation coverage as a percentage string', async () => {
    const callIndex = { current: 0 };
    const statsRow = { total: 200, ai_tools: 0, triggers: 0, versioned: 0, with_docs: 75, packages: 1, categories: 1 };
    const getStmt = mockStatement({ get: statsRow });
    const allStmt = mockStatement({ all: [] });

    const ctx = createContext();
    (ctx.db.prepare as jest.Mock).mockImplementation(() => {
      callIndex.current++;
      if (callIndex.current === 1) return getStmt;
      return allStmt;
    });
    ctxForCleanup = ctx;

    const result = await getDatabaseStatistics(ctx, {});
    expect(result.statistics.documentationCoverage).toBe('38%');
  });
});

// --- getNodeInfo -------------------------------------------------------

describe('getNodeInfo', () => {
  it('returns node with aiToolCapabilities', async () => {
    const node = makeParsedNode({
      nodeType: 'n8n-nodes-base.httpRequest',
      isAITool: false,
      package: 'n8n-nodes-base',
    });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.httpRequest': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });

    expect(result.nodeType).toBe('n8n-nodes-base.httpRequest');
    expect(result.aiToolCapabilities).toBeDefined();
    expect(result.aiToolCapabilities.canBeUsedAsTool).toBe(true);
    expect(result.aiToolCapabilities.toolConnectionType).toBe('ai_tool');
  });

  it('sets hasUsableAsToolProperty based on isAITool', async () => {
    const node = makeParsedNode({ isAITool: true, package: 'n8n-nodes-base' });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.httpRequest': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });
    expect(result.aiToolCapabilities.hasUsableAsToolProperty).toBe(true);
  });

  it('sets environmentRequirement for non-base packages', async () => {
    const node = makeParsedNode({
      nodeType: 'community.customNode',
      isAITool: false,
      package: 'community',
    });
    const ctx = createContext({
      repositoryNodes: { 'community.customNode': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'community.customNode' });
    expect(result.aiToolCapabilities.environmentRequirement).toBe(
      'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true'
    );
  });

  it('sets environmentRequirement to null for base packages', async () => {
    const node = makeParsedNode({ package: 'n8n-nodes-base', isAITool: false });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.httpRequest': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });
    expect(result.aiToolCapabilities.environmentRequirement).toBeNull();
  });

  it('throws when node is not found', async () => {
    const ctx = createContext({ repositoryNodes: {} });
    ctxForCleanup = ctx;

    await expect(getNodeInfo(ctx, { nodeType: 'nonexistent' })).rejects.toThrow(
      'Node nonexistent not found'
    );
  });

  it('returns common use cases for known node types', async () => {
    const node = makeParsedNode({
      nodeType: 'n8n-nodes-base.slack',
      package: 'n8n-nodes-base',
      isAITool: false,
    });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.slack': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'n8n-nodes-base.slack' });
    expect(result.aiToolCapabilities.commonToolUseCases).toBeInstanceOf(Array);
    expect(result.aiToolCapabilities.commonToolUseCases.length).toBeGreaterThan(0);
    expect(result.aiToolCapabilities.commonToolUseCases[0]).toContain('notification');
  });

  it('returns generic use cases for unknown node types', async () => {
    const node = makeParsedNode({
      nodeType: 'n8n-nodes-base.unknown',
      package: 'n8n-nodes-base',
      isAITool: false,
    });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.unknown': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeInfo(ctx, { nodeType: 'n8n-nodes-base.unknown' });
    expect(result.aiToolCapabilities.commonToolUseCases).toBeInstanceOf(Array);
    expect(result.aiToolCapabilities.commonToolUseCases.length).toBeGreaterThan(0);
  });
});

// --- getNodeDocumentation ----------------------------------------------

describe('getNodeDocumentation', () => {
  it('returns documentation when available', async () => {
    const row = makeNodeRow({
      documentation: '# HTTP Request\n\nSend HTTP requests.',
    });
    const stmt = mockStatement({ get: row });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    const result = await getNodeDocumentation(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });

    expect(result.hasDocumentation).toBe(true);
    expect(result.documentation).toContain('HTTP Request');
    expect(result.nodeType).toBe('n8n-nodes-base.httpRequest');
  });

  it('throws when node is not found in the database', async () => {
    const stmt = mockStatement({ get: undefined });
    const ctx = createContext({ prepareReturn: stmt });
    ctxForCleanup = ctx;

    await expect(
      getNodeDocumentation(ctx, { nodeType: 'nonexistent' })
    ).rejects.toThrow('Node nonexistent not found');
  });
});

// --- getNodeAsToolInfo -------------------------------------------------

describe('getNodeAsToolInfo', () => {
  it('returns tool info with aiToolCapabilities', async () => {
    const node = makeParsedNode({
      nodeType: 'n8n-nodes-base.httpRequest',
      isAITool: false,
      package: 'n8n-nodes-base',
    });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.httpRequest': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeAsToolInfo(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });

    expect(result.nodeType).toBe('n8n-nodes-base.httpRequest');
    expect(result.aiToolCapabilities).toBeDefined();
    expect(result.aiToolCapabilities.canBeUsedAsTool).toBe(true);
    expect(result.aiToolCapabilities.connectionType).toBe('ai_tool');
    expect(result.aiToolCapabilities.requirements).toBeDefined();
    expect(result.aiToolCapabilities.tips).toBeInstanceOf(Array);
  });

  it('includes examples for known node types', async () => {
    const node = makeParsedNode({
      nodeType: 'n8n-nodes-base.slack',
      package: 'n8n-nodes-base',
      isAITool: false,
    });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.slack': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeAsToolInfo(ctx, { nodeType: 'n8n-nodes-base.slack' });

    expect(result.aiToolCapabilities.examples).toBeDefined();
    expect(result.aiToolCapabilities.examples.toolName).toBeDefined();
  });

  it('returns isMarkedAsAITool correctly', async () => {
    const node = makeParsedNode({ isAITool: true, package: 'n8n-nodes-base' });
    const ctx = createContext({
      repositoryNodes: { 'n8n-nodes-base.httpRequest': node },
    });
    ctxForCleanup = ctx;

    const result = await getNodeAsToolInfo(ctx, { nodeType: 'n8n-nodes-base.httpRequest' });
    expect(result.isMarkedAsAITool).toBe(true);
  });

  it('throws when node is not found', async () => {
    const ctx = createContext({ repositoryNodes: {} });
    ctxForCleanup = ctx;

    await expect(
      getNodeAsToolInfo(ctx, { nodeType: 'missing' })
    ).rejects.toThrow('Node missing not found');
  });
});
