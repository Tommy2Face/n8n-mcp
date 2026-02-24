import { ToolHandler } from './types';
import * as doc from './documentation-handlers';
import * as val from './validation-handlers';
import * as tmpl from './template-handlers';
import * as wf from './workflow-validation-handlers';
import { getWorkflowGuide } from './guide-handler';

export { HandlerContext } from './types';

export const toolHandlers: Record<string, ToolHandler> = {
  // Guide
  'start_here_workflow_guide': (ctx, args) => getWorkflowGuide(ctx, args),

  // Documentation tools
  'list_nodes': (ctx, args) => doc.listNodes(ctx, args),
  'get_node_info': (ctx, args) => doc.getNodeInfo(ctx, args),
  'search_nodes': (ctx, args) => doc.searchNodes(ctx, args),
  'list_ai_tools': (ctx, args) => doc.listAITools(ctx, args),
  'get_node_documentation': (ctx, args) => doc.getNodeDocumentation(ctx, args),
  'get_database_statistics': (ctx, args) => doc.getDatabaseStatistics(ctx, args),
  'get_node_as_tool_info': (ctx, args) => doc.getNodeAsToolInfo(ctx, args),

  // Validation tools
  'get_node_essentials': (ctx, args) => val.getNodeEssentials(ctx, args),
  'search_node_properties': (ctx, args) => val.searchNodeProperties(ctx, args),
  'get_node_for_task': (ctx, args) => val.getNodeForTask(ctx, args),
  'list_tasks': (ctx, args) => val.listTasks(ctx, args),
  'validate_node_operation': (ctx, args) => val.validateNodeConfig(ctx, args),
  'validate_node_minimal': (ctx, args) => val.validateNodeMinimal(ctx, args),
  'get_property_dependencies': (ctx, args) => val.getPropertyDependencies(ctx, args),

  // Template tools
  'list_node_templates': (ctx, args) => tmpl.listNodeTemplates(ctx, args),
  'get_template': (ctx, args) => tmpl.getTemplate(ctx, args),
  'search_templates': (ctx, args) => tmpl.searchTemplates(ctx, args),
  'get_templates_for_task': (ctx, args) => tmpl.getTemplatesForTask(ctx, args),

  // Workflow validation tools
  'validate_workflow': (ctx, args) => wf.validateWorkflow(ctx, args),
  'validate_workflow_connections': (ctx, args) => wf.validateWorkflowConnections(ctx, args),
  'validate_workflow_expressions': (ctx, args) => wf.validateWorkflowExpressions(ctx, args),
};
