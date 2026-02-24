import { DatabaseAdapter } from './database-adapter';
import { ParsedNode } from '../parsers/node-parser';
import { NodeRecord, AIToolRecord } from '../types/n8n';

export class NodeRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Save node with proper JSON serialization
   */
  saveNode(node: ParsedNode): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        node_type, package_name, display_name, description,
        category, development_style, is_ai_tool, is_trigger,
        is_webhook, is_versioned, version, documentation,
        properties_schema, operations, credentials_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      node.nodeType,
      node.packageName,
      node.displayName,
      node.description,
      node.category,
      node.style,
      node.isAITool ? 1 : 0,
      node.isTrigger ? 1 : 0,
      node.isWebhook ? 1 : 0,
      node.isVersioned ? 1 : 0,
      node.version,
      node.documentation || null,
      JSON.stringify(node.properties, null, 2),
      JSON.stringify(node.operations, null, 2),
      JSON.stringify(node.credentials, null, 2)
    );
  }
  
  /**
   * Get node with proper JSON deserialization
   */
  getNode(nodeType: string): NodeRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM nodes WHERE node_type = ?
    `).get(nodeType) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      nodeType: row.node_type as string,
      displayName: row.display_name as string,
      description: row.description as string,
      category: row.category as string,
      developmentStyle: row.development_style as string,
      package: row.package_name as string,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version as string,
      properties: this.safeJsonParse(row.properties_schema as string, []),
      operations: this.safeJsonParse(row.operations as string, []),
      credentials: this.safeJsonParse(row.credentials_required as string, []),
      hasDocumentation: !!row.documentation
    };
  }

  /**
   * Get AI tools with proper filtering
   */
  getAITools(): AIToolRecord[] {
    const rows = this.db.prepare(`
      SELECT node_type, display_name, description, package_name
      FROM nodes
      WHERE is_ai_tool = 1
      ORDER BY display_name
    `).all() as Array<Record<string, unknown>>;

    return rows.map(row => ({
      nodeType: row.node_type as string,
      displayName: row.display_name as string,
      description: row.description as string,
      package: row.package_name as string
    }));
  }

  private safeJsonParse<T>(json: string, defaultValue: T): T {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }
}