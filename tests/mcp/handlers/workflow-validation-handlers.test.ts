import {
  validateWorkflow,
  validateWorkflowConnections,
  validateWorkflowExpressions,
} from '../../../src/mcp/handlers/workflow-validation-handlers';
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
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock WorkflowValidator to avoid needing real database/node-repository
const mockValidateWorkflow = jest.fn();

jest.mock('../../../src/services/workflow-validator', () => ({
  WorkflowValidator: jest.fn().mockImplementation(() => ({
    validateWorkflow: mockValidateWorkflow,
  })),
}));

jest.mock('../../../src/services/enhanced-config-validator', () => ({
  EnhancedConfigValidator: jest.fn(),
}));

// --- helpers -----------------------------------------------------------

/** Build a validation result as returned by WorkflowValidator */
function makeValidationResult(overrides: Record<string, any> = {}) {
  return {
    valid: true,
    errors: [],
    warnings: [],
    statistics: {
      totalNodes: 3,
      enabledNodes: 3,
      triggerNodes: 1,
      validConnections: 2,
      invalidConnections: 0,
      expressionsValidated: 5,
    },
    suggestions: [],
    ...overrides,
  };
}

/** Build a minimal workflow object for testing */
function makeWorkflow(overrides: Record<string, any> = {}) {
  return {
    name: 'Test Workflow',
    nodes: [
      {
        id: '1',
        name: 'Start',
        type: 'n8n-nodes-base.start',
        position: [250, 300],
        parameters: {},
      },
      {
        id: '2',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        position: [450, 300],
        parameters: { url: 'https://example.com' },
      },
    ],
    connections: {
      Start: {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
      },
    },
    ...overrides,
  };
}

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
  mockValidateWorkflow.mockReset();
});

// --- validateWorkflow --------------------------------------------------

describe('validateWorkflow', () => {
  it('returns valid result for a correct workflow', async () => {
    const validationResult = makeValidationResult();
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary.totalNodes).toBe(3);
    expect(result.summary.enabledNodes).toBe(3);
    expect(result.summary.triggerNodes).toBe(1);
    expect(result.summary.validConnections).toBe(2);
    expect(result.summary.invalidConnections).toBe(0);
    expect(result.summary.expressionsValidated).toBe(5);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
    expect(result.errors).toBeUndefined();
    expect(result.warnings).toBeUndefined();
    expect(result.suggestions).toBeUndefined();
  });

  it('returns errors when workflow has validation errors', async () => {
    const validationResult = makeValidationResult({
      valid: false,
      errors: [
        { nodeName: 'HTTP Request', message: 'Missing required field: url', details: { field: 'url' } },
        { message: 'No trigger node found', details: null },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({
      node: 'HTTP Request',
      message: 'Missing required field: url',
      details: { field: 'url' },
    });
    expect(result.errors[1]).toEqual({
      node: 'workflow',
      message: 'No trigger node found',
      details: null,
    });
    expect(result.summary.errorCount).toBe(2);
  });

  it('returns warnings when workflow has validation warnings', async () => {
    const validationResult = makeValidationResult({
      warnings: [
        { nodeName: 'Set', message: 'Node has default configuration', details: null },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({
      node: 'Set',
      message: 'Node has default configuration',
      details: null,
    });
    expect(result.summary.warningCount).toBe(1);
  });

  it('returns suggestions when present', async () => {
    const validationResult = makeValidationResult({
      suggestions: [
        'Consider adding error handling nodes',
        'Add a timeout to HTTP requests',
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.suggestions).toEqual([
      'Consider adding error handling nodes',
      'Add a timeout to HTTP requests',
    ]);
  });

  it('handles validator throwing an error', async () => {
    mockValidateWorkflow.mockRejectedValue(new Error('Invalid workflow structure'));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid workflow structure');
    expect(result.tip).toContain('workflow JSON');
  });

  it('handles non-Error thrown by validator', async () => {
    mockValidateWorkflow.mockRejectedValue('something went wrong');

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unknown error validating workflow');
  });

  it('passes options to the validator', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const options = {
      validateNodes: true,
      validateConnections: false,
      validateExpressions: true,
    };

    await validateWorkflow(ctx, { workflow: makeWorkflow(), options });

    expect(mockValidateWorkflow).toHaveBeenCalledWith(
      expect.any(Object),
      options
    );
  });

  it('does not include errors key when there are no errors', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result).not.toHaveProperty('errors');
  });

  it('does not include warnings key when there are no warnings', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result).not.toHaveProperty('warnings');
  });

  it('does not include suggestions key when there are no suggestions', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflow(ctx, { workflow: makeWorkflow() });

    expect(result).not.toHaveProperty('suggestions');
  });
});

// --- validateWorkflowConnections ---------------------------------------

describe('validateWorkflowConnections', () => {
  it('returns valid result for correct connections', async () => {
    const validationResult = makeValidationResult({
      errors: [],
      warnings: [],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(true);
    expect(result.statistics).toBeDefined();
    expect(result.statistics.totalNodes).toBe(3);
    expect(result.statistics.triggerNodes).toBe(1);
    expect(result.statistics.validConnections).toBe(2);
    expect(result.statistics.invalidConnections).toBe(0);
  });

  it('calls validator with connections-only options', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const workflow = makeWorkflow();
    await validateWorkflowConnections(ctx, { workflow });

    expect(mockValidateWorkflow).toHaveBeenCalledWith(workflow, {
      validateNodes: false,
      validateConnections: true,
      validateExpressions: false,
    });
  });

  it('returns connection-related errors only', async () => {
    const validationResult = makeValidationResult({
      errors: [
        { nodeName: 'Node1', message: 'Invalid connection type' },
        { nodeName: 'Node2', message: 'Missing required field: url' },
        { nodeName: 'Node3', message: 'Detected cycle in connections' },
        { nodeName: 'Node4', message: 'orphaned node detected' },
      ],
      warnings: [],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    // Only errors containing 'connection', 'cycle', or 'orphaned' should be included
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].message).toContain('connection');
    expect(result.errors[1].message).toContain('cycle');
    expect(result.errors[2].message).toContain('orphaned');
  });

  it('returns connection-related warnings only', async () => {
    const validationResult = makeValidationResult({
      errors: [],
      warnings: [
        { nodeName: 'Node1', message: 'Possible orphaned node' },
        { nodeName: 'Node2', message: 'Missing trigger node for webhook' },
        { nodeName: 'Node3', message: 'Node has default configuration' },
        { nodeName: 'Node4', message: 'Redundant connection path' },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    // Only warnings containing 'connection', 'orphaned', or 'trigger' should be included
    expect(result.warnings).toHaveLength(3);
    const messages = result.warnings.map((w: any) => w.message);
    expect(messages).toContain('Possible orphaned node');
    expect(messages).toContain('Missing trigger node for webhook');
    expect(messages).toContain('Redundant connection path');
  });

  it('handles validator throwing an error', async () => {
    mockValidateWorkflow.mockRejectedValue(new Error('Connections validation failed'));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Connections validation failed');
  });

  it('handles non-Error thrown by validator', async () => {
    mockValidateWorkflow.mockRejectedValue(42);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unknown error validating connections');
  });

  it('does not include errors key when no connection errors match filters', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      errors: [
        { nodeName: 'Node1', message: 'Missing required field: url' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    // 'Missing required field' does not match connection/cycle/orphaned filters
    expect(result.errors).toBeUndefined();
    // valid is based on all errors (result.errors.length === 0), not filtered ones
    expect(result.valid).toBe(false);
  });

  it('does not include warnings key when no connection warnings', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      warnings: [
        { nodeName: 'Node1', message: 'Node has default configuration' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    // 'Node has default configuration' does not match connection/orphaned/trigger filters
    expect(result.warnings).toBeUndefined();
  });

  it('uses node name from error or defaults to workflow', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      errors: [
        { nodeName: 'MyNode', message: 'Invalid connection type' },
        { message: 'Global cycle detected in connections' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowConnections(ctx, { workflow: makeWorkflow() });

    expect(result.errors[0].node).toBe('MyNode');
    expect(result.errors[1].node).toBe('workflow');
  });
});

// --- validateWorkflowExpressions ---------------------------------------

describe('validateWorkflowExpressions', () => {
  it('returns valid result for correct expressions', async () => {
    const validationResult = makeValidationResult({
      errors: [],
      warnings: [],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(true);
    expect(result.statistics).toBeDefined();
    expect(result.statistics.totalNodes).toBe(3);
    expect(result.statistics.expressionsValidated).toBe(5);
  });

  it('calls validator with expressions-only options', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const workflow = makeWorkflow();
    await validateWorkflowExpressions(ctx, { workflow });

    expect(mockValidateWorkflow).toHaveBeenCalledWith(workflow, {
      validateNodes: false,
      validateConnections: false,
      validateExpressions: true,
    });
  });

  it('returns expression-related errors only', async () => {
    const validationResult = makeValidationResult({
      errors: [
        { nodeName: 'Set', message: 'Expression syntax error: {{ invalid' },
        { nodeName: 'Code', message: 'Missing required field: url' },
        { nodeName: 'IF', message: 'Invalid use of $json.value' },
      ],
      warnings: [],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    // Only errors containing 'Expression', '$', or '{{' should be included
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toContain('{{');
    expect(result.errors[1].message).toContain('$json');
  });

  it('returns expression-related warnings only', async () => {
    const validationResult = makeValidationResult({
      errors: [],
      warnings: [
        { nodeName: 'Set', message: 'Expression may be simplified: {{ $json.name }}' },
        { nodeName: 'Code', message: 'Node has default configuration' },
        { nodeName: 'IF', message: 'Consider using $node reference' },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    // Only warnings containing 'Expression', '$', or '{{' should be included
    expect(result.warnings).toHaveLength(2);
    const messages = result.warnings.map((w: any) => w.message);
    expect(messages).toContain('Expression may be simplified: {{ $json.name }}');
    expect(messages).toContain('Consider using $node reference');
  });

  it('includes tips when there are expression errors', async () => {
    const validationResult = makeValidationResult({
      errors: [
        { nodeName: 'Set', message: 'Expression error: {{ broken' },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.tips).toBeDefined();
    expect(result.tips).toBeInstanceOf(Array);
    expect(result.tips.length).toBe(4);
    expect(result.tips).toContain('Use {{ }} to wrap expressions');
    expect(result.tips).toContain('Reference data with $json.propertyName');
    expect(result.tips).toContain('Reference other nodes with $node["Node Name"].json');
    expect(result.tips).toContain('Use $input.item for input data in loops');
  });

  it('includes tips when there are expression warnings', async () => {
    const validationResult = makeValidationResult({
      errors: [],
      warnings: [
        { nodeName: 'Set', message: 'Expression warning about $json usage' },
      ],
    });
    mockValidateWorkflow.mockResolvedValue(validationResult);

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.tips).toBeDefined();
    expect(result.tips).toHaveLength(4);
  });

  it('does not include tips when there are no expression issues', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult());

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.tips).toBeUndefined();
  });

  it('handles validator throwing an error', async () => {
    mockValidateWorkflow.mockRejectedValue(new Error('Expression validation failed'));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Expression validation failed');
  });

  it('handles non-Error thrown by validator', async () => {
    mockValidateWorkflow.mockRejectedValue({ code: 'INVALID' });

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unknown error validating expressions');
  });

  it('does not include errors key when no expression errors match filters', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      errors: [
        { nodeName: 'Node1', message: 'Missing required field: url' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    // 'Missing required field' does not match Expression/$/ {{ filters
    expect(result.errors).toBeUndefined();
    // valid is based on all errors (result.errors.length === 0), not filtered ones
    expect(result.valid).toBe(false);
  });

  it('does not include warnings key when no expression warnings', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      warnings: [
        { nodeName: 'Node1', message: 'Node has default configuration' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.warnings).toBeUndefined();
  });

  it('uses node name from error or defaults to workflow', async () => {
    mockValidateWorkflow.mockResolvedValue(makeValidationResult({
      errors: [
        { nodeName: 'MyNode', message: 'Expression parse error: {{ x' },
        { message: 'Global $ reference issue' },
      ],
    }));

    const ctx = createContext();
    ctxForCleanup = ctx;

    const result = await validateWorkflowExpressions(ctx, { workflow: makeWorkflow() });

    expect(result.errors[0].node).toBe('MyNode');
    expect(result.errors[1].node).toBe('workflow');
  });
});
