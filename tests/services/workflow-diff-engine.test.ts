import { WorkflowDiffEngine } from '../../src/services/workflow-diff-engine';
import { Workflow } from '../../src/types/n8n-api';
import { WorkflowDiffRequest, WorkflowDiffOperation } from '../../src/types/workflow-diff';

// Mock Logger to suppress console output during tests
jest.mock('../../src/utils/logger', () => {
  return {
    Logger: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Mock uuid to return deterministic IDs
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock n8n-validation (imported by the engine but not central to diff logic)
jest.mock('../../src/services/n8n-validation', () => ({
  validateWorkflowNode: jest.fn(),
  validateWorkflowConnections: jest.fn(),
}));

describe('WorkflowDiffEngine', () => {
  let engine: WorkflowDiffEngine;

  /**
   * Helper: create a minimal valid workflow for testing.
   */
  function createBaseWorkflow(overrides?: Partial<Workflow>): Workflow {
    return {
      id: 'wf-1',
      name: 'Test Workflow',
      nodes: [
        {
          id: 'node-1',
          name: 'Start',
          type: 'n8n-nodes-base.start',
          typeVersion: 1,
          position: [100, 200],
          parameters: {},
        },
        {
          id: 'node-2',
          name: 'HTTP Request',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [300, 200],
          parameters: { url: 'https://example.com' },
        },
      ],
      connections: {
        Start: {
          main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
        },
      },
      settings: {},
      tags: ['production'],
      ...overrides,
    };
  }

  beforeEach(() => {
    engine = new WorkflowDiffEngine();
  });

  // ─────────────────────────────────────────────────────────
  // 1. Add Node Operations
  // ─────────────────────────────────────────────────────────
  describe('addNode operations', () => {
    it('should add a node with all required fields', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();
      expect(result.workflow.nodes).toHaveLength(3);

      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode).toBeDefined();
      expect(addedNode.type).toBe('n8n-nodes-base.slack');
      expect(addedNode.position).toEqual([500, 200]);
    });

    it('should assign a UUID when no id is provided', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode.id).toBe('mock-uuid-1234');
    });

    it('should use provided id when given', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              id: 'my-custom-id',
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode.id).toBe('my-custom-id');
    });

    it('should default typeVersion to 1 when not provided', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode.typeVersion).toBe(1);
    });

    it('should default parameters to empty object when not provided', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode.parameters).toEqual({});
    });

    it('should preserve optional fields like credentials, notes, disabled', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
              parameters: { channel: '#general' },
              credentials: { slackApi: 'cred-1' },
              notes: 'Send notification',
              notesInFlow: true,
              disabled: false,
              continueOnFail: true,
              retryOnFail: true,
              maxTries: 3,
              waitBetweenTries: 1000,
              alwaysOutputData: true,
              executeOnce: false,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const addedNode = result.workflow.nodes.find((n: any) => n.name === 'Slack');
      expect(addedNode.credentials).toEqual({ slackApi: 'cred-1' });
      expect(addedNode.notes).toBe('Send notification');
      expect(addedNode.notesInFlow).toBe(true);
      expect(addedNode.continueOnFail).toBe(true);
      expect(addedNode.retryOnFail).toBe(true);
      expect(addedNode.maxTries).toBe(3);
      expect(addedNode.waitBetweenTries).toBe(1000);
      expect(addedNode.alwaysOutputData).toBe(true);
      expect(addedNode.executeOnce).toBe(false);
    });

    it('should fail when adding a node with a duplicate name', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Start',
              type: 'n8n-nodes-base.start',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Node with name "Start" already exists');
    });

    it('should fail when node type has no package prefix (no dot)', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Invalid node type "slack"');
      expect(result.errors![0].message).toContain('Must include package prefix');
    });

    it('should fail when node type uses short prefix nodes-base. instead of n8n-nodes-base.', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Use "n8n-nodes-base.slack" instead');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. Remove Node Operations
  // ─────────────────────────────────────────────────────────
  describe('removeNode operations', () => {
    it('should remove a node by name', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(1);
      expect(result.workflow.nodes[0].name).toBe('Start');
    });

    it('should remove a node by ID', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeId: 'node-2',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(1);
      expect(result.workflow.nodes.find((n: any) => n.id === 'node-2')).toBeUndefined();
    });

    it('should clean up outgoing connections from the removed node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'Start',
          },
        ],
      });

      expect(result.success).toBe(true);
      // The "Start" key should be removed from connections
      expect(result.workflow.connections['Start']).toBeUndefined();
    });

    it('should clean up incoming connections to the removed node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      // Start's connection to HTTP Request should be cleaned up
      // Since Start only connected to HTTP Request, Start connections should be gone
      expect(result.workflow.connections['Start']).toBeUndefined();
    });

    it('should fail when removing a non-existent node by name', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'NonExistent',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: NonExistent');
    });

    it('should fail when removing a non-existent node by ID', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeId: 'non-existent-id',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: non-existent-id');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. Update Node Operations
  // ─────────────────────────────────────────────────────────
  describe('updateNode operations', () => {
    it('should update a simple top-level property using dot notation', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeName: 'HTTP Request',
            changes: {
              'parameters.url': 'https://new-url.com',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(node.parameters.url).toBe('https://new-url.com');
    });

    it('should create nested properties that do not yet exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeName: 'HTTP Request',
            changes: {
              'parameters.options.timeout': 5000,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(node.parameters.options.timeout).toBe(5000);
    });

    it('should update multiple properties at once', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeName: 'HTTP Request',
            changes: {
              'parameters.url': 'https://api.example.com',
              'parameters.method': 'POST',
              notes: 'Updated node',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(node.parameters.url).toBe('https://api.example.com');
      expect(node.parameters.method).toBe('POST');
      expect(node.notes).toBe('Updated node');
    });

    it('should update a node found by ID', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeId: 'node-2',
            changes: {
              'parameters.url': 'https://by-id.com',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.id === 'node-2');
      expect(node.parameters.url).toBe('https://by-id.com');
    });

    it('should fail when updating a non-existent node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeName: 'DoesNotExist',
            changes: { 'parameters.url': 'test' },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: DoesNotExist');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. Move / Enable / Disable Node Operations
  // ─────────────────────────────────────────────────────────
  describe('moveNode operations', () => {
    it('should update the position of an existing node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'moveNode',
            nodeName: 'Start',
            position: [400, 500],
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'Start');
      expect(node.position).toEqual([400, 500]);
    });

    it('should fail when moving a non-existent node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'moveNode',
            nodeName: 'Ghost',
            position: [0, 0],
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: Ghost');
    });
  });

  describe('enableNode operations', () => {
    it('should set disabled to false on a disabled node', async () => {
      const workflow = createBaseWorkflow({
        nodes: [
          {
            id: 'node-1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [100, 200],
            parameters: {},
            disabled: true,
          },
        ],
      });

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'enableNode',
            nodeName: 'Start',
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'Start');
      expect(node.disabled).toBe(false);
    });

    it('should fail when enabling a non-existent node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'enableNode',
            nodeName: 'Missing',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: Missing');
    });
  });

  describe('disableNode operations', () => {
    it('should set disabled to true on a node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'disableNode',
            nodeName: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(node.disabled).toBe(true);
    });

    it('should fail when disabling a non-existent node', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'disableNode',
            nodeId: 'no-such-id',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found: no-such-id');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 5. Connection Operations
  // ─────────────────────────────────────────────────────────
  describe('addConnection operations', () => {
    it('should add a connection between two existing nodes', async () => {
      const workflow = createBaseWorkflow({
        nodes: [
          {
            id: 'node-1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [100, 200],
            parameters: {},
          },
          {
            id: 'node-2',
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            typeVersion: 1,
            position: [300, 200],
            parameters: {},
          },
        ],
        connections: {},
      });

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'Slack',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.connections['Start']).toBeDefined();
      expect(result.workflow.connections['Start']['main'][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: 'Slack', type: 'main', index: 0 }),
        ])
      );
    });

    it('should use default sourceOutput "main" and targetInput "main"', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      const conn = result.workflow.connections['Start']['main'][0][0];
      expect(conn.type).toBe('main');
      expect(conn.index).toBe(0);
    });

    it('should support custom sourceOutput and targetInput', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'HTTP Request',
            sourceOutput: 'secondary',
            targetInput: 'data',
            targetIndex: 1,
          },
        ],
      });

      expect(result.success).toBe(true);
      const conn = result.workflow.connections['Start']['secondary'][0][0];
      expect(conn.type).toBe('data');
      expect(conn.index).toBe(1);
    });

    it('should fail when source node does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'NonExistent',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Source node not found: NonExistent');
    });

    it('should fail when target node does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'NonExistent',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Target node not found: NonExistent');
    });

    it('should fail when the connection already exists', async () => {
      const workflow = createBaseWorkflow();
      // The base workflow already has Start -> HTTP Request
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Connection already exists');
    });
  });

  describe('removeConnection operations', () => {
    it('should remove an existing connection', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeConnection',
            source: 'Start',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      // After removing the only connection from Start, the key should be cleaned up
      expect(result.workflow.connections['Start']).toBeUndefined();
    });

    it('should fail when source node does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeConnection',
            source: 'Ghost',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Source node not found: Ghost');
    });

    it('should fail when target node does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeConnection',
            source: 'Start',
            target: 'Ghost',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Target node not found: Ghost');
    });

    it('should fail when no connections exist from source node', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeConnection',
            source: 'Start',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('No connections found from "Start"');
    });

    it('should fail when the specific connection does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeConnection',
            source: 'Start',
            target: 'HTTP Request',
            sourceOutput: 'secondary',
          },
        ],
      });

      expect(result.success).toBe(false);
      // The source output "secondary" does not exist
      expect(result.errors![0].message).toContain('No connections found from "Start"');
    });
  });

  describe('updateConnection operations', () => {
    it('should update an existing connection (remove + add)', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateConnection',
            source: 'Start',
            target: 'HTTP Request',
            changes: {
              sourceOutput: 'main',
              targetInput: 'data',
              sourceIndex: 0,
              targetIndex: 1,
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      // The connection should now use the updated targetInput and targetIndex
      const conn = result.workflow.connections['Start']['main'][0][0];
      expect(conn.type).toBe('data');
      expect(conn.index).toBe(1);
    });

    it('should fail when source node does not exist', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateConnection',
            source: 'Ghost',
            target: 'HTTP Request',
            changes: { sourceOutput: 'main' },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Source node not found: Ghost');
    });

    it('should fail when no connection exists between source and target', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateConnection',
            source: 'Start',
            target: 'HTTP Request',
            changes: { sourceOutput: 'main' },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('No connections found from "Start"');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 6. Metadata Operations
  // ─────────────────────────────────────────────────────────
  describe('updateSettings operations', () => {
    it('should merge new settings into existing settings', async () => {
      const workflow = createBaseWorkflow({ settings: { timezone: 'UTC' } });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateSettings',
            settings: { executionTimeout: 300 },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.settings.timezone).toBe('UTC');
      expect(result.workflow.settings.executionTimeout).toBe(300);
    });

    it('should create settings object if it does not exist', async () => {
      const workflow = createBaseWorkflow();
      delete workflow.settings;

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateSettings',
            settings: { saveManualExecutions: true },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.settings).toBeDefined();
      expect(result.workflow.settings.saveManualExecutions).toBe(true);
    });

    it('should overwrite existing setting values', async () => {
      const workflow = createBaseWorkflow({ settings: { timezone: 'UTC' } });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateSettings',
            settings: { timezone: 'Europe/Amsterdam' },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.settings.timezone).toBe('Europe/Amsterdam');
    });
  });

  describe('updateName operations', () => {
    it('should update the workflow name', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateName',
            name: 'My Updated Workflow',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.name).toBe('My Updated Workflow');
    });
  });

  describe('addTag operations', () => {
    it('should add a new tag to existing tags', async () => {
      const workflow = createBaseWorkflow({ tags: ['existing'] });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addTag',
            tag: 'new-tag',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.tags).toContain('existing');
      expect(result.workflow.tags).toContain('new-tag');
    });

    it('should create tags array if it does not exist', async () => {
      const workflow = createBaseWorkflow();
      delete (workflow as any).tags;

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addTag',
            tag: 'first-tag',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.tags).toEqual(['first-tag']);
    });

    it('should not add a duplicate tag', async () => {
      const workflow = createBaseWorkflow({ tags: ['production'] });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addTag',
            tag: 'production',
          },
        ],
      });

      expect(result.success).toBe(true);
      const tagCount = result.workflow.tags.filter((t: string) => t === 'production').length;
      expect(tagCount).toBe(1);
    });
  });

  describe('removeTag operations', () => {
    it('should remove an existing tag', async () => {
      const workflow = createBaseWorkflow({ tags: ['production', 'staging'] });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeTag',
            tag: 'production',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.tags).toEqual(['staging']);
    });

    it('should handle removing a tag that does not exist gracefully', async () => {
      const workflow = createBaseWorkflow({ tags: ['production'] });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeTag',
            tag: 'non-existent',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.tags).toEqual(['production']);
    });

    it('should handle removing a tag when tags array is undefined', async () => {
      const workflow = createBaseWorkflow();
      delete (workflow as any).tags;

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeTag',
            tag: 'anything',
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 7. Error Handling
  // ─────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('should return error for unknown operation type', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'unknownOp' as any,
          } as any,
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Unknown operation type: unknownOp');
    });

    it('should include the operation index in error details', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'NonExistent',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].operation).toBe(0);
    });

    it('should include operation details in the error when validation fails', async () => {
      const workflow = createBaseWorkflow();
      const operation = {
        type: 'removeNode' as const,
        nodeName: 'NonExistent',
      };
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [operation],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].details).toEqual(operation);
    });

    it('should stop on first validation error and not apply subsequent operations', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'NonExistent',
          },
          {
            type: 'updateName',
            name: 'Should Not Be Applied',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.workflow).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 8. Transactional Behavior
  // ─────────────────────────────────────────────────────────
  describe('transactional behavior', () => {
    it('should not modify the original workflow object', async () => {
      const workflow = createBaseWorkflow();
      const originalNodesCount = workflow.nodes.length;
      const originalName = workflow.name;

      await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'New Node',
              type: 'n8n-nodes-base.set',
              position: [500, 200],
            },
          },
          {
            type: 'updateName',
            name: 'Changed Name',
          },
        ],
      });

      // Original workflow should be untouched
      expect(workflow.nodes.length).toBe(originalNodesCount);
      expect(workflow.name).toBe(originalName);
    });

    it('should process node operations before connection operations (two-pass)', async () => {
      const workflow = createBaseWorkflow({ connections: {} });

      // Submit addConnection first in the array, addNode second.
      // The engine should process addNode first (pass 1) before addConnection (pass 2).
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'Slack',
          },
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
        ],
      });

      // The node should be added first, then the connection should succeed
      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(3);
      expect(result.workflow.connections['Start']['main'][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: 'Slack' }),
        ])
      );
    });

    it('should process metadata operations after node operations', async () => {
      const workflow = createBaseWorkflow();

      // Mix metadata and node operations
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateName',
            name: 'Updated Workflow',
          },
          {
            type: 'addNode',
            node: {
              name: 'Code',
              type: 'n8n-nodes-base.code',
              position: [500, 200],
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.name).toBe('Updated Workflow');
      expect(result.workflow.nodes).toHaveLength(3);
    });

    it('should report correct operation index from original array on validation error', async () => {
      const workflow = createBaseWorkflow({ connections: {} });

      // Connection operation at index 0 should fail if it references a node
      // that does not exist and there is no addNode to create it
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'NonExistent',
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].operation).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 9. Multiple Operations
  // ─────────────────────────────────────────────────────────
  describe('multiple operations', () => {
    it('should apply multiple node operations in sequence', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
          {
            type: 'addNode',
            node: {
              name: 'Email',
              type: 'n8n-nodes-base.email',
              position: [700, 200],
            },
          },
          {
            type: 'disableNode',
            nodeName: 'Start',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(3);
      expect(result.workflow.nodes).toHaveLength(4);
      const startNode = result.workflow.nodes.find((n: any) => n.name === 'Start');
      expect(startNode.disabled).toBe(true);
    });

    it('should apply a mix of node, connection, and metadata operations', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Slack',
              type: 'n8n-nodes-base.slack',
              position: [500, 200],
            },
          },
          {
            type: 'addConnection',
            source: 'Start',
            target: 'Slack',
          },
          {
            type: 'updateName',
            name: 'Full Pipeline',
          },
          {
            type: 'addTag',
            tag: 'automated',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(4);
      expect(result.workflow.name).toBe('Full Pipeline');
      expect(result.workflow.tags).toContain('automated');
      expect(result.workflow.connections['Start']).toBeDefined();
    });

    it('should include operation counts in success message', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Code',
              type: 'n8n-nodes-base.code',
              position: [500, 200],
            },
          },
          {
            type: 'moveNode',
            nodeName: 'Start',
            position: [0, 0],
          },
          {
            type: 'updateName',
            name: 'Counted Workflow',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 node ops');
      expect(result.message).toContain('1 other ops');
    });
  });

  // ─────────────────────────────────────────────────────────
  // 10. Edge Cases
  // ─────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('should succeed with an empty operations array', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [],
      });

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(0);
    });

    it('should reject more than 5 operations', async () => {
      const workflow = createBaseWorkflow();
      const operations: WorkflowDiffOperation[] = [];
      for (let i = 0; i < 6; i++) {
        operations.push({
          type: 'updateName',
          name: `Name ${i}`,
        });
      }

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].operation).toBe(-1);
      expect(result.errors![0].message).toContain('Too many operations');
      expect(result.errors![0].message).toContain('Maximum 5');
    });

    it('should accept exactly 5 operations', async () => {
      const workflow = createBaseWorkflow();
      const operations: WorkflowDiffOperation[] = [];
      for (let i = 0; i < 5; i++) {
        operations.push({
          type: 'addTag',
          tag: `tag-${i}`,
        });
      }

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations,
      });

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(5);
    });

    it('should support validateOnly mode (no changes applied)', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'ValidateOnly',
              type: 'n8n-nodes-base.code',
              position: [500, 200],
            },
          },
        ],
        validateOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Validation successful');
      expect(result.workflow).toBeUndefined();
    });

    it('should still validate operations in validateOnly mode', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'NonExistent',
          },
        ],
        validateOnly: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('Node not found');
    });

    it('should find a node by name when only nodeId is given but matches a name', async () => {
      // The findNode method falls back to searching by name if ID is not found
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeId: 'HTTP Request', // This is actually a name, not an ID
            changes: {
              'parameters.url': 'https://fallback-test.com',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      const node = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(node.parameters.url).toBe('https://fallback-test.com');
    });

    it('should handle workflow with no existing connections', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'HTTP Request',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.connections['Start']['main'][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: 'HTTP Request' }),
        ])
      );
    });

    it('should handle removing a node that has both incoming and outgoing connections', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          { id: 'n1', name: 'A', type: 'n8n-nodes-base.start', typeVersion: 1, position: [0, 0], parameters: {} },
          { id: 'n2', name: 'B', type: 'n8n-nodes-base.code', typeVersion: 1, position: [200, 0], parameters: {} },
          { id: 'n3', name: 'C', type: 'n8n-nodes-base.slack', typeVersion: 1, position: [400, 0], parameters: {} },
        ],
        connections: {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
        },
      };

      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'B',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(2);
      // B's outgoing connections should be removed
      expect(result.workflow.connections['B']).toBeUndefined();
      // A's connection to B should be cleaned up
      expect(result.workflow.connections['A']).toBeUndefined();
    });

    it('should deep-clone the workflow so nested objects are independent', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'updateNode',
            nodeName: 'HTTP Request',
            changes: {
              'parameters.url': 'https://modified.com',
            },
          },
        ],
      });

      expect(result.success).toBe(true);
      // Original node parameters should be unmodified
      const originalNode = workflow.nodes.find(n => n.name === 'HTTP Request');
      expect(originalNode!.parameters.url).toBe('https://example.com');
      // Result node should have the change
      const modifiedNode = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(modifiedNode.parameters.url).toBe('https://modified.com');
    });

    it('should handle addNode followed by addConnection to newly added node in one request', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'New Target',
              type: 'n8n-nodes-base.set',
              position: [500, 200],
            },
          },
          {
            type: 'addConnection',
            source: 'Start',
            target: 'New Target',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(3);
      expect(result.workflow.connections['Start']['main'][0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: 'New Target' }),
        ])
      );
    });

    it('should handle removeNode followed by addNode with the same name', async () => {
      const workflow = createBaseWorkflow();
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'removeNode',
            nodeName: 'HTTP Request',
          },
          {
            type: 'addNode',
            node: {
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              typeVersion: 2,
              position: [300, 300],
            },
          },
        ],
      });

      // Both are node operations, processed in order in pass 1
      expect(result.success).toBe(true);
      expect(result.workflow.nodes).toHaveLength(2);
      const newNode = result.workflow.nodes.find((n: any) => n.name === 'HTTP Request');
      expect(newNode.typeVersion).toBe(2);
      expect(newNode.position).toEqual([300, 300]);
    });

    it('should handle addConnection with non-zero sourceIndex', async () => {
      const workflow = createBaseWorkflow({ connections: {} });
      const result = await engine.applyDiff(workflow, {
        id: 'wf-1',
        operations: [
          {
            type: 'addConnection',
            source: 'Start',
            target: 'HTTP Request',
            sourceIndex: 2,
          },
        ],
      });

      expect(result.success).toBe(true);
      // Should have created intermediate empty arrays up to index 2
      const mainConns = result.workflow.connections['Start']['main'];
      expect(mainConns.length).toBeGreaterThanOrEqual(3);
      expect(mainConns[2]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: 'HTTP Request' }),
        ])
      );
    });
  });
});
