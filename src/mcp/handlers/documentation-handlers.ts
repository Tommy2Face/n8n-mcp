import { HandlerContext, NodeRow } from './types';
import { findNode } from './node-lookup';
import { logger } from '../../utils/logger';

export async function listNodes(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const filters = args;
  let query = 'SELECT * FROM nodes WHERE 1=1';
  const params: any[] = [];

  logger.debug('list_nodes:', { filters, query, params });

  if (filters.package) {
    const packageVariants = [
      filters.package,
      `@n8n/${filters.package}`,
      filters.package.replace('@n8n/', '')
    ];
    query += ' AND package_name IN (' + packageVariants.map(() => '?').join(',') + ')';
    params.push(...packageVariants);
  }

  if (filters.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }

  if (filters.developmentStyle) {
    query += ' AND development_style = ?';
    params.push(filters.developmentStyle);
  }

  if (filters.isAITool !== undefined) {
    query += ' AND is_ai_tool = ?';
    params.push(filters.isAITool ? 1 : 0);
  }

  query += ' ORDER BY display_name';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const nodes = ctx.db.prepare(query).all(...params) as NodeRow[];

  return {
    nodes: nodes.map(node => ({
      nodeType: node.node_type,
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      package: node.package_name,
      developmentStyle: node.development_style,
      isAITool: !!node.is_ai_tool,
      isTrigger: !!node.is_trigger,
      isVersioned: !!node.is_versioned,
    })),
    totalCount: nodes.length,
  };
}

export async function getNodeInfo(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const node = findNode(ctx.repository, args.nodeType);

  const aiToolCapabilities = {
    canBeUsedAsTool: true,
    hasUsableAsToolProperty: node.isAITool,
    requiresEnvironmentVariable: !node.isAITool && node.package !== 'n8n-nodes-base',
    toolConnectionType: 'ai_tool',
    commonToolUseCases: getCommonAIToolUseCases(node.nodeType),
    environmentRequirement: node.package !== 'n8n-nodes-base' ?
      'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true' :
      null
  };

  return {
    ...node,
    aiToolCapabilities
  };
}

export async function searchNodes(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { query, limit = 20 } = args;

  // Handle exact phrase searches with quotes
  if (query.startsWith('"') && query.endsWith('"')) {
    const exactPhrase = query.slice(1, -1);
    const nodes = ctx.db.prepare(`
      SELECT * FROM nodes
      WHERE node_type LIKE ? OR display_name LIKE ? OR description LIKE ?
      ORDER BY display_name
      LIMIT ?
    `).all(`%${exactPhrase}%`, `%${exactPhrase}%`, `%${exactPhrase}%`, limit) as NodeRow[];

    return {
      query,
      results: nodes.map(node => ({
        nodeType: node.node_type,
        displayName: node.display_name,
        description: node.description,
        category: node.category,
        package: node.package_name
      })),
      totalCount: nodes.length
    };
  }

  // Split into words for normal search
  const words = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 0);

  if (words.length === 0) {
    return { query, results: [], totalCount: 0 };
  }

  const conditions = words.map(() =>
    '(node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)'
  ).join(' OR ');

  const params: any[] = words.flatMap((w: string) => [`%${w}%`, `%${w}%`, `%${w}%`]);
  params.push(limit);

  const nodes = ctx.db.prepare(`
    SELECT DISTINCT * FROM nodes
    WHERE ${conditions}
    ORDER BY display_name
    LIMIT ?
  `).all(...params) as NodeRow[];

  return {
    query,
    results: nodes.map(node => ({
      nodeType: node.node_type,
      displayName: node.display_name,
      description: node.description,
      category: node.category,
      package: node.package_name
    })),
    totalCount: nodes.length
  };
}

export async function listAITools(ctx: HandlerContext, _args: Record<string, any>): Promise<any> {
  const tools = ctx.repository.getAITools();

  return {
    tools,
    totalCount: tools.length,
    requirements: {
      environmentVariable: 'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true',
      nodeProperty: 'usableAsTool: true',
    },
    usage: {
      description: 'These nodes have the usableAsTool property set to true, making them optimized for AI agent usage.',
      note: 'ANY node in n8n can be used as an AI tool by connecting it to the ai_tool port of an AI Agent node.',
      examples: [
        'Regular nodes like Slack, Google Sheets, or HTTP Request can be used as tools',
        'Connect any node to an AI Agent\'s tool port to make it available for AI-driven automation',
        'Community nodes require the environment variable to be set'
      ]
    }
  };
}

export async function getNodeDocumentation(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { nodeType } = args;
  const node = ctx.db.prepare(`
    SELECT node_type, display_name, documentation, description
    FROM nodes
    WHERE node_type = ?
  `).get(nodeType) as NodeRow | undefined;

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  if (!node.documentation) {
    const { getNodeEssentials } = await import('./validation-handlers');
    const essentials = await getNodeEssentials(ctx, { nodeType });

    return {
      nodeType: node.node_type,
      displayName: node.display_name,
      documentation: `
# ${node.display_name}

${node.description || 'No description available.'}

## Common Properties

${essentials.commonProperties.map((p: any) =>
  `### ${p.displayName}\n${p.description || `Type: ${p.type}`}`
).join('\n\n')}

## Note
Full documentation is being prepared. For now, use get_node_essentials for configuration help.
`,
      hasDocumentation: false
    };
  }

  return {
    nodeType: node.node_type,
    displayName: node.display_name,
    documentation: node.documentation,
    hasDocumentation: true,
  };
}

export async function getDatabaseStatistics(ctx: HandlerContext, _args: Record<string, any>): Promise<any> {
  const stats = ctx.db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(is_ai_tool) as ai_tools,
      SUM(is_trigger) as triggers,
      SUM(is_versioned) as versioned,
      SUM(CASE WHEN documentation IS NOT NULL THEN 1 ELSE 0 END) as with_docs,
      COUNT(DISTINCT package_name) as packages,
      COUNT(DISTINCT category) as categories
    FROM nodes
  `).get() as any;

  const packages = ctx.db.prepare(`
    SELECT package_name, COUNT(*) as count
    FROM nodes
    GROUP BY package_name
  `).all() as any[];

  return {
    totalNodes: stats.total,
    statistics: {
      aiTools: stats.ai_tools,
      triggers: stats.triggers,
      versionedNodes: stats.versioned,
      nodesWithDocumentation: stats.with_docs,
      documentationCoverage: Math.round((stats.with_docs / stats.total) * 100) + '%',
      uniquePackages: stats.packages,
      uniqueCategories: stats.categories,
    },
    packageBreakdown: packages.map((pkg: any) => ({
      package: pkg.package_name,
      nodeCount: pkg.count,
    })),
  };
}

export async function getNodeAsToolInfo(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const node = findNode(ctx.repository, args.nodeType);

  const commonUseCases = getCommonAIToolUseCases(node.nodeType);

  const aiToolCapabilities = {
    canBeUsedAsTool: true,
    hasUsableAsToolProperty: node.isAITool,
    requiresEnvironmentVariable: !node.isAITool && node.package !== 'n8n-nodes-base',
    connectionType: 'ai_tool',
    commonUseCases,
    requirements: {
      connection: 'Connect to the "ai_tool" port of an AI Agent node',
      environment: node.package !== 'n8n-nodes-base' ?
        'Set N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true for community nodes' :
        'No special environment variables needed for built-in nodes'
    },
    examples: getAIToolExamples(node.nodeType),
    tips: [
      'Give the tool a clear, descriptive name in the AI Agent settings',
      'Write a detailed tool description to help the AI understand when to use it',
      'Test the node independently before connecting it as a tool',
      node.isAITool ?
        'This node is optimized for AI tool usage' :
        'This is a regular node that can be used as an AI tool'
    ]
  };

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    description: node.description,
    package: node.package,
    isMarkedAsAITool: node.isAITool,
    aiToolCapabilities
  };
}

// Helper functions (extracted from server-update.ts)

function getCommonAIToolUseCases(nodeType: string): string[] {
  const useCaseMap: Record<string, string[]> = {
    'nodes-base.slack': [
      'Send notifications about task completion',
      'Post updates to channels',
      'Send direct messages',
      'Create alerts and reminders'
    ],
    'nodes-base.googleSheets': [
      'Read data for analysis',
      'Log results and outputs',
      'Update spreadsheet records',
      'Create reports'
    ],
    'nodes-base.gmail': [
      'Send email notifications',
      'Read and process emails',
      'Send reports and summaries',
      'Handle email-based workflows'
    ],
    'nodes-base.httpRequest': [
      'Call external APIs',
      'Fetch data from web services',
      'Send webhooks',
      'Integrate with any REST API'
    ],
    'nodes-base.postgres': [
      'Query database for information',
      'Store analysis results',
      'Update records based on AI decisions',
      'Generate reports from data'
    ],
    'nodes-base.webhook': [
      'Receive external triggers',
      'Create callback endpoints',
      'Handle incoming data',
      'Integrate with external systems'
    ]
  };

  for (const [key, useCases] of Object.entries(useCaseMap)) {
    if (nodeType.includes(key)) {
      return useCases;
    }
  }

  return [
    'Perform automated actions',
    'Integrate with external services',
    'Process and transform data',
    'Extend AI agent capabilities'
  ];
}

function getAIToolExamples(nodeType: string): any {
  const exampleMap: Record<string, any> = {
    'nodes-base.slack': {
      toolName: 'Send Slack Message',
      toolDescription: 'Sends a message to a specified Slack channel or user.',
      nodeConfig: {
        resource: 'message',
        operation: 'post',
        channel: '={{ $fromAI("channel", "The Slack channel to send to, e.g. #general") }}',
        text: '={{ $fromAI("message", "The message content to send") }}'
      }
    },
    'nodes-base.googleSheets': {
      toolName: 'Update Google Sheet',
      toolDescription: 'Reads or updates data in a Google Sheets spreadsheet.',
      nodeConfig: {
        operation: 'append',
        sheetId: 'your-sheet-id',
        range: 'A:Z',
        dataMode: 'autoMap'
      }
    },
    'nodes-base.httpRequest': {
      toolName: 'Call API',
      toolDescription: 'Makes HTTP requests to external APIs.',
      nodeConfig: {
        method: '={{ $fromAI("method", "HTTP method: GET, POST, PUT, DELETE") }}',
        url: '={{ $fromAI("url", "The complete API endpoint URL") }}',
        sendBody: true,
        bodyContentType: 'json',
        jsonBody: '={{ $fromAI("body", "Request body as JSON object") }}'
      }
    }
  };

  for (const [key, example] of Object.entries(exampleMap)) {
    if (nodeType.includes(key)) {
      return example;
    }
  }

  return {
    toolName: 'Custom Tool',
    toolDescription: 'Performs specific operations. Describe what this tool does and when to use it.',
    nodeConfig: {
      note: 'Configure the node based on its specific requirements'
    }
  };
}
