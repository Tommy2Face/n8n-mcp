import { NodeRepository } from '../../database/node-repository';

/**
 * Find a node by type, trying alternative name formats.
 * Deduplicates the ~8 copies of this logic from server-update.ts.
 */
export function findNode(repository: NodeRepository, nodeType: string): any {
  let node = repository.getNode(nodeType);
  if (node) return node;

  const alternatives = [
    nodeType,
    nodeType.replace('n8n-nodes-base.', ''),
    `n8n-nodes-base.${nodeType}`,
    nodeType.toLowerCase()
  ];

  for (const alt of alternatives) {
    const found = repository.getNode(alt);
    if (found) {
      return found;
    }
  }

  throw new Error(`Node ${nodeType} not found`);
}
