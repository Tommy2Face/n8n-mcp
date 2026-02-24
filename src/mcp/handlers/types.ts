import { DatabaseAdapter } from '../../database/database-adapter';
import { NodeRepository } from '../../database/node-repository';
import { TemplateService } from '../../templates/template-service';
import { SimpleCache } from '../../utils/simple-cache';

export interface HandlerContext {
  db: DatabaseAdapter;
  repository: NodeRepository;
  templateService: TemplateService;
  cache: SimpleCache;
}

/** Raw database row shape before JSON deserialization */
export interface NodeRow {
  node_type: string;
  package_name: string;
  display_name: string;
  description?: string;
  category?: string;
  development_style?: string;
  is_ai_tool: number;
  is_trigger: number;
  is_webhook: number;
  is_versioned: number;
  version?: string;
  documentation?: string;
  properties_schema?: string;
  operations?: string;
  credentials_required?: string;
}

export type ToolHandler = (ctx: HandlerContext, args: Record<string, unknown>) => Promise<unknown>;
