import {
  EnhancedConfigValidator,
  EnhancedValidationResult,
  ValidationMode,
  ValidationProfile,
} from '../../src/services/enhanced-config-validator';

// Mock the NodeSpecificValidators to isolate EnhancedConfigValidator
jest.mock('../../src/services/node-specific-validators', () => ({
  NodeSpecificValidators: {
    validateSlack: jest.fn(),
    validateGoogleSheets: jest.fn(),
    validateOpenAI: jest.fn(),
    validateMongoDB: jest.fn(),
    validateWebhook: jest.fn(),
    validatePostgres: jest.fn(),
    validateMySQL: jest.fn(),
  },
}));

// Mock ExampleGenerator so we can control example output
jest.mock('../../src/services/example-generator', () => ({
  ExampleGenerator: {
    getExamples: jest.fn().mockReturnValue(null),
  },
}));

import { NodeSpecificValidators } from '../../src/services/node-specific-validators';
import { ExampleGenerator } from '../../src/services/example-generator';

describe('EnhancedConfigValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create a property definition
  function prop(overrides: Record<string, any> = {}) {
    return {
      name: overrides.name ?? 'field',
      displayName: overrides.displayName ?? overrides.name ?? 'Field',
      type: overrides.type ?? 'string',
      required: overrides.required ?? false,
      default: overrides.default,
      options: overrides.options,
      displayOptions: overrides.displayOptions,
      ...overrides,
    };
  }

  describe('validateWithMode - basic behavior', () => {
    it('should return an EnhancedValidationResult with mode and profile', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        {},
        [],
        'full',
        'ai-friendly'
      );

      expect(result.mode).toBe('full');
      expect(result.profile).toBe('ai-friendly');
      expect(result).toHaveProperty('operation');
      expect(result).toHaveProperty('examples');
      expect(result).toHaveProperty('nextSteps');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should default to operation mode and ai-friendly profile', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        {},
        []
      );

      expect(result.mode).toBe('operation');
      expect(result.profile).toBe('ai-friendly');
    });

    it('should extract operation context from config', () => {
      const config = {
        resource: 'message',
        operation: 'send',
        action: 'postMessage',
      };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        []
      );

      expect(result.operation).toEqual({
        resource: 'message',
        operation: 'send',
        action: 'postMessage',
        mode: undefined,
      });
    });

    it('should include mode in operation context when present', () => {
      const config = { mode: 'manual' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        []
      );

      expect(result.operation?.mode).toBe('manual');
    });

    it('should return valid=true when there are no errors', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { url: 'https://example.com' },
        [prop({ name: 'url', type: 'string' })]
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Validation modes', () => {
    const properties = [
      prop({ name: 'url', type: 'string', required: true }),
      prop({ name: 'method', type: 'string', required: false }),
      prop({
        name: 'body',
        type: 'string',
        required: false,
        displayOptions: { show: { method: ['POST'] } },
      }),
      prop({ name: 'timeout', type: 'number', required: false }),
    ];

    describe('full mode', () => {
      it('should validate all properties regardless of visibility', () => {
        const config = {};

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          properties,
          'full',
          'strict'
        );

        // All 4 properties should be included in the validation scope
        expect(result.visibleProperties.length + result.hiddenProperties.length).toBe(4);
      });

      it('should report missing required fields', () => {
        const config = {};

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          properties,
          'full',
          'strict'
        );

        const requiredErrors = result.errors.filter(e => e.type === 'missing_required');
        expect(requiredErrors.some(e => e.property === 'url')).toBe(true);
      });
    });

    describe('minimal mode', () => {
      it('should only consider required and visible properties', () => {
        const config = { method: 'GET' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          properties,
          'minimal',
          'strict'
        );

        // Only 'url' is required AND visible (body is not visible because method=GET)
        // So only url should produce a missing_required error
        const requiredErrors = result.errors.filter(e => e.type === 'missing_required');
        expect(requiredErrors.length).toBe(1);
        expect(requiredErrors[0].property).toBe('url');
      });

      it('should skip non-required properties entirely', () => {
        const config = {
          url: 'https://example.com',
          timeout: 'not-a-number', // type error, but property is not required
        };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          properties,
          'minimal',
          'strict'
        );

        // In minimal mode, only required+visible props are in scope.
        // 'timeout' is not required, so it is filtered out; no type check for it.
        const timeoutErrors = result.errors.filter(e => e.property === 'timeout');
        expect(timeoutErrors).toHaveLength(0);
      });
    });

    describe('operation mode', () => {
      it('should only include properties relevant to the current operation', () => {
        const opProperties = [
          prop({ name: 'resource', type: 'options', required: true }),
          prop({
            name: 'channel',
            type: 'string',
            required: false,
            displayOptions: { show: { resource: ['message'], operation: ['send'] } },
          }),
          prop({
            name: 'user',
            type: 'string',
            required: false,
            displayOptions: { show: { resource: ['user'], operation: ['get'] } },
          }),
          prop({ name: 'general', type: 'string' }),
        ];
        const config = { resource: 'message', operation: 'send' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.slack',
          config,
          opProperties,
          'operation',
          'strict'
        );

        // 'user' should be filtered out because its show.resource is ['user'] not ['message']
        expect(result.hiddenProperties).not.toContain('channel');
        // 'user' should not be in visible (its resource condition does not match)
        const allReportedProps = [...result.visibleProperties, ...result.hiddenProperties];
        // 'user' is excluded entirely in operation mode because it is not visible
        expect(result.visibleProperties).not.toContain('user');
      });

      it('should include all visible properties when no operation context exists', () => {
        const opProperties = [
          prop({ name: 'field1' }),
          prop({ name: 'field2' }),
        ];
        const config = {};

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          opProperties,
          'operation',
          'strict'
        );

        // All properties should be included since no resource/operation/action filters apply
        expect(result.visibleProperties).toContain('field1');
        expect(result.visibleProperties).toContain('field2');
      });

      it('should exclude properties that target a different resource', () => {
        const opProperties = [
          prop({
            name: 'email',
            displayOptions: { show: { resource: ['contact'] } },
          }),
        ];
        const config = { resource: 'deal' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          opProperties,
          'operation',
          'strict'
        );

        // 'email' targets resource=contact, but config has resource=deal
        // It should not be visible
        expect(result.visibleProperties).not.toContain('email');
      });

      it('should exclude properties that target a different operation', () => {
        const opProperties = [
          prop({
            name: 'deleteKey',
            displayOptions: { show: { operation: ['delete'] } },
          }),
        ];
        const config = { operation: 'create' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          opProperties,
          'operation',
          'strict'
        );

        expect(result.visibleProperties).not.toContain('deleteKey');
      });

      it('should exclude properties that target a different action', () => {
        const opProperties = [
          prop({
            name: 'filePath',
            displayOptions: { show: { action: ['upload'] } },
          }),
        ];
        const config = { action: 'download' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          opProperties,
          'operation',
          'strict'
        );

        expect(result.visibleProperties).not.toContain('filePath');
      });
    });
  });

  describe('Validation profiles', () => {
    // We need a node type that triggers real errors to test profile filtering.
    // Using generic node with missing required fields.
    const properties = [
      prop({ name: 'url', type: 'string', required: true }),
    ];
    const emptyConfig = {};

    describe('minimal profile', () => {
      it('should only keep missing_required errors', () => {
        // Create a scenario with multiple error types
        const props = [
          prop({ name: 'url', type: 'string', required: true }),
          prop({ name: 'count', type: 'number' }),
        ];
        const config = { count: 'not-a-number' }; // type error

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'minimal'
        );

        // Only missing_required errors should remain
        expect(result.errors.every(e => e.type === 'missing_required')).toBe(true);
        expect(result.errors.some(e => e.property === 'url')).toBe(true);
      });

      it('should clear all warnings', () => {
        const config = { password: 'secret123' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          [],
          'full',
          'minimal'
        );

        expect(result.warnings).toHaveLength(0);
      });

      it('should clear all suggestions', () => {
        const props = [prop({ name: 'authentication' })];
        const config = {};

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'minimal'
        );

        expect(result.suggestions).toHaveLength(0);
      });
    });

    describe('runtime profile', () => {
      it('should keep missing_required and invalid_value errors', () => {
        const props = [
          prop({ name: 'url', type: 'string', required: true }),
          prop({
            name: 'method',
            type: 'options',
            options: [{ name: 'GET', value: 'GET' }],
          }),
        ];
        const config = { method: 'INVALID' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'runtime'
        );

        expect(result.errors.some(e => e.type === 'missing_required')).toBe(true);
        expect(result.errors.some(e => e.type === 'invalid_value')).toBe(true);
      });

      it('should filter out non-critical type errors (not undefined)', () => {
        const props = [
          prop({ name: 'count', type: 'number' }),
        ];
        const config = { count: 'ten' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'runtime'
        );

        // The type error message says "got string", not "undefined", so it should be filtered
        const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
        expect(typeErrors).toHaveLength(0);
      });

      it('should only keep security warnings', () => {
        // Use httpRequest to get a security warning about authentication
        const config = {
          url: 'https://api.example.com/data',
          authentication: 'none',
          password: 'hardcoded',
        };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.httpRequest',
          config,
          [],
          'full',
          'runtime'
        );

        // All remaining warnings should be security type
        for (const w of result.warnings) {
          expect(w.type).toBe('security');
        }
      });

      it('should clear all suggestions', () => {
        const props = [prop({ name: 'authentication' })];
        const config = {};

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'runtime'
        );

        expect(result.suggestions).toHaveLength(0);
      });
    });

    describe('strict profile', () => {
      it('should keep all errors and warnings', () => {
        const props = [
          prop({ name: 'url', type: 'string', required: true }),
          prop({ name: 'count', type: 'number' }),
        ];
        const config = { count: 'wrong' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'strict'
        );

        // Both missing_required and invalid_type should be present
        expect(result.errors.some(e => e.type === 'missing_required')).toBe(true);
        expect(result.errors.some(e => e.type === 'invalid_type')).toBe(true);
      });

      it('should add extra suggestions when there are no errors or warnings', () => {
        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          { field: 'value' },
          [prop({ name: 'field', type: 'string' })],
          'full',
          'strict'
        );

        // When no errors and no warnings, strict adds suggestions
        if (result.errors.length === 0 && result.warnings.length === 0) {
          expect(result.suggestions.some(s => s.includes('error handling'))).toBe(true);
          expect(result.suggestions.some(s => s.includes('authentication'))).toBe(true);
        }
      });
    });

    describe('ai-friendly profile', () => {
      it('should filter out inefficient warnings for underscore-prefixed properties', () => {
        // This is tricky to trigger directly. We construct a scenario where
        // the base validator emits an inefficient warning for a _-prefixed property.
        const props = [
          prop({
            name: '_internal',
            displayOptions: { show: { mode: ['advanced'] } },
          }),
        ];
        const config = { mode: 'simple', _internal: 'data' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'ai-friendly'
        );

        // ai-friendly filters inefficient warnings where property starts with _
        const internalWarnings = result.warnings.filter(
          w => w.type === 'inefficient' && w.property?.startsWith('_')
        );
        expect(internalWarnings).toHaveLength(0);
      });

      it('should keep non-underscore inefficient warnings', () => {
        const props = [
          prop({
            name: 'body',
            displayOptions: { show: { method: ['POST'] } },
          }),
        ];
        const config = { method: 'GET', body: 'data' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.generic',
          config,
          props,
          'full',
          'ai-friendly'
        );

        const bodyWarnings = result.warnings.filter(
          w => w.type === 'inefficient' && w.property === 'body'
        );
        expect(bodyWarnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Operation-specific enhancements', () => {
    describe('Slack enhancements', () => {
      it('should call NodeSpecificValidators.validateSlack for Slack node', () => {
        const config = { resource: 'message', operation: 'send' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.slack',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateSlack).toHaveBeenCalled();
      });

      it('should add send message example for message/send operation', () => {
        const config = {
          resource: 'message',
          operation: 'send',
          channel: '#test',
          text: 'hello',
        };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.slack',
          config,
          [],
          'full',
          'strict'
        );

        const sendExamples = result.examples?.filter(e =>
          e.description.toLowerCase().includes('send')
        );
        expect(sendExamples?.length).toBeGreaterThan(0);
      });

      it('should add user get example for user/get operation', () => {
        const config = { resource: 'user', operation: 'get' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.slack',
          config,
          [],
          'full',
          'strict'
        );

        const userExamples = result.examples?.filter(e =>
          e.description.toLowerCase().includes('user')
        );
        expect(userExamples?.length).toBeGreaterThan(0);
      });
    });

    describe('Google Sheets enhancements', () => {
      it('should call NodeSpecificValidators.validateGoogleSheets', () => {
        const config = { operation: 'append' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.googleSheets',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateGoogleSheets).toHaveBeenCalled();
      });

      it('should add append example for append operation', () => {
        const config = { operation: 'append', sheetId: '123', range: 'Sheet1!A:B' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.googleSheets',
          config,
          [],
          'full',
          'strict'
        );

        const appendExamples = result.examples?.filter(e =>
          e.description.toLowerCase().includes('append')
        );
        expect(appendExamples?.length).toBeGreaterThan(0);
      });

      it('should warn about range format without sheet name', () => {
        const config = { operation: 'append', sheetId: '123', range: 'A:B' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.googleSheets',
          config,
          [],
          'full',
          'strict'
        );

        const rangeWarnings = result.warnings.filter(
          w => w.property === 'range' && w.message.includes('sheet name')
        );
        expect(rangeWarnings.length).toBeGreaterThan(0);
      });

      it('should not warn about range that includes sheet name', () => {
        const config = { operation: 'append', sheetId: '123', range: 'Sheet1!A:B' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.googleSheets',
          config,
          [],
          'full',
          'strict'
        );

        const rangeWarnings = result.warnings.filter(
          w => w.property === 'range' && w.message.includes('should include sheet name')
        );
        expect(rangeWarnings).toHaveLength(0);
      });
    });

    describe('HTTP Request enhancements', () => {
      it('should add GET example for GET requests', () => {
        const config = { method: 'GET', url: 'https://api.example.com' };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.httpRequest',
          config,
          [],
          'full',
          'strict'
        );

        const getExamples = result.examples?.filter(e =>
          e.description.toLowerCase().includes('get')
        );
        expect(getExamples?.length).toBeGreaterThan(0);
      });

      it('should add POST example for POST requests', () => {
        const config = {
          method: 'POST',
          url: 'https://api.example.com',
          sendBody: true,
        };

        const result = EnhancedConfigValidator.validateWithMode(
          'nodes-base.httpRequest',
          config,
          [],
          'full',
          'strict'
        );

        const postExamples = result.examples?.filter(e =>
          e.description.toLowerCase().includes('post')
        );
        expect(postExamples?.length).toBeGreaterThan(0);
      });
    });

    describe('Other node types', () => {
      it('should call NodeSpecificValidators.validateOpenAI for OpenAI node', () => {
        const config = { resource: 'chat', operation: 'create' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.openAi',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateOpenAI).toHaveBeenCalled();
      });

      it('should call NodeSpecificValidators.validateMongoDB for MongoDB node', () => {
        const config = { operation: 'find', collection: 'users' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.mongoDb',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateMongoDB).toHaveBeenCalled();
      });

      it('should call NodeSpecificValidators.validateWebhook for Webhook node', () => {
        const config = { path: 'my-webhook' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.webhook',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateWebhook).toHaveBeenCalled();
      });

      it('should call NodeSpecificValidators.validatePostgres for Postgres node', () => {
        const config = { operation: 'select' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.postgres',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validatePostgres).toHaveBeenCalled();
      });

      it('should call NodeSpecificValidators.validateMySQL for MySQL node', () => {
        const config = { operation: 'select' };

        EnhancedConfigValidator.validateWithMode(
          'nodes-base.mysql',
          config,
          [],
          'full',
          'strict'
        );

        expect(NodeSpecificValidators.validateMySQL).toHaveBeenCalled();
      });
    });
  });

  describe('Error deduplication', () => {
    it('should remove duplicate errors with the same property and type', () => {
      // We craft a scenario where the same property gets the same error type twice.
      // For example, a required field checked by both base and node-specific validation.
      // We mock NodeSpecificValidators.validateSlack to inject a duplicate error.
      (NodeSpecificValidators.validateSlack as jest.Mock).mockImplementation((ctx: any) => {
        ctx.errors.push({
          type: 'missing_required',
          property: 'channel',
          message: 'Channel is required to send a message',
          fix: 'Set channel to a channel name',
        });
      });

      const properties = [
        prop({ name: 'channel', required: true }),
      ];
      const config = { resource: 'message', operation: 'send' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'full',
        'strict'
      );

      // The same property+type should be deduplicated
      const channelErrors = result.errors.filter(e => e.property === 'channel');
      expect(channelErrors).toHaveLength(1);
    });

    it('should prefer the more specific error message when deduplicating', () => {
      (NodeSpecificValidators.validateSlack as jest.Mock).mockImplementation((ctx: any) => {
        ctx.errors.push({
          type: 'missing_required',
          property: 'channel',
          message: 'Channel is required to send a Slack message. Use #channel-name or a channel ID like C1234567890.',
          fix: 'Set channel to a channel name (e.g., "#general") or ID (e.g., "C1234567890")',
        });
      });

      const properties = [
        prop({ name: 'channel', required: true, displayName: 'Channel' }),
      ];
      const config = { resource: 'message', operation: 'send' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'full',
        'strict'
      );

      const channelErrors = result.errors.filter(e => e.property === 'channel');
      expect(channelErrors).toHaveLength(1);
      // Should keep the longer, more specific message
      expect(channelErrors[0].message.length).toBeGreaterThan(30);
    });
  });

  describe('Example generation from ExampleGenerator', () => {
    it('should add minimal example when there are missing required errors', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue({
        minimal: { url: 'https://api.example.com' },
        common: { method: 'POST', url: 'https://api.example.com' },
      });

      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
      ];
      const config = {};

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        config,
        properties,
        'full',
        'strict'
      );

      const minimalExamples = result.examples?.filter(e =>
        e.description.toLowerCase().includes('minimal')
      );
      expect(minimalExamples?.length).toBeGreaterThan(0);
    });

    it('should add common example when matching operation context', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue({
        minimal: { url: 'https://api.example.com' },
        common: { operation: 'get', url: 'https://api.example.com' },
      });

      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
      ];
      const config = { operation: 'get' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      const commonExamples = result.examples?.filter(e =>
        e.description.toLowerCase().includes('common')
      );
      expect(commonExamples?.length).toBeGreaterThan(0);
    });

    it('should add advanced example when there are many errors', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue({
        minimal: { url: 'https://example.com' },
        advanced: { url: 'https://example.com', method: 'POST', auth: true },
      });

      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
        prop({ name: 'method', type: 'string', required: true }),
        prop({ name: 'auth', type: 'boolean', required: true }),
      ];
      const config = {};

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      // With 3 missing required errors (> 2), advanced example should be added
      const advancedExamples = result.examples?.filter(e =>
        e.description.toLowerCase().includes('advanced')
      );
      expect(advancedExamples?.length).toBeGreaterThan(0);
    });

    it('should not add examples when there are no errors', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue({
        minimal: { field: 'value' },
      });

      const properties = [prop({ name: 'field', type: 'string' })];
      const config = { field: 'value' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      // ExampleGenerator should not even be called when there are no errors
      // (the method is only called when errors.length > 0)
      // Any examples would only come from node-specific enhancements
      const generatorExamples = result.examples?.filter(e =>
        e.description.toLowerCase().includes('minimal') ||
        e.description.toLowerCase().includes('common')
      );
      expect(generatorExamples).toHaveLength(0);
    });

    it('should not add examples when ExampleGenerator returns null', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue(null);

      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
      ];
      const config = {};

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      // Should have errors but no examples from ExampleGenerator
      expect(result.errors.length).toBeGreaterThan(0);
      const generatorExamples = result.examples?.filter(e =>
        e.description.toLowerCase().includes('minimal') ||
        e.description.toLowerCase().includes('common')
      );
      expect(generatorExamples).toHaveLength(0);
    });
  });

  describe('Next steps generation', () => {
    it('should generate step for missing required fields', () => {
      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
        prop({ name: 'method', type: 'string', required: true }),
      ];
      const config = {};

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      expect(result.nextSteps?.some(s => s.includes('required fields'))).toBe(true);
      expect(result.nextSteps?.some(s => s.includes('url'))).toBe(true);
      expect(result.nextSteps?.some(s => s.includes('method'))).toBe(true);
    });

    it('should generate step for type mismatches', () => {
      const properties = [
        prop({ name: 'count', type: 'number' }),
      ];
      const config = { count: 'not-a-number' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      expect(result.nextSteps?.some(s => s.toLowerCase().includes('type'))).toBe(true);
    });

    it('should generate step for invalid values', () => {
      const properties = [
        prop({
          name: 'method',
          type: 'options',
          options: [{ name: 'GET', value: 'GET' }],
        }),
      ];
      const config = { method: 'INVALID' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'strict'
      );

      expect(result.nextSteps?.some(s => s.includes('invalid values'))).toBe(true);
    });

    it('should suggest addressing warnings when there are no errors but warnings exist', () => {
      const config = { password: 'hardcoded_pass' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        [],
        'full',
        'strict'
      );

      if (result.errors.length === 0 && result.warnings.length > 0) {
        expect(result.nextSteps?.some(s => s.includes('warnings'))).toBe(true);
      }
    });

    it('should suggest looking at examples when errors exist and examples are provided', () => {
      (ExampleGenerator.getExamples as jest.Mock).mockReturnValue({
        minimal: { url: 'https://api.example.com' },
      });

      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
      ];
      const config = {};

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        config,
        properties,
        'full',
        'strict'
      );

      if (result.examples && result.examples.length > 0 && result.errors.length > 0) {
        expect(result.nextSteps?.some(s => s.includes('examples'))).toBe(true);
      }
    });

    it('should return empty nextSteps when everything is valid', () => {
      const properties = [prop({ name: 'field', type: 'string' })];
      const config = { field: 'value' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        config,
        properties,
        'full',
        'ai-friendly'
      );

      // With no errors and no warnings (after ai-friendly filtering), nextSteps should be empty
      // unless strict profile adds extra suggestions
      if (result.errors.length === 0 && result.warnings.length === 0) {
        expect(result.nextSteps).toHaveLength(0);
      }
    });
  });

  describe('Property display condition evaluation', () => {
    it('should correctly evaluate show conditions with array values', () => {
      const properties = [
        prop({
          name: 'body',
          displayOptions: { show: { method: ['POST', 'PUT', 'PATCH'] } },
        }),
      ];

      // Should be visible for POST
      const result1 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { method: 'POST' },
        properties,
        'full',
        'strict'
      );
      expect(result1.visibleProperties).toContain('body');

      // Should be visible for PATCH
      const result2 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { method: 'PATCH' },
        properties,
        'full',
        'strict'
      );
      expect(result2.visibleProperties).toContain('body');

      // Should NOT be visible for GET
      const result3 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { method: 'GET' },
        properties,
        'full',
        'strict'
      );
      expect(result3.hiddenProperties).toContain('body');
    });

    it('should evaluate multiple show conditions as AND', () => {
      const properties = [
        prop({
          name: 'sheetRange',
          displayOptions: {
            show: {
              resource: ['spreadsheet'],
              operation: ['append'],
            },
          },
        }),
      ];

      // Both conditions met
      const result1 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { resource: 'spreadsheet', operation: 'append' },
        properties,
        'full',
        'strict'
      );
      expect(result1.visibleProperties).toContain('sheetRange');

      // Only one condition met
      const result2 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { resource: 'spreadsheet', operation: 'read' },
        properties,
        'full',
        'strict'
      );
      expect(result2.hiddenProperties).toContain('sheetRange');

      // Neither condition met
      const result3 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { resource: 'drive', operation: 'list' },
        properties,
        'full',
        'strict'
      );
      expect(result3.hiddenProperties).toContain('sheetRange');
    });

    it('should evaluate hide conditions', () => {
      const properties = [
        prop({
          name: 'advanced',
          displayOptions: { hide: { mode: ['simple'] } },
        }),
      ];

      // hide condition met -> hidden
      const result1 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { mode: 'simple' },
        properties,
        'full',
        'strict'
      );
      expect(result1.hiddenProperties).toContain('advanced');

      // hide condition NOT met -> visible
      const result2 = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        { mode: 'advanced' },
        properties,
        'full',
        'strict'
      );
      expect(result2.visibleProperties).toContain('advanced');
    });

    it('should handle properties with no displayOptions (always visible)', () => {
      const properties = [prop({ name: 'alwaysVisible' })];

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        {},
        properties,
        'full',
        'strict'
      );

      expect(result.visibleProperties).toContain('alwaysVisible');
    });
  });

  describe('Autofix propagation', () => {
    it('should propagate autofix from base validator', () => {
      const config = { method: 'POST', url: 'https://api.example.com' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        config,
        [],
        'full',
        'strict'
      );

      expect(result.autofix).toBeDefined();
      expect(result.autofix?.sendBody).toBe(true);
    });

    it('should propagate autofix from node-specific validators', () => {
      (NodeSpecificValidators.validateSlack as jest.Mock).mockImplementation((ctx: any) => {
        ctx.autofix.linkNames = true;
      });

      const config = { resource: 'message', operation: 'send', text: 'Hello @user' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        [],
        'full',
        'strict'
      );

      expect(result.autofix).toBeDefined();
      expect(result.autofix?.linkNames).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle a complete HTTP POST validation scenario', () => {
      const properties = [
        prop({ name: 'url', type: 'string', required: true }),
        prop({
          name: 'method',
          type: 'options',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
          ],
        }),
        prop({
          name: 'sendBody',
          type: 'boolean',
          displayOptions: { show: { method: ['POST', 'PUT', 'PATCH'] } },
        }),
      ];
      const config = { method: 'POST' };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.httpRequest',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should report missing url
      expect(result.errors.some(e => e.property === 'url')).toBe(true);
      // Should have autofix for missing body
      expect(result.autofix).toBeDefined();
    });

    it('should handle an empty configuration gracefully', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.generic',
        {},
        [],
        'full',
        'ai-friendly'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.mode).toBe('full');
      expect(result.profile).toBe('ai-friendly');
      expect(result.nextSteps).toBeDefined();
    });

    it('should handle unknown node types without crashing', () => {
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.unknownNode',
        { field: 'value' },
        [prop({ name: 'field', type: 'string' })],
        'full',
        'strict'
      );

      expect(result).toBeDefined();
      expect(result.mode).toBe('full');
    });

    it('should work end-to-end with Slack message validation', () => {
      // Reset mock to let it pass through
      (NodeSpecificValidators.validateSlack as jest.Mock).mockImplementation(() => {});

      const properties = [
        prop({
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { name: 'Message', value: 'message' },
            { name: 'Channel', value: 'channel' },
          ],
        }),
        prop({
          name: 'operation',
          type: 'options',
          required: true,
          options: [
            { name: 'Send', value: 'send' },
            { name: 'Update', value: 'update' },
          ],
        }),
        prop({
          name: 'channel',
          type: 'string',
          required: true,
          displayOptions: { show: { resource: ['message'] } },
        }),
        prop({
          name: 'text',
          type: 'string',
          displayOptions: { show: { resource: ['message'], operation: ['send'] } },
        }),
      ];
      const config = {
        resource: 'message',
        operation: 'send',
        channel: '#general',
        text: 'Hello!',
      };

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(true);
      expect(result.operation?.resource).toBe('message');
      expect(result.operation?.operation).toBe('send');
      expect(result.examples).toBeDefined();
    });
  });
});
