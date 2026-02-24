/**
 * Tests for WorkflowValidator service
 *
 * Mocks: NodeRepository, EnhancedConfigValidator, ExpressionValidator, Logger
 */

// Mock ExpressionValidator before importing the module under test
jest.mock('../../src/services/expression-validator', () => ({
  ExpressionValidator: {
    validateNodeExpressions: jest.fn().mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      usedVariables: new Set(),
      usedNodes: new Set(),
    }),
  },
}));

// Mock Logger to suppress console output during tests
jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import { WorkflowValidator } from '../../src/services/workflow-validator';
import { ExpressionValidator } from '../../src/services/expression-validator';

// -----------------------------------------------------------------------
// Helper factories
// -----------------------------------------------------------------------

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'node-1',
    name: overrides.name ?? 'Test Node',
    type: overrides.type ?? 'n8n-nodes-base.set',
    position: overrides.position ?? [0, 0],
    parameters: overrides.parameters ?? {},
    ...(overrides.credentials !== undefined && { credentials: overrides.credentials }),
    ...(overrides.disabled !== undefined && { disabled: overrides.disabled }),
    ...(overrides.notes !== undefined && { notes: overrides.notes }),
    ...(overrides.typeVersion !== undefined && { typeVersion: overrides.typeVersion }),
  };
}

function makeTriggerNode(overrides: Record<string, any> = {}) {
  return makeNode({
    id: 'trigger-1',
    name: 'Manual Trigger',
    type: 'n8n-nodes-base.manualTrigger',
    ...overrides,
  });
}

function makeWebhookNode(overrides: Record<string, any> = {}) {
  return makeNode({
    id: 'webhook-1',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    ...overrides,
  });
}

function makeWorkflow(overrides: Record<string, any> = {}) {
  return {
    name: overrides.name ?? 'Test Workflow',
    nodes: overrides.nodes ?? [],
    connections: overrides.connections ?? {},
    ...(overrides.settings !== undefined && { settings: overrides.settings }),
  };
}

/** Creates a simple connected two-node workflow (trigger -> action). */
function makeTwoNodeWorkflow(actionNodeOverrides: Record<string, any> = {}) {
  const trigger = makeTriggerNode();
  const action = makeNode({
    id: 'action-1',
    name: 'Set',
    type: 'n8n-nodes-base.set',
    ...actionNodeOverrides,
  });

  return makeWorkflow({
    nodes: [trigger, action],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Set', type: 'main', index: 0 }]],
      },
    },
  });
}

// -----------------------------------------------------------------------
// Mock helpers
// -----------------------------------------------------------------------

function createMockNodeRepository() {
  return {
    getNode: jest.fn().mockReturnValue(null),
  } as any;
}

function createMockNodeValidator() {
  return {
    validateWithMode: jest.fn().mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    }),
  } as any;
}

/** Convenience: set getNode to return a valid NodeRecord for a given type (or normalised form). */
function mockNodeExists(
  repo: any,
  types: string | string[],
  overrides: Record<string, any> = {}
) {
  const typeList = Array.isArray(types) ? types : [types];
  repo.getNode.mockImplementation((t: string) => {
    if (typeList.includes(t)) {
      return {
        nodeType: t,
        displayName: overrides.displayName ?? t,
        description: overrides.description ?? '',
        category: overrides.category ?? 'core',
        developmentStyle: overrides.developmentStyle ?? 'declarative',
        package: overrides.package ?? 'n8n-nodes-base',
        isAITool: overrides.isAITool ?? false,
        isTrigger: overrides.isTrigger ?? false,
        isWebhook: overrides.isWebhook ?? false,
        isVersioned: overrides.isVersioned ?? false,
        version: overrides.version ?? '1',
        properties: overrides.properties ?? [],
        operations: overrides.operations ?? [],
        credentials: overrides.credentials ?? [],
        hasDocumentation: overrides.hasDocumentation ?? false,
      };
    }
    return null;
  });
}

// -----------------------------------------------------------------------
// Test suite
// -----------------------------------------------------------------------

describe('WorkflowValidator', () => {
  let repo: ReturnType<typeof createMockNodeRepository>;
  let validator: ReturnType<typeof createMockNodeValidator>;
  let wfValidator: WorkflowValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createMockNodeRepository();
    validator = createMockNodeValidator();
    wfValidator = new WorkflowValidator(repo, validator);

    // Default: every node type lookup succeeds (non-versioned)
    repo.getNode.mockReturnValue({
      nodeType: 'nodes-base.set',
      displayName: 'Set',
      description: '',
      category: 'core',
      developmentStyle: 'declarative',
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
    });
  });

  // =====================================================================
  // 1. Structure validation
  // =====================================================================

  describe('structure validation', () => {
    it('should error on empty nodes array', async () => {
      const wf = makeWorkflow({ nodes: [], connections: {} });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Workflow has no nodes' }),
        ])
      );
    });

    it('should throw when nodes field is missing (null)', async () => {
      const wf = { connections: {} } as any;
      // The code accesses workflow.nodes.length during result initialization
      // (before the try block), so a missing nodes field throws uncaught
      await expect(wfValidator.validateWorkflow(wf)).rejects.toThrow(TypeError);
    });

    it('should throw when nodes field is not an array', async () => {
      const wf = { nodes: 'not-an-array', connections: {} } as any;
      // Non-array nodes causes a TypeError on .filter() during initialization
      await expect(wfValidator.validateWorkflow(wf)).rejects.toThrow(TypeError);
    });

    it('should error when connections field is missing', async () => {
      const wf = { nodes: [makeNode()] } as any;
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Workflow must have a connections object' }),
        ])
      );
    });

    it('should error on duplicate node names', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'DupeName' }),
          makeNode({ id: 'b', name: 'DupeName' }),
        ],
        connections: {
          DupeName: {
            main: [[{ node: 'DupeName', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Duplicate node name'),
          }),
        ])
      );
    });

    it('should error on duplicate node IDs', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'same-id', name: 'Node A' }),
          makeNode({ id: 'same-id', name: 'Node B' }),
        ],
        connections: {
          'Node A': {
            main: [[{ node: 'Node B', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Duplicate node ID'),
          }),
        ])
      );
    });

    it('should error on single non-webhook node workflow', async () => {
      const wf = makeWorkflow({
        nodes: [makeNode({ type: 'n8n-nodes-base.set' })],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Single-node workflows are only valid for webhook'),
          }),
        ])
      );
    });

    it('should allow single webhook node workflow with a warning about no connections', async () => {
      const wf = makeWorkflow({
        nodes: [makeWebhookNode()],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      // No structure error about single-node
      const singleNodeErrors = result.errors.filter(
        (e) => e.message.includes('Single-node workflows')
      );
      expect(singleNodeErrors).toHaveLength(0);

      // Should warn about no connections on webhook
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Webhook node has no connections'),
          }),
        ])
      );
    });

    it('should also recognize n8n-nodes-base.webhookTrigger as a valid single-node workflow', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'wt', name: 'Webhook Trigger', type: 'n8n-nodes-base.webhookTrigger' }),
        ],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      const singleNodeErrors = result.errors.filter(
        (e) => e.message.includes('Single-node workflows')
      );
      expect(singleNodeErrors).toHaveLength(0);
    });

    it('should error on multi-node workflow with no connections and enabled nodes', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Multi-node workflow has no connections'),
          }),
        ])
      );
    });

    it('should error on multi-node workflow when at least one node is enabled but no connections exist', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', name: 'Only Enabled', disabled: false }),
          makeNode({ id: 'n2', name: 'Disabled A', disabled: true }),
          makeNode({ id: 'n3', name: 'Disabled B', disabled: true }),
        ],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      // nodes.length > 1 is true, hasEnabledNodes is true (n1), hasConnections is false
      // so the multi-node error IS expected
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Multi-node workflow has no connections'),
          }),
        ])
      );
    });

    it('should not error on multi-node workflow when all nodes are disabled', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', name: 'Disabled A', disabled: true }),
          makeNode({ id: 'n2', name: 'Disabled B', disabled: true }),
        ],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      const multiNodeErrors = result.errors.filter((e) =>
        e.message.includes('Multi-node workflow has no connections')
      );
      expect(multiNodeErrors).toHaveLength(0);
    });

    it('should report correct statistics for totalNodes and enabledNodes', async () => {
      const wf = makeTwoNodeWorkflow();
      wf.nodes.push(makeNode({ id: 'n3', name: 'Disabled', disabled: true }));

      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.totalNodes).toBe(3);
      expect(result.statistics.enabledNodes).toBe(2);
    });
  });

  // =====================================================================
  // 2. Trigger detection
  // =====================================================================

  describe('trigger detection', () => {
    it('should count manualTrigger as a trigger node', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.triggerNodes).toBeGreaterThanOrEqual(1);
    });

    it('should count webhook as a trigger node', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeWebhookNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          Webhook: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.triggerNodes).toBeGreaterThanOrEqual(1);
    });

    it('should count scheduleTrigger as a trigger node', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 't', name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger' }),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          Schedule: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.triggerNodes).toBe(1);
    });

    it('should count start node as a trigger node', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 's', name: 'Start', type: 'n8n-nodes-base.start' }),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          Start: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.triggerNodes).toBe(1);
    });

    it('should count formTrigger as a trigger node', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'f', name: 'Form', type: 'n8n-nodes-base.formTrigger' }),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          Form: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.triggerNodes).toBe(1);
    });

    it('should warn when no trigger nodes are present', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'Set A', type: 'n8n-nodes-base.set' }),
          makeNode({ id: 'b', name: 'Set B', type: 'n8n-nodes-base.set' }),
        ],
        connections: {
          'Set A': { main: [[{ node: 'Set B', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('no trigger nodes'),
          }),
        ])
      );
      expect(result.statistics.triggerNodes).toBe(0);
    });

    it('should not warn about missing triggers when all nodes are disabled', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A', disabled: true }),
          makeNode({ id: 'b', name: 'B', disabled: true }),
        ],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      const triggerWarnings = result.warnings.filter((w) =>
        w.message.includes('no trigger nodes')
      );
      expect(triggerWarnings).toHaveLength(0);
    });
  });

  // =====================================================================
  // 3. Connection validation
  // =====================================================================

  describe('connection validation', () => {
    it('should accept valid connections and count them', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.validConnections).toBe(1);
      expect(result.statistics.invalidConnections).toBe(0);
    });

    it('should error on connection from non-existent source node', async () => {
      const wf = makeWorkflow({
        nodes: [makeTriggerNode(), makeNode({ id: 'n2', name: 'Set' })],
        connections: {
          'Ghost Node': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Connection from non-existent node'),
          }),
        ])
      );
      expect(result.statistics.invalidConnections).toBe(1);
    });

    it('should error on connection to non-existent target node', async () => {
      const wf = makeWorkflow({
        nodes: [makeTriggerNode(), makeNode({ id: 'n2', name: 'Set' })],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'NonExistent', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Connection to non-existent node'),
          }),
        ])
      );
      expect(result.statistics.invalidConnections).toBe(1);
    });

    it('should detect when source connection uses node ID instead of name', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode({ id: 'trigger-id-123', name: 'My Trigger' }),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          // Using the ID instead of the name
          'trigger-id-123': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("uses node ID 'trigger-id-123' instead of node name"),
          }),
        ])
      );
    });

    it('should detect when target connection uses node ID instead of name', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'set-id-456', name: 'Set Node' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'set-id-456', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("uses node ID 'set-id-456' instead of node name"),
          }),
        ])
      );
    });

    it('should warn on connection to disabled node', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Disabled Set', disabled: true }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Disabled Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Connection to disabled node'),
          }),
        ])
      );
    });

    it('should warn about orphaned (unconnected, non-trigger) nodes', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Connected Set' }),
          makeNode({ id: 'n3', name: 'Orphan Node' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Connected Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeName: 'Orphan Node',
            message: expect.stringContaining('not connected to any other nodes'),
          }),
        ])
      );
    });

    it('should not warn about trigger nodes being orphaned', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const orphanWarnings = result.warnings.filter(
        (w) => w.nodeName === 'Manual Trigger' && w.message.includes('not connected')
      );
      expect(orphanWarnings).toHaveLength(0);
    });

    it('should not warn about disabled nodes being orphaned', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
          makeNode({ id: 'n3', name: 'Disabled Orphan', disabled: true }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const orphanWarnings = result.warnings.filter(
        (w) => w.nodeName === 'Disabled Orphan' && w.message.includes('not connected')
      );
      expect(orphanWarnings).toHaveLength(0);
    });

    it('should validate error output connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'HTTP' }),
          makeNode({ id: 'n3', name: 'Error Handler' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'HTTP', type: 'main', index: 0 }]],
          },
          HTTP: {
            error: [[{ node: 'Error Handler', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.validConnections).toBe(2);
    });

    it('should validate ai_tool output connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'agent', name: 'AI Agent', type: '@n8n/n8n-nodes-langchain.agent' }),
          makeNode({ id: 'tool', name: 'Calculator', type: 'n8n-nodes-base.code' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'AI Agent', type: 'main', index: 0 }]],
          },
          'AI Agent': {
            ai_tool: [[{ node: 'Calculator', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.statistics.validConnections).toBe(2);
    });
  });

  // =====================================================================
  // 4. Cycle detection
  // =====================================================================

  describe('cycle detection', () => {
    it('should not report cycle for acyclic workflow', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      const cycleErrors = result.errors.filter((e) =>
        e.message.includes('cycle')
      );
      expect(cycleErrors).toHaveLength(0);
    });

    it('should detect a simple A -> B -> A cycle', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A', type: 'n8n-nodes-base.set' }),
          makeNode({ id: 'b', name: 'B', type: 'n8n-nodes-base.set' }),
        ],
        connections: {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'A', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('cycle'),
          }),
        ])
      );
    });

    it('should detect a longer A -> B -> C -> A cycle', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A' }),
          makeNode({ id: 'b', name: 'B' }),
          makeNode({ id: 'c', name: 'C' }),
        ],
        connections: {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
          C: { main: [[{ node: 'A', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('cycle'),
          }),
        ])
      );
    });

    it('should detect cycle through error connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A' }),
          makeNode({ id: 'b', name: 'B' }),
        ],
        connections: {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { error: [[{ node: 'A', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('cycle'),
          }),
        ])
      );
    });

    it('should detect cycle through ai_tool connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A' }),
          makeNode({ id: 'b', name: 'B' }),
        ],
        connections: {
          A: { ai_tool: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'A', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('cycle'),
          }),
        ])
      );
    });

    it('should handle complex diamond DAG without reporting a cycle', async () => {
      // A -> B, A -> C, B -> D, C -> D (diamond, no cycle)
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode({ id: 'a', name: 'A', type: 'n8n-nodes-base.manualTrigger' }),
          makeNode({ id: 'b', name: 'B' }),
          makeNode({ id: 'c', name: 'C' }),
          makeNode({ id: 'd', name: 'D' }),
        ],
        connections: {
          A: {
            main: [
              [
                { node: 'B', type: 'main', index: 0 },
                { node: 'C', type: 'main', index: 0 },
              ],
            ],
          },
          B: { main: [[{ node: 'D', type: 'main', index: 0 }]] },
          C: { main: [[{ node: 'D', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const cycleErrors = result.errors.filter((e) =>
        e.message.includes('cycle')
      );
      expect(cycleErrors).toHaveLength(0);
    });
  });

  // =====================================================================
  // 5. Node validation
  // =====================================================================

  describe('node validation', () => {
    it('should error on unknown node type', async () => {
      repo.getNode.mockReturnValue(null);
      const wf = makeTwoNodeWorkflow({ type: 'n8n-nodes-base.nonExistentNode' });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Unknown node type'),
          }),
        ])
      );
    });

    it('should error when node type uses nodes-base. prefix (must use n8n-nodes-base.)', async () => {
      const wf = makeTwoNodeWorkflow({ type: 'nodes-base.set' });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid node type: "nodes-base.set"'),
          }),
        ])
      );
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Use "n8n-nodes-base.set" instead'),
          }),
        ])
      );
    });

    it('should try normalized type (n8n-nodes-base -> nodes-base) for lookup', async () => {
      // First call with full type returns null, second with normalized returns something
      repo.getNode.mockImplementation((type: string) => {
        if (type === 'nodes-base.httpRequest') {
          return {
            nodeType: 'nodes-base.httpRequest',
            displayName: 'HTTP Request',
            description: '',
            category: 'core',
            developmentStyle: 'declarative',
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
          };
        }
        return null;
      });

      const wf = makeTwoNodeWorkflow({ type: 'n8n-nodes-base.httpRequest' });
      const result = await wfValidator.validateWorkflow(wf);

      // Should have called getNode with the normalized type
      expect(repo.getNode).toHaveBeenCalledWith('n8n-nodes-base.httpRequest');
      expect(repo.getNode).toHaveBeenCalledWith('nodes-base.httpRequest');
    });

    it('should try normalized type for @n8n/n8n-nodes-langchain prefix', async () => {
      repo.getNode.mockImplementation((type: string) => {
        if (type === 'nodes-langchain.agent') {
          return {
            nodeType: 'nodes-langchain.agent',
            displayName: 'Agent',
            description: '',
            category: 'AI',
            developmentStyle: 'declarative',
            package: '@n8n/n8n-nodes-langchain',
            isAITool: false,
            isTrigger: false,
            isWebhook: false,
            isVersioned: false,
            version: '1',
            properties: [],
            operations: [],
            credentials: [],
            hasDocumentation: false,
          };
        }
        return null;
      });

      const wf = makeTwoNodeWorkflow({ type: '@n8n/n8n-nodes-langchain.agent' });
      const result = await wfValidator.validateWorkflow(wf);

      expect(repo.getNode).toHaveBeenCalledWith('nodes-langchain.agent');
    });

    it('should skip disabled nodes during node validation', async () => {
      repo.getNode.mockReturnValue(null);
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Disabled Unknown', type: 'n8n-nodes-base.fake', disabled: true }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Disabled Unknown', type: 'main', index: 0 }]],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);

      const unknownTypeErrors = result.errors.filter((e) =>
        e.message.includes('Unknown node type')
      );
      // The disabled node should not have been validated
      const disabledNodeErrors = unknownTypeErrors.filter(
        (e) => e.nodeName === 'Disabled Unknown'
      );
      expect(disabledNodeErrors).toHaveLength(0);
    });

    it('should forward errors from EnhancedConfigValidator', async () => {
      validator.validateWithMode.mockReturnValue({
        valid: false,
        errors: ['Missing required field: url'],
        warnings: [],
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Missing required field: url',
            nodeName: 'Set',
          }),
        ])
      );
    });

    it('should forward warnings from EnhancedConfigValidator', async () => {
      validator.validateWithMode.mockReturnValue({
        valid: true,
        errors: [],
        warnings: ['Consider setting a timeout'],
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Consider setting a timeout',
            nodeName: 'Set',
          }),
        ])
      );
    });

    describe('typeVersion validation', () => {
      beforeEach(() => {
        // Set up versioned node
        repo.getNode.mockImplementation((type: string) => {
          if (
            type === 'n8n-nodes-base.httpRequest' ||
            type === 'nodes-base.httpRequest'
          ) {
            return {
              nodeType: type,
              displayName: 'HTTP Request',
              description: '',
              category: 'core',
              developmentStyle: 'declarative',
              package: 'n8n-nodes-base',
              isAITool: false,
              isTrigger: false,
              isWebhook: false,
              isVersioned: true,
              version: '4',
              properties: [],
              operations: [],
              credentials: [],
              hasDocumentation: false,
            };
          }
          // Default non-versioned node
          return {
            nodeType: type,
            displayName: 'Node',
            description: '',
            category: 'core',
            developmentStyle: 'declarative',
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
          };
        });
      });

      it('should error when typeVersion is missing for a versioned node', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          // No typeVersion set
        });

        const result = await wfValidator.validateWorkflow(wf);

        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining("Missing required property 'typeVersion'"),
            }),
          ])
        );
      });

      it('should error when typeVersion is zero (falsy)', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 0,
        });

        const result = await wfValidator.validateWorkflow(wf);

        // typeVersion 0 is falsy, so it triggers the "Missing" branch
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining("Missing required property 'typeVersion'"),
            }),
          ])
        );
      });

      it('should error when typeVersion is a negative number', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: -1,
        });

        const result = await wfValidator.validateWorkflow(wf);

        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Invalid typeVersion'),
            }),
          ])
        );
      });

      it('should error when typeVersion is not a number', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 'abc' as any,
        });

        const result = await wfValidator.validateWorkflow(wf);

        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Invalid typeVersion'),
            }),
          ])
        );
      });

      it('should warn when typeVersion is outdated (lower than latest)', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 2,
        });

        const result = await wfValidator.validateWorkflow(wf);

        expect(result.warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Outdated typeVersion: 2'),
            }),
          ])
        );
      });

      it('should error when typeVersion exceeds maximum supported version', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 99,
        });

        const result = await wfValidator.validateWorkflow(wf);

        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('exceeds maximum supported version'),
            }),
          ])
        );
      });

      it('should accept the latest typeVersion without errors or warnings', async () => {
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4,
        });

        const result = await wfValidator.validateWorkflow(wf);

        const versionIssues = [...result.errors, ...result.warnings].filter(
          (i) =>
            i.message.includes('typeVersion') || i.message.includes('Outdated')
        );
        expect(versionIssues).toHaveLength(0);
      });

      it('should not check typeVersion for non-versioned nodes', async () => {
        // n8n-nodes-base.set is non-versioned by default in our mock
        const wf = makeTwoNodeWorkflow({
          type: 'n8n-nodes-base.set',
          // No typeVersion
        });

        const result = await wfValidator.validateWorkflow(wf);

        const versionErrors = result.errors.filter((e) =>
          e.message.includes('typeVersion')
        );
        expect(versionErrors).toHaveLength(0);
      });
    });

    it('should catch and report exceptions during individual node validation', async () => {
      repo.getNode.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Failed to validate node'),
          }),
        ])
      );
    });
  });

  // =====================================================================
  // 6. Expression validation
  // =====================================================================

  describe('expression validation', () => {
    const mockExpressionValidator =
      ExpressionValidator.validateNodeExpressions as jest.Mock;

    it('should call ExpressionValidator.validateNodeExpressions for each enabled node', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf);

      // Should be called for both enabled nodes (trigger + action)
      expect(mockExpressionValidator).toHaveBeenCalledTimes(2);
    });

    it('should skip disabled nodes for expression validation', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set', disabled: true }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });

      await wfValidator.validateWorkflow(wf);

      // Should only be called for the trigger (Set is disabled)
      expect(mockExpressionValidator).toHaveBeenCalledTimes(1);
    });

    it('should propagate expression errors into the result', async () => {
      mockExpressionValidator.mockReturnValue({
        valid: false,
        errors: ['Unmatched expression brackets {{ }}'],
        warnings: [],
        usedVariables: new Set(),
        usedNodes: new Set(),
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Expression error'),
          }),
        ])
      );
    });

    it('should propagate expression warnings into the result', async () => {
      mockExpressionValidator.mockReturnValue({
        valid: true,
        errors: [],
        warnings: ['Optional chaining (?.) is not supported'],
        usedVariables: new Set(),
        usedNodes: new Set(),
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Expression warning'),
          }),
        ])
      );
    });

    it('should count expressionsValidated from usedVariables size', async () => {
      mockExpressionValidator.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        usedVariables: new Set(['$json', '$workflow']),
        usedNodes: new Set(),
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      // 2 variables per node * 2 enabled nodes = 4
      expect(result.statistics.expressionsValidated).toBe(4);
    });

    it('should pass correct context including availableNodes and hasInputData', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf);

      // The "Set" node should receive context where Manual Trigger is an available node
      // and hasInputData is true (it has an input connection from Manual Trigger)
      const calls = mockExpressionValidator.mock.calls;
      const setCall = calls.find(
        (c: any[]) => c[1]?.currentNodeName === 'Set'
      );

      expect(setCall).toBeDefined();
      expect(setCall![1].availableNodes).toContain('Manual Trigger');
      expect(setCall![1].hasInputData).toBe(true);
    });

    it('should set hasInputData to false for nodes with no input connections', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf);

      const calls = mockExpressionValidator.mock.calls;
      const triggerCall = calls.find(
        (c: any[]) => c[1]?.currentNodeName === 'Manual Trigger'
      );

      expect(triggerCall).toBeDefined();
      expect(triggerCall![1].hasInputData).toBe(false);
    });
  });

  // =====================================================================
  // 7. Pattern checks (best practices)
  // =====================================================================

  describe('pattern checks', () => {
    it('should warn about missing error handling when workflow has > 3 nodes and no error connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Step 1' }),
          makeNode({ id: 'n3', name: 'Step 2' }),
          makeNode({ id: 'n4', name: 'Step 3' }),
        ],
        connections: {
          'Manual Trigger': { main: [[{ node: 'Step 1', type: 'main', index: 0 }]] },
          'Step 1': { main: [[{ node: 'Step 2', type: 'main', index: 0 }]] },
          'Step 2': { main: [[{ node: 'Step 3', type: 'main', index: 0 }]] },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('error handling'),
          }),
        ])
      );
    });

    it('should not warn about error handling for small workflows (<= 3 nodes)', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      const errorHandlingWarnings = result.warnings.filter((w) =>
        w.message.includes('error handling')
      );
      expect(errorHandlingWarnings).toHaveLength(0);
    });

    it('should not warn about error handling when error connections exist', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Step 1' }),
          makeNode({ id: 'n3', name: 'Step 2' }),
          makeNode({ id: 'n4', name: 'Error Handler' }),
        ],
        connections: {
          'Manual Trigger': { main: [[{ node: 'Step 1', type: 'main', index: 0 }]] },
          'Step 1': {
            main: [[{ node: 'Step 2', type: 'main', index: 0 }]],
            error: [[{ node: 'Error Handler', type: 'main', index: 0 }]],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);

      const errorHandlingWarnings = result.warnings.filter(
        (w) => w.message === 'Consider adding error handling to your workflow'
      );
      expect(errorHandlingWarnings).toHaveLength(0);
    });

    it('should warn about long linear chains (> 10 nodes)', async () => {
      // Build a chain of 12 nodes
      const nodes = [makeTriggerNode()];
      const connections: Record<string, any> = {};

      for (let i = 1; i <= 11; i++) {
        nodes.push(makeNode({ id: `n${i}`, name: `Step ${i}` }));
      }

      connections['Manual Trigger'] = {
        main: [[{ node: 'Step 1', type: 'main', index: 0 }]],
      };
      for (let i = 1; i < 11; i++) {
        connections[`Step ${i}`] = {
          main: [[{ node: `Step ${i + 1}`, type: 'main', index: 0 }]],
        };
      }

      const wf = makeWorkflow({ nodes, connections });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Long linear chain detected'),
          }),
        ])
      );
    });

    it('should not warn about chain length for short workflows', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      const chainWarnings = result.warnings.filter((w) =>
        w.message.includes('Long linear chain')
      );
      expect(chainWarnings).toHaveLength(0);
    });

    it('should warn about missing credential configuration', async () => {
      const wf = makeTwoNodeWorkflow({
        credentials: {
          slackApi: {}, // missing 'id' property
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Missing credentials configuration'),
          }),
        ])
      );
    });

    it('should not warn about credentials when they have an id', async () => {
      const wf = makeTwoNodeWorkflow({
        credentials: {
          slackApi: { id: 'cred-123', name: 'My Slack' },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const credWarnings = result.warnings.filter((w) =>
        w.message.includes('Missing credentials configuration')
      );
      expect(credWarnings).toHaveLength(0);
    });

    it('should warn when AI Agent has no tools connected', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({
            id: 'agent',
            name: 'My Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
          }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'My Agent', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeName: 'My Agent',
            message: expect.stringContaining('AI Agent has no tools connected'),
          }),
        ])
      );
    });

    it('should not warn about tools when AI Agent has ai_tool connections', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({
            id: 'agent',
            name: 'My Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
          }),
          makeNode({
            id: 'tool',
            name: 'Code Tool',
            type: 'n8n-nodes-base.code',
          }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'My Agent', type: 'main', index: 0 }]],
          },
          'My Agent': {
            ai_tool: [[{ node: 'Code Tool', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const toolWarnings = result.warnings.filter(
        (w) => w.nodeName === 'My Agent' && w.message.includes('no tools connected')
      );
      expect(toolWarnings).toHaveLength(0);
    });

    it('should add suggestion about community packages when ai_tool connections exist', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({
            id: 'agent',
            name: 'My Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
          }),
          makeNode({ id: 'tool', name: 'Tool', type: 'n8n-nodes-base.code' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'My Agent', type: 'main', index: 0 }]],
          },
          'My Agent': {
            ai_tool: [[{ node: 'Tool', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE'),
        ])
      );
    });
  });

  // =====================================================================
  // 8. Suggestions
  // =====================================================================

  describe('suggestions', () => {
    it('should suggest adding a trigger when none present', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeNode({ id: 'a', name: 'A' }),
          makeNode({ id: 'b', name: 'B' }),
        ],
        connections: {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('trigger node'),
        ])
      );
    });

    it('should suggest connection structure example when connection errors exist', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          'Ghost Node': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Example connection structure'),
        ])
      );
      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Use node NAMES (not IDs)'),
        ])
      );
    });

    it('should suggest error handling when no error outputs exist', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('error handling'),
        ])
      );
    });

    it('should not suggest error handling when error outputs exist', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
          makeNode({ id: 'n3', name: 'Error Handler' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
          Set: {
            error: [[{ node: 'Error Handler', type: 'main', index: 0 }]],
          },
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      const errorSuggestions = result.suggestions.filter((s) =>
        s.includes('Add error handling')
      );
      expect(errorSuggestions).toHaveLength(0);
    });

    it('should suggest breaking into sub-workflows when > 20 nodes', async () => {
      const nodes = [makeTriggerNode()];
      const connections: Record<string, any> = {};

      for (let i = 1; i <= 20; i++) {
        nodes.push(makeNode({ id: `n${i}`, name: `Node ${i}` }));
      }

      connections['Manual Trigger'] = {
        main: [[{ node: 'Node 1', type: 'main', index: 0 }]],
      };
      for (let i = 1; i < 20; i++) {
        connections[`Node ${i}`] = {
          main: [[{ node: `Node ${i + 1}`, type: 'main', index: 0 }]],
        };
      }

      const wf = makeWorkflow({ nodes, connections });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sub-workflows'),
        ])
      );
    });

    it('should suggest Code node for nodes with many expressions (> 5)', async () => {
      const wf = makeTwoNodeWorkflow({
        parameters: {
          field1: '{{ $json.a }}',
          field2: '{{ $json.b }}',
          field3: '{{ $json.c }}',
          field4: '{{ $json.d }}',
          field5: '{{ $json.e }}',
          field6: '{{ $json.f }}',
        },
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Code node'),
        ])
      );
    });

    it('should suggest minimal workflow structure for single-node + no connections', async () => {
      const wf = makeWorkflow({
        nodes: [makeWebhookNode()],
        connections: {},
      });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('minimal workflow needs'),
        ])
      );
    });
  });

  // =====================================================================
  // 9. Options: validateNodes, validateConnections, validateExpressions, profile
  // =====================================================================

  describe('options', () => {
    it('should skip node validation when validateNodes is false', async () => {
      repo.getNode.mockReturnValue(null); // Would produce errors if called
      const wf = makeTwoNodeWorkflow({ type: 'n8n-nodes-base.nonExistent' });

      const result = await wfValidator.validateWorkflow(wf, {
        validateNodes: false,
      });

      const unknownTypeErrors = result.errors.filter((e) =>
        e.message.includes('Unknown node type')
      );
      expect(unknownTypeErrors).toHaveLength(0);
    });

    it('should skip connection validation when validateConnections is false', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          'Ghost Node': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf, {
        validateConnections: false,
      });

      const connectionErrors = result.errors.filter((e) =>
        e.message.includes('non-existent node')
      );
      expect(connectionErrors).toHaveLength(0);
    });

    it('should skip expression validation when validateExpressions is false', async () => {
      const mockExpressionValidator =
        ExpressionValidator.validateNodeExpressions as jest.Mock;

      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf, {
        validateExpressions: false,
      });

      expect(mockExpressionValidator).not.toHaveBeenCalled();
    });

    it('should pass profile to EnhancedConfigValidator.validateWithMode', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf, { profile: 'strict' });

      // The validator should have been called with 'strict' profile
      expect(validator.validateWithMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Array),
        'operation',
        'strict'
      );
    });

    it('should default to runtime profile when not specified', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf);

      expect(validator.validateWithMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Array),
        'operation',
        'runtime'
      );
    });

    it('should default all options to true when not provided', async () => {
      const mockExpressionValidator =
        ExpressionValidator.validateNodeExpressions as jest.Mock;

      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf);

      // Node validation ran (validateWithMode was called)
      expect(validator.validateWithMode).toHaveBeenCalled();
      // Expression validation ran
      expect(mockExpressionValidator).toHaveBeenCalled();
    });

    it('should accept minimal profile', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf, { profile: 'minimal' });

      expect(validator.validateWithMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Array),
        'operation',
        'minimal'
      );
    });

    it('should accept ai-friendly profile', async () => {
      const wf = makeTwoNodeWorkflow();
      await wfValidator.validateWorkflow(wf, { profile: 'ai-friendly' });

      expect(validator.validateWithMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Array),
        'operation',
        'ai-friendly'
      );
    });
  });

  // =====================================================================
  // 10. Result validity flag
  // =====================================================================

  describe('result validity', () => {
    it('should set valid to true when there are no errors', async () => {
      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.valid).toBe(true);
    });

    it('should set valid to false when there are errors', async () => {
      const wf = makeWorkflow({ nodes: [], connections: {} });
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should set valid to true even when there are warnings but no errors', async () => {
      // Workflow with no triggers produces warnings but not structural errors
      // if it has connections and multiple nodes
      validator.validateWithMode.mockReturnValue({
        valid: true,
        errors: [],
        warnings: ['Some warning'],
      });

      const wf = makeTwoNodeWorkflow();
      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings.length).toBeGreaterThan(0);
      // Valid is based solely on errors
      expect(result.valid).toBe(true);
    });
  });

  // =====================================================================
  // 11. Top-level error handling
  // =====================================================================

  describe('top-level error handling', () => {
    it('should catch unexpected errors and add them to the result', async () => {
      // Create a workflow that will cause an error in validateWorkflowStructure
      // by providing a workflow where nodes.filter throws
      const wf = makeWorkflow({
        nodes: [makeNode()],
        connections: {},
      });

      // Make the nodeValidator throw to simulate an unexpected error
      validator.validateWithMode.mockImplementation(() => {
        throw new Error('Unexpected internal error');
      });

      const result = await wfValidator.validateWorkflow(wf);

      // The error should be caught and added to results
      // (either as a per-node error or a top-level one)
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =====================================================================
  // 12. AI tool connection validation
  // =====================================================================

  describe('AI tool connection validation', () => {
    it('should warn about community node used as AI tool', async () => {
      // Set up repo to return a community node (non n8n-nodes-base package)
      repo.getNode.mockImplementation((type: string) => {
        if (type === 'n8n-nodes-base.code' || type === 'nodes-base.code') {
          return {
            nodeType: type,
            displayName: 'Code',
            description: '',
            category: 'core',
            developmentStyle: 'declarative',
            package: 'n8n-nodes-community-somepkg',
            isAITool: false,
            isTrigger: false,
            isWebhook: false,
            isVersioned: false,
            version: '1',
            properties: [],
            operations: [],
            credentials: [],
            hasDocumentation: false,
          };
        }
        return {
          nodeType: type,
          displayName: 'Node',
          description: '',
          category: 'core',
          developmentStyle: 'declarative',
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
        };
      });

      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'agent', name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent' }),
          makeNode({ id: 'tool', name: 'Community Tool', type: 'n8n-nodes-base.code' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Agent', type: 'main', index: 0 }]],
          },
          Agent: {
            ai_tool: [[{ node: 'Community Tool', type: 'main', index: 0 }]],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Community node'),
          }),
        ])
      );
    });
  });

  // =====================================================================
  // 13. Connection structure: multi-output and edge cases
  // =====================================================================

  describe('connection edge cases', () => {
    it('should handle null entries in output connections array gracefully', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Set' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [null as any, [{ node: 'Set', type: 'main', index: 0 }]],
          },
        },
      });

      // Should not throw
      const result = await wfValidator.validateWorkflow(wf);
      expect(result.statistics.validConnections).toBe(1);
    });

    it('should handle multiple output indices', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Node A' }),
          makeNode({ id: 'n3', name: 'Node B' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [{ node: 'Node A', type: 'main', index: 0 }],
              [{ node: 'Node B', type: 'main', index: 0 }],
            ],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);
      expect(result.statistics.validConnections).toBe(2);
    });

    it('should handle multiple connections from a single output', async () => {
      const wf = makeWorkflow({
        nodes: [
          makeTriggerNode(),
          makeNode({ id: 'n2', name: 'Node A' }),
          makeNode({ id: 'n3', name: 'Node B' }),
        ],
        connections: {
          'Manual Trigger': {
            main: [
              [
                { node: 'Node A', type: 'main', index: 0 },
                { node: 'Node B', type: 'main', index: 0 },
              ],
            ],
          },
        },
      });

      const result = await wfValidator.validateWorkflow(wf);
      expect(result.statistics.validConnections).toBe(2);
    });
  });
});
