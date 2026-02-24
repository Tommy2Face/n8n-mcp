import { HandlerContext } from './types';

export async function listNodeTemplates(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  if (!ctx.templateService) throw new Error('Template service not initialized');
  const { nodeTypes, limit = 10 } = args;

  const templates = await ctx.templateService.listNodeTemplates(nodeTypes, limit);

  if (templates.length === 0) {
    return {
      message: `No templates found using nodes: ${nodeTypes.join(', ')}`,
      tip: "Try searching with more common nodes or run 'npm run fetch:templates' to update template database",
      templates: []
    };
  }

  return {
    templates,
    count: templates.length,
    tip: `Use get_template(templateId) to get the full workflow JSON for any template`
  };
}

export async function getTemplate(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  if (!ctx.templateService) throw new Error('Template service not initialized');
  const { templateId } = args;

  const template = await ctx.templateService.getTemplate(templateId);

  if (!template) {
    return {
      error: `Template ${templateId} not found`,
      tip: "Use list_node_templates or search_templates to find available templates"
    };
  }

  return {
    template,
    usage: "Import this workflow JSON directly into n8n or use it as a reference for building workflows"
  };
}

export async function searchTemplates(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  if (!ctx.templateService) throw new Error('Template service not initialized');
  const { query, limit = 20 } = args;

  const templates = await ctx.templateService.searchTemplates(query, limit);

  if (templates.length === 0) {
    return {
      message: `No templates found matching: "${query}"`,
      tip: "Try different keywords or run 'npm run fetch:templates' to update template database",
      templates: []
    };
  }

  return {
    templates,
    count: templates.length,
    query
  };
}

export async function getTemplatesForTask(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  if (!ctx.templateService) throw new Error('Template service not initialized');
  const { task } = args;

  const templates = await ctx.templateService.getTemplatesForTask(task);
  const availableTasks = ctx.templateService.listAvailableTasks();

  if (templates.length === 0) {
    return {
      message: `No templates found for task: ${task}`,
      availableTasks,
      tip: "Try a different task or use search_templates for custom searches"
    };
  }

  const descriptions: Record<string, string> = {
    'ai_automation': 'AI-powered workflows using OpenAI, LangChain, and other AI tools',
    'data_sync': 'Synchronize data between databases, spreadsheets, and APIs',
    'webhook_processing': 'Process incoming webhooks and trigger automated actions',
    'email_automation': 'Send, receive, and process emails automatically',
    'slack_integration': 'Integrate with Slack for notifications and bot interactions',
    'data_transformation': 'Transform, clean, and manipulate data',
    'file_processing': 'Handle file uploads, downloads, and transformations',
    'scheduling': 'Schedule recurring tasks and time-based automations',
    'api_integration': 'Connect to external APIs and web services',
    'database_operations': 'Query, insert, update, and manage database records'
  };

  return {
    task,
    templates,
    count: templates.length,
    description: descriptions[task] || 'Workflow templates for this task'
  };
}
