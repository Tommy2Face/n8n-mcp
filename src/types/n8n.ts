/**
 * Shared type definitions for n8n node structures.
 * Used across parsers, services, and handlers.
 */

/** Display condition for showing/hiding properties based on other property values */
export interface N8nDisplayOptions {
  show?: Record<string, unknown[]>;
  hide?: Record<string, unknown[]>;
}

/** An option in a select/multiselect property */
export interface N8nPropertyOption {
  value: string;
  name: string;
  description?: string;
  action?: string;
}

/** A fixed collection option group */
export interface N8nFixedCollectionOption {
  name: string;
  displayName: string;
  values?: N8nProperty[];
}

/** An n8n node property definition */
export interface N8nProperty {
  name: string;
  displayName: string;
  type: string;
  default?: unknown;
  description?: string;
  options?: N8nPropertyOption[] | N8nProperty[];
  required?: boolean;
  displayOptions?: N8nDisplayOptions;
  typeOptions?: Record<string, unknown>;
  noDataExpression?: boolean;
  placeholder?: string;
  hint?: string;
}

/** An n8n node operation (resource/operation pair or simple operation) */
export interface N8nOperation {
  resource?: string;
  operation: string;
  name: string;
  description?: string;
  action?: string;
}

/** An n8n credential requirement */
export interface N8nCredential {
  name: string;
  required?: boolean;
  displayOptions?: N8nDisplayOptions;
}

/** The description object from an n8n node class */
export interface N8nNodeDescription {
  name: string;
  displayName: string;
  description?: string;
  group?: string[];
  categories?: string[];
  category?: string;
  properties?: N8nProperty[];
  credentials?: N8nCredential[];
  usableAsTool?: boolean;
  routing?: Record<string, unknown>;
  polling?: boolean;
  trigger?: boolean;
  eventTrigger?: boolean;
  webhooks?: unknown[];
  webhook?: boolean;
  version?: number | string | number[];
  actions?: Array<{ usableAsTool?: boolean }>;
}

/** A resolved node record from the repository (after JSON deserialization) */
export interface NodeRecord {
  nodeType: string;
  displayName: string;
  description: string;
  category: string;
  developmentStyle: string;
  package: string;
  isAITool: boolean;
  isTrigger: boolean;
  isWebhook: boolean;
  isVersioned: boolean;
  version: string;
  properties: N8nProperty[];
  operations: N8nOperation[];
  credentials: N8nCredential[];
  hasDocumentation: boolean;
}

/** Summary record from getAITools() */
export interface AIToolRecord {
  nodeType: string;
  displayName: string;
  description: string;
  package: string;
}

/** SQL parameter types accepted by the database */
export type SqlBindValue = string | number | bigint | Buffer | null | undefined;
