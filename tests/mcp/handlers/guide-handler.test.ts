import { getWorkflowGuide } from '../../../src/mcp/handlers/guide-handler';
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

/** Build a HandlerContext with mock dependencies and a real SimpleCache */
function createContext(): HandlerContext {
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

// --- getWorkflowGuide --------------------------------------------------

describe('getWorkflowGuide', () => {
  // --- Full guide (no topic) ---

  it('returns complete guide when no topic is specified', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, {});

    expect(result.title).toBe('n8n MCP Tools Complete Guide');
    expect(result.quickStart).toBeDefined();
    expect(result.sections).toBeDefined();
    expect(result.validation_guide).toBeDefined();
  });

  it('includes all sections in the complete guide', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, {});

    expect(result.sections.workflow).toBeDefined();
    expect(result.sections.searchTips).toBeDefined();
    expect(result.sections.commonNodes).toBeDefined();
    expect(result.sections.knownIssues).toBeDefined();
    expect(result.sections.performance).toBeDefined();
    expect(result.sections.aiTools).toBeDefined();
    expect(result.sections.n8nManagement).toBeDefined();
  });

  it('includes validation guide in the complete guide', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, {});

    expect(result.validation_guide.title).toBe('Validation Tools Guide');
    expect(result.validation_guide.tools).toBeDefined();
    expect(result.validation_guide.tools.validate_node_minimal).toBeDefined();
    expect(result.validation_guide.tools.validate_node_operation).toBeDefined();
    expect(result.validation_guide.tools.validate_workflow).toBeDefined();
    expect(result.validation_guide.tools.validate_workflow_connections).toBeDefined();
    expect(result.validation_guide.tools.validate_workflow_expressions).toBeDefined();
  });

  it('returns the same structure when topic is undefined', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const resultNoTopic = await getWorkflowGuide(ctx, {});
    const resultUndefined = await getWorkflowGuide(ctx, { topic: undefined });

    expect(resultNoTopic).toEqual(resultUndefined);
  });

  // --- Specific topic: overview ---

  it('returns overview guide when topic is "overview"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'overview' });

    expect(result.title).toBe('n8n MCP Tools Quick Start Guide');
    expect(result.sections).toBeDefined();
    expect(result.sections.recommended_workflow).toBeDefined();
    expect(result.sections.essential_tools).toBeDefined();
    expect(result.sections.ai_workflow_pattern).toBeDefined();
    expect(result.sections.complete_workflow_lifecycle).toBeDefined();
  });

  it('overview includes recommended workflow steps', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'overview' });

    expect(result.sections.recommended_workflow.steps).toBeInstanceOf(Array);
    expect(result.sections.recommended_workflow.steps.length).toBe(5);
    expect(result.sections.recommended_workflow.tip).toContain('get_node_info');
  });

  it('overview includes essential tools', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'overview' });

    const tools = result.sections.essential_tools;
    expect(tools.discovery).toBeDefined();
    expect(tools.quick_config).toBeDefined();
    expect(tools.tasks).toBeDefined();
    expect(tools.validation).toBeDefined();
    expect(tools.ai_tools).toBeDefined();
    expect(tools.management).toBeDefined();
  });

  it('overview includes complete workflow lifecycle phases', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'overview' });

    const lifecycle = result.sections.complete_workflow_lifecycle;
    expect(lifecycle.phases['1. Discover']).toBeDefined();
    expect(lifecycle.phases['2. Build']).toBeDefined();
    expect(lifecycle.phases['3. Validate']).toBeDefined();
    expect(lifecycle.phases['4. Deploy']).toBeDefined();
    expect(lifecycle.phases['5. Execute']).toBeDefined();
  });

  // --- Specific topic: workflow ---

  it('returns workflow patterns when topic is "workflow"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'workflow' });

    expect(result.title).toBe('Efficient Workflow Patterns');
    expect(result.patterns).toBeInstanceOf(Array);
    expect(result.patterns.length).toBe(3);
  });

  it('workflow patterns include known pattern names', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'workflow' });

    const patternNames = result.patterns.map((p: any) => p.name);
    expect(patternNames).toContain('Building from scratch');
    expect(patternNames).toContain('Common tasks');
    expect(patternNames).toContain('AI Agent with Tools');
  });

  // --- Specific topic: search_tips ---

  it('returns search tips when topic is "search_tips"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'search_tips' });

    expect(result.title).toBe('Search Best Practices');
    expect(result.tips).toBeInstanceOf(Array);
    expect(result.tips.length).toBeGreaterThan(0);
  });

  // --- Specific topic: common_nodes ---

  it('returns common nodes when topic is "common_nodes"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'common_nodes' });

    expect(result.title).toBe('Most Used Nodes');
    expect(result.categories).toBeDefined();
    expect(result.categories.triggers).toBeInstanceOf(Array);
    expect(result.categories.core).toBeInstanceOf(Array);
    expect(result.categories.integrations).toBeInstanceOf(Array);
    expect(result.categories.ai).toBeInstanceOf(Array);
    expect(result.ai_tool_usage).toBeDefined();
    expect(result.ai_tool_usage.popular_ai_tools).toBeInstanceOf(Array);
  });

  // --- Specific topic: known_issues ---

  it('returns known issues when topic is "known_issues"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'known_issues' });

    expect(result.title).toBe('Known Issues & Workarounds');
    expect(result.issues).toBeInstanceOf(Array);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  // --- Specific topic: performance ---

  it('returns performance guide when topic is "performance"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'performance' });

    expect(result.title).toBe('Performance Guide');
    expect(result.tools).toBeDefined();
    expect(result.tools.fast).toBeInstanceOf(Array);
    expect(result.tools.slow).toBeInstanceOf(Array);
    expect(result.tips).toBeInstanceOf(Array);
  });

  // --- Specific topic: ai_tools ---

  it('returns AI tools guide when topic is "ai_tools"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'ai_tools' });

    expect(result.title).toBe('AI Tools & Agent Workflows');
    expect(result.key_concept).toContain('ANY node can be used as an AI tool');
    expect(result.how_it_works).toBeDefined();
    expect(result.common_patterns).toBeDefined();
    expect(result.best_practices).toBeInstanceOf(Array);
  });

  it('ai_tools guide includes common patterns', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'ai_tools' });

    expect(result.common_patterns['Data Collection']).toBeDefined();
    expect(result.common_patterns['Actions & Notifications']).toBeDefined();
    expect(result.common_patterns['API Integration']).toBeDefined();
  });

  // --- Specific topic: n8n_management ---

  it('returns n8n management guide when topic is "n8n_management"', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'n8n_management' });

    expect(result.title).toBe('n8n Workflow Management Tools');
    expect(result.overview).toBeDefined();
    expect(result.requirements).toBeDefined();
    expect(result.requirements.configuration).toContain('N8N_API_URL');
    expect(result.best_practices).toBeInstanceOf(Array);
  });

  // --- Unknown topic ---

  it('returns complete guide for an unknown topic', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await getWorkflowGuide(ctx, { topic: 'nonexistent_topic' });

    // When topic is not found in guides, falls through to the full guide return
    expect(result.title).toBe('n8n MCP Tools Complete Guide');
    expect(result.quickStart).toBeDefined();
    expect(result.sections).toBeDefined();
  });

  // --- Context is not used ---

  it('does not use the context (ctx is prefixed with underscore)', async () => {
    const ctx = createContext();
    ctxForCleanup = ctx;

    await getWorkflowGuide(ctx, { topic: 'overview' });

    // Verify no context methods were called
    expect(ctx.repository.getNode).not.toHaveBeenCalled();
    expect(ctx.db.prepare).not.toHaveBeenCalled();
  });

  // --- All topics return objects ---

  it('returns an object for every known topic', async () => {
    const topics = [
      'overview',
      'workflow',
      'search_tips',
      'common_nodes',
      'known_issues',
      'performance',
      'ai_tools',
      'n8n_management',
    ];

    for (const topic of topics) {
      const ctx = createContext();
      const result = await getWorkflowGuide(ctx, { topic });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.title).toBeDefined();

      ctx.cache.destroy();
    }
  });
});
