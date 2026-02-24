import { HandlerContext } from './types';
import { findNode } from './node-lookup';
import { PropertyFilter } from '../../services/property-filter';
import { ExampleGenerator } from '../../services/example-generator';
import { TaskTemplates } from '../../services/task-templates';
import { EnhancedConfigValidator, ValidationMode, ValidationProfile } from '../../services/enhanced-config-validator';
import { PropertyDependencies } from '../../services/property-dependencies';
import { CACHE_TTL_SECONDS } from '../../config/constants';

export async function getNodeEssentials(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType } = args;

  const cacheKey = `essentials:${nodeType}`;
  const cached = ctx.cache.get(cacheKey);
  if (cached) return cached;

  const node = findNode(ctx.repository, nodeType);
  const allProperties = node.properties || [];
  const essentials = PropertyFilter.getEssentials(allProperties, node.nodeType);
  const examples = ExampleGenerator.getExamples(node.nodeType, essentials);
  const operations = node.operations || [];

  const result = {
    nodeType: node.nodeType,
    displayName: node.displayName,
    description: node.description,
    category: node.category,
    version: node.version || '1',
    isVersioned: node.isVersioned || false,
    requiredProperties: essentials.required,
    commonProperties: essentials.common,
    operations: operations.map((op: any) => ({
      name: op.name || op.operation,
      description: op.description,
      action: op.action,
      resource: op.resource
    })),
    examples,
    metadata: {
      totalProperties: allProperties.length,
      isAITool: node.isAITool,
      isTrigger: node.isTrigger,
      isWebhook: node.isWebhook,
      hasCredentials: node.credentials ? true : false,
      package: node.package,
      developmentStyle: node.developmentStyle || 'programmatic'
    }
  };

  ctx.cache.set(cacheKey, result, CACHE_TTL_SECONDS);
  return result;
}

export async function searchNodeProperties(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType, query, maxResults = 20 } = args;
  const node = findNode(ctx.repository, nodeType);
  const allProperties = node.properties || [];
  const matches = PropertyFilter.searchProperties(allProperties, query, maxResults);

  return {
    nodeType: node.nodeType,
    query,
    matches: matches.map((match: any) => ({
      name: match.name,
      displayName: match.displayName,
      type: match.type,
      description: match.description,
      path: match.path || match.name,
      required: match.required,
      default: match.default,
      options: match.options,
      showWhen: match.showWhen
    })),
    totalMatches: matches.length,
    searchedIn: allProperties.length + ' properties'
  };
}

export async function getNodeForTask(_ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { task } = args;
  const template = TaskTemplates.getTaskTemplate(task);

  if (!template) {
    const similar = TaskTemplates.searchTasks(task);
    throw new Error(
      `Unknown task: ${task}. ` +
      (similar.length > 0
        ? `Did you mean: ${similar.slice(0, 3).join(', ')}?`
        : `Use 'list_tasks' to see available tasks.`)
    );
  }

  return {
    task: template.task,
    description: template.description,
    nodeType: template.nodeType,
    configuration: template.configuration,
    userMustProvide: template.userMustProvide,
    optionalEnhancements: template.optionalEnhancements || [],
    notes: template.notes || [],
    example: {
      node: {
        type: template.nodeType,
        parameters: template.configuration
      },
      userInputsNeeded: template.userMustProvide.map((p: any) => ({
        property: p.property,
        currentValue: getPropertyValue(template.configuration, p.property),
        description: p.description,
        example: p.example
      }))
    }
  };
}

export async function listTasks(_ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { category } = args;

  if (category) {
    const categories = TaskTemplates.getTaskCategories();
    const tasks = categories[category];

    if (!tasks) {
      throw new Error(
        `Unknown category: ${category}. Available categories: ${Object.keys(categories).join(', ')}`
      );
    }

    return {
      category,
      tasks: tasks.map((task: string) => {
        const template = TaskTemplates.getTaskTemplate(task);
        return {
          task,
          description: template?.description || '',
          nodeType: template?.nodeType || ''
        };
      })
    };
  }

  const categories = TaskTemplates.getTaskCategories();
  const result: any = {
    totalTasks: TaskTemplates.getAllTasks().length,
    categories: {}
  };

  for (const [cat, tasks] of Object.entries(categories)) {
    result.categories[cat] = (tasks as string[]).map((task: string) => {
      const template = TaskTemplates.getTaskTemplate(task);
      return {
        task,
        description: template?.description || '',
        nodeType: template?.nodeType || ''
      };
    });
  }

  return result;
}

export async function validateNodeConfig(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType, config, profile = 'ai-friendly' } = args;
  const mode: ValidationMode = args.mode || 'operation';
  const node = findNode(ctx.repository, nodeType);
  const properties = node.properties || [];

  const validationResult = EnhancedConfigValidator.validateWithMode(
    node.nodeType,
    config,
    properties,
    mode,
    profile as ValidationProfile
  );

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    ...validationResult,
    summary: {
      hasErrors: !validationResult.valid,
      errorCount: validationResult.errors.length,
      warningCount: validationResult.warnings.length,
      suggestionCount: validationResult.suggestions.length
    }
  };
}

export async function validateNodeMinimal(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType, config } = args;
  const node = findNode(ctx.repository, nodeType);
  const properties = node.properties || [];
  const missingFields: string[] = [];

  for (const prop of properties) {
    if (!prop.required) continue;

    if (prop.displayOptions) {
      let isVisible = true;

      if (prop.displayOptions.show) {
        for (const [key, values] of Object.entries(prop.displayOptions.show)) {
          const configValue = config[key];
          const expectedValues = Array.isArray(values) ? values : [values];
          if (!expectedValues.includes(configValue)) {
            isVisible = false;
            break;
          }
        }
      }

      if (isVisible && prop.displayOptions.hide) {
        for (const [key, values] of Object.entries(prop.displayOptions.hide)) {
          const configValue = config[key];
          const expectedValues = Array.isArray(values) ? values : [values];
          if (expectedValues.includes(configValue)) {
            isVisible = false;
            break;
          }
        }
      }

      if (!isVisible) continue;
    }

    if (!(prop.name in config)) {
      missingFields.push(prop.displayName || prop.name);
    }
  }

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    valid: missingFields.length === 0,
    missingRequiredFields: missingFields
  };
}

export async function getPropertyDependencies(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType, config } = args;
  const node = findNode(ctx.repository, nodeType);
  const properties = node.properties || [];
  const analysis = PropertyDependencies.analyze(properties);

  let visibilityImpact = null;
  if (config) {
    visibilityImpact = PropertyDependencies.getVisibilityImpact(properties, config);
  }

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    ...analysis,
    currentConfig: config ? {
      providedValues: config,
      visibilityImpact
    } : undefined
  };
}

// Helper

function getPropertyValue(config: any, path: string): any {
  const parts = path.split('.');
  let value = config;

  for (const part of parts) {
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      value = value?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      value = value?.[part];
    }
  }

  return value;
}
