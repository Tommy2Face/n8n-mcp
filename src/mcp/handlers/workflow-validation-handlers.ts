import { HandlerContext } from './types';
import { WorkflowValidator } from '../../services/workflow-validator';
import { EnhancedConfigValidator } from '../../services/enhanced-config-validator';
import { logger } from '../../utils/logger';

export async function validateWorkflow(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { workflow, options } = args;

  const validator = new WorkflowValidator(
    ctx.repository,
    EnhancedConfigValidator
  );

  try {
    const result = await validator.validateWorkflow(workflow, options);

    const response: any = {
      valid: result.valid,
      summary: {
        totalNodes: result.statistics.totalNodes,
        enabledNodes: result.statistics.enabledNodes,
        triggerNodes: result.statistics.triggerNodes,
        validConnections: result.statistics.validConnections,
        invalidConnections: result.statistics.invalidConnections,
        expressionsValidated: result.statistics.expressionsValidated,
        errorCount: result.errors.length,
        warningCount: result.warnings.length
      }
    };

    if (result.errors.length > 0) {
      response.errors = result.errors.map((e: any) => ({
        node: e.nodeName || 'workflow',
        message: e.message,
        details: e.details
      }));
    }

    if (result.warnings.length > 0) {
      response.warnings = result.warnings.map((w: any) => ({
        node: w.nodeName || 'workflow',
        message: w.message,
        details: w.details
      }));
    }

    if (result.suggestions.length > 0) {
      response.suggestions = result.suggestions;
    }

    return response;
  } catch (error) {
    logger.error('Error validating workflow:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating workflow',
      tip: 'Ensure the workflow JSON includes nodes array and connections object'
    };
  }
}

export async function validateWorkflowConnections(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { workflow } = args;

  const validator = new WorkflowValidator(
    ctx.repository,
    EnhancedConfigValidator
  );

  try {
    const result = await validator.validateWorkflow(workflow, {
      validateNodes: false,
      validateConnections: true,
      validateExpressions: false
    });

    const response: any = {
      valid: result.errors.length === 0,
      statistics: {
        totalNodes: result.statistics.totalNodes,
        triggerNodes: result.statistics.triggerNodes,
        validConnections: result.statistics.validConnections,
        invalidConnections: result.statistics.invalidConnections
      }
    };

    const connectionErrors = result.errors.filter((e: any) =>
      e.message.includes('connection') ||
      e.message.includes('cycle') ||
      e.message.includes('orphaned')
    );

    const connectionWarnings = result.warnings.filter((w: any) =>
      w.message.includes('connection') ||
      w.message.includes('orphaned') ||
      w.message.includes('trigger')
    );

    if (connectionErrors.length > 0) {
      response.errors = connectionErrors.map((e: any) => ({
        node: e.nodeName || 'workflow',
        message: e.message
      }));
    }

    if (connectionWarnings.length > 0) {
      response.warnings = connectionWarnings.map((w: any) => ({
        node: w.nodeName || 'workflow',
        message: w.message
      }));
    }

    return response;
  } catch (error) {
    logger.error('Error validating workflow connections:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating connections'
    };
  }
}

export async function validateWorkflowExpressions(ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { workflow } = args;

  const validator = new WorkflowValidator(
    ctx.repository,
    EnhancedConfigValidator
  );

  try {
    const result = await validator.validateWorkflow(workflow, {
      validateNodes: false,
      validateConnections: false,
      validateExpressions: true
    });

    const response: any = {
      valid: result.errors.length === 0,
      statistics: {
        totalNodes: result.statistics.totalNodes,
        expressionsValidated: result.statistics.expressionsValidated
      }
    };

    const expressionErrors = result.errors.filter((e: any) =>
      e.message.includes('Expression') ||
      e.message.includes('$') ||
      e.message.includes('{{')
    );

    const expressionWarnings = result.warnings.filter((w: any) =>
      w.message.includes('Expression') ||
      w.message.includes('$') ||
      w.message.includes('{{')
    );

    if (expressionErrors.length > 0) {
      response.errors = expressionErrors.map((e: any) => ({
        node: e.nodeName || 'workflow',
        message: e.message
      }));
    }

    if (expressionWarnings.length > 0) {
      response.warnings = expressionWarnings.map((w: any) => ({
        node: w.nodeName || 'workflow',
        message: w.message
      }));
    }

    if (expressionErrors.length > 0 || expressionWarnings.length > 0) {
      response.tips = [
        'Use {{ }} to wrap expressions',
        'Reference data with $json.propertyName',
        'Reference other nodes with $node["Node Name"].json',
        'Use $input.item for input data in loops'
      ];
    }

    return response;
  } catch (error) {
    logger.error('Error validating workflow expressions:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating expressions'
    };
  }
}
