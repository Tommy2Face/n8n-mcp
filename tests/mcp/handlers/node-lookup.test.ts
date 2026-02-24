import { findNode } from '../../../src/mcp/handlers/node-lookup';

/**
 * Tests for the node-lookup helper.
 *
 * findNode(repository, nodeType) tries several name alternatives:
 *  1. Direct match via repository.getNode(nodeType)
 *  2. Without 'n8n-nodes-base.' prefix
 *  3. With 'n8n-nodes-base.' prefix added
 *  4. Lowercase variant
 *  If nothing matches it throws Error('Node ${nodeType} not found')
 */

// --- helpers -----------------------------------------------------------

function createMockRepository(nodes: Record<string, any>) {
  return {
    getNode: jest.fn((nodeType: string) => nodes[nodeType] ?? null),
  } as any;
}

const sampleNode = {
  nodeType: 'n8n-nodes-base.httpRequest',
  displayName: 'HTTP Request',
  description: 'Makes HTTP requests',
  category: 'Data',
  package: 'n8n-nodes-base',
  isAITool: false,
  isTrigger: false,
  isWebhook: false,
  isVersioned: false,
  version: '1',
  properties: [],
  operations: [],
  credentials: [],
};

// --- tests -------------------------------------------------------------

describe('findNode', () => {
  it('returns the node on direct match', () => {
    const repo = createMockRepository({
      'n8n-nodes-base.httpRequest': sampleNode,
    });

    const result = findNode(repo, 'n8n-nodes-base.httpRequest');

    expect(result).toBe(sampleNode);
    // First call is the direct lookup; should short-circuit
    expect(repo.getNode).toHaveBeenCalledWith('n8n-nodes-base.httpRequest');
  });

  it('finds node after stripping n8n-nodes-base. prefix', () => {
    // The node is stored under the short key "httpRequest"
    const repo = createMockRepository({
      httpRequest: sampleNode,
    });

    const result = findNode(repo, 'n8n-nodes-base.httpRequest');

    expect(result).toBe(sampleNode);
    // Should have tried the stripped alternative
    expect(repo.getNode).toHaveBeenCalledWith('httpRequest');
  });

  it('finds node after adding n8n-nodes-base. prefix', () => {
    const repo = createMockRepository({
      'n8n-nodes-base.httpRequest': sampleNode,
    });

    // Caller passes the short name
    const result = findNode(repo, 'httpRequest');

    expect(result).toBe(sampleNode);
    expect(repo.getNode).toHaveBeenCalledWith('n8n-nodes-base.httpRequest');
  });

  it('finds node via lowercase fallback', () => {
    const repo = createMockRepository({
      'n8n-nodes-base.httprequest': { ...sampleNode, nodeType: 'n8n-nodes-base.httprequest' },
    });

    const result = findNode(repo, 'n8n-nodes-base.httpRequest');

    expect(result.nodeType).toBe('n8n-nodes-base.httprequest');
    expect(repo.getNode).toHaveBeenCalledWith('n8n-nodes-base.httprequest');
  });

  it('throws when no alternative matches', () => {
    const repo = createMockRepository({});

    expect(() => findNode(repo, 'nonExistentNode')).toThrow(
      'Node nonExistentNode not found'
    );
  });

  it('tries alternatives in order and stops at first match', () => {
    // Only the lowercase alternative exists
    const repo = createMockRepository({
      mynode: { nodeType: 'mynode' },
    });

    const result = findNode(repo, 'MyNode');

    expect(result.nodeType).toBe('mynode');
    // Verify getNode was called with the lowercase variant
    expect(repo.getNode).toHaveBeenCalledWith('mynode');
  });

  it('handles empty string nodeType gracefully by throwing', () => {
    const repo = createMockRepository({});

    expect(() => findNode(repo, '')).toThrow('Node  not found');
  });

  it('does not mutate the repository', () => {
    const nodes = { 'n8n-nodes-base.slack': sampleNode };
    const repo = createMockRepository(nodes);

    findNode(repo, 'n8n-nodes-base.slack');

    // The mock's getNode should only have been called, never set anything
    expect(repo.getNode).toHaveBeenCalled();
    expect(Object.keys(nodes)).toEqual(['n8n-nodes-base.slack']);
  });

  it('returns direct match even when alternatives also exist', () => {
    const directNode = { ...sampleNode, nodeType: 'slack' };
    const prefixedNode = { ...sampleNode, nodeType: 'n8n-nodes-base.slack' };

    const repo = createMockRepository({
      slack: directNode,
      'n8n-nodes-base.slack': prefixedNode,
    });

    // Direct match should win
    const result = findNode(repo, 'slack');
    expect(result).toBe(directNode);
  });
});
