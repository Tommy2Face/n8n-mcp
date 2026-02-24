import { N8nProperty, N8nPropertyOption, N8nOperation, N8nCredential, N8nNodeDescription } from '../types/n8n';

export class PropertyExtractor {
  /**
   * Extract properties with proper handling of n8n's complex structures
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- n8n node classes are dynamically loaded
  extractProperties(nodeClass: any): N8nProperty[] {
    const properties: N8nProperty[] = [];

    // First try to get instance-level properties
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }

    // Handle versioned nodes - check instance for nodeVersions
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      const versionedNode = instance.nodeVersions[latestVersion];

      if (versionedNode?.description?.properties) {
        return this.normalizeProperties(versionedNode.description.properties);
      }
    }

    // Check for description with properties
    const description = instance?.description || instance?.baseDescription ||
                       this.getNodeDescription(nodeClass);

    if (description?.properties) {
      return this.normalizeProperties(description.properties);
    }

    return properties;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNodeDescription(nodeClass: any): N8nNodeDescription {
    // Try to get description from the class first
    let description: N8nNodeDescription;
    
    if (typeof nodeClass === 'function') {
      // Try to instantiate to get description
      try {
        const instance = new nodeClass();
        description = instance.description || instance.baseDescription || {};
      } catch (e) {
        // Some nodes might require parameters to instantiate
        description = nodeClass.description || {};
      }
    } else {
      description = nodeClass.description || {};
    }

    return description;
  }

  /**
   * Extract operations from both declarative and programmatic nodes
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractOperations(nodeClass: any): N8nOperation[] {
    const operations: N8nOperation[] = [];

    // First try to get instance-level data
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }

    // Handle versioned nodes
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      const versionedNode = instance.nodeVersions[latestVersion];

      if (versionedNode?.description) {
        return this.extractOperationsFromDescription(versionedNode.description);
      }
    }

    // Get description
    const description = instance?.description || instance?.baseDescription ||
                       this.getNodeDescription(nodeClass);

    return this.extractOperationsFromDescription(description);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractOperationsFromDescription(description: any): N8nOperation[] {
    const operations: N8nOperation[] = [];

    if (!description) return operations;

    // Declarative nodes (with routing)
    if (description.routing) {
      const routing = description.routing;

      // Extract from request.resource and request.operation
      if (routing.request?.resource) {
        const resources = routing.request.resource.options || [];
        const operationOptions = routing.request.operation?.options || {};

        resources.forEach((resource: N8nPropertyOption) => {
          const resourceOps = operationOptions[resource.value] || [];
          resourceOps.forEach((op: N8nPropertyOption) => {
            operations.push({
              resource: resource.value,
              operation: op.value,
              name: `${resource.name} - ${op.name}`,
              action: op.action
            });
          });
        });
      }
    }

    // Programmatic nodes - look for operation property in properties
    if (description.properties && Array.isArray(description.properties)) {
      const operationProp = description.properties.find(
        (p: N8nProperty) => p.name === 'operation' || p.name === 'action'
      );

      if (operationProp?.options) {
        operationProp.options.forEach((op: N8nPropertyOption) => {
          operations.push({
            operation: op.value || op.name,
            name: op.name || op.value,
            description: op.description
          });
        });
      }
    }

    return operations;
  }

  /**
   * Deep search for AI tool capability
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectAIToolCapability(nodeClass: any): boolean {
    const description = this.getNodeDescription(nodeClass);
    
    // Direct property check
    if (description?.usableAsTool === true) return true;
    
    // Check in actions for declarative nodes
    if (description?.actions?.some((a: { usableAsTool?: boolean }) => a.usableAsTool === true)) return true;

    // Check versioned nodes
    if (nodeClass.nodeVersions) {
      for (const version of Object.values(nodeClass.nodeVersions)) {
        if ((version as any).description?.usableAsTool === true) return true;
      }
    }
    
    // Check for specific AI-related properties
    const aiIndicators = ['openai', 'anthropic', 'huggingface', 'cohere', 'ai'];
    const nodeName = description?.name?.toLowerCase() || '';
    
    return aiIndicators.some(indicator => nodeName.includes(indicator));
  }
  
  /**
   * Extract credential requirements with proper structure
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractCredentials(nodeClass: any): N8nCredential[] {
    const credentials: N8nCredential[] = [];

    // First try to get instance-level data
    let instance: any;
    try {
      instance = typeof nodeClass === 'function' ? new nodeClass() : nodeClass;
    } catch (e) {
      // Failed to instantiate
    }

    // Handle versioned nodes
    if (instance?.nodeVersions) {
      const versions = Object.keys(instance.nodeVersions);
      const latestVersion = Math.max(...versions.map(Number));
      const versionedNode = instance.nodeVersions[latestVersion];

      if (versionedNode?.description?.credentials) {
        return versionedNode.description.credentials;
      }
    }

    // Check for description with credentials
    const description = instance?.description || instance?.baseDescription ||
                       this.getNodeDescription(nodeClass);

    if (description?.credentials) {
      return description.credentials;
    }

    return credentials;
  }

  private normalizeProperties(properties: N8nProperty[]): N8nProperty[] {
    // Ensure all properties have consistent structure
    return properties.map(prop => ({
      displayName: prop.displayName,
      name: prop.name,
      type: prop.type,
      default: prop.default,
      description: prop.description,
      options: prop.options,
      required: prop.required,
      displayOptions: prop.displayOptions,
      typeOptions: prop.typeOptions,
      noDataExpression: prop.noDataExpression
    }));
  }
}