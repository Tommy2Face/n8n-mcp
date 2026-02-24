import { ConfigValidator, ValidationResult } from '../../src/services/config-validator';

describe('ConfigValidator', () => {
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

  describe('Required field validation', () => {
    it('should report missing required properties', () => {
      const properties = [
        prop({ name: 'url', required: true }),
        prop({ name: 'method', required: true }),
      ];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].type).toBe('missing_required');
      expect(result.errors[0].property).toBe('url');
      expect(result.errors[1].type).toBe('missing_required');
      expect(result.errors[1].property).toBe('method');
    });

    it('should pass when all required properties are present', () => {
      const properties = [
        prop({ name: 'url', required: true }),
        prop({ name: 'method', required: true }),
      ];
      const config = { url: 'https://example.com', method: 'GET' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.errors.filter(e => e.type === 'missing_required')).toHaveLength(0);
    });

    it('should not report missing non-required properties', () => {
      const properties = [
        prop({ name: 'url', required: true }),
        prop({ name: 'timeout', required: false }),
      ];
      const config = { url: 'https://example.com' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const missingErrors = result.errors.filter(e => e.type === 'missing_required');
      expect(missingErrors).toHaveLength(0);
    });

    it('should use displayName in error message when available', () => {
      const properties = [
        prop({ name: 'url', displayName: 'Request URL', required: true }),
      ];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.errors[0].message).toContain('Request URL');
    });

    it('should fall back to property name when displayName is absent', () => {
      const properties = [
        { name: 'url', required: true },
      ];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.errors[0].message).toContain('url');
    });

    it('should provide a fix suggestion for missing required fields', () => {
      const properties = [
        prop({ name: 'apiKey', required: true }),
      ];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.errors[0].fix).toBeDefined();
      expect(result.errors[0].fix).toContain('apiKey');
    });
  });

  describe('Type checking', () => {
    it('should reject a non-string value for a string property', () => {
      const properties = [prop({ name: 'url', type: 'string' })];
      const config = { url: 42 };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0].property).toBe('url');
      expect(typeErrors[0].message).toContain('string');
      expect(typeErrors[0].message).toContain('number');
    });

    it('should accept a valid string value for a string property', () => {
      const properties = [prop({ name: 'url', type: 'string' })];
      const config = { url: 'https://example.com' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(0);
    });

    it('should reject a non-number value for a number property', () => {
      const properties = [prop({ name: 'timeout', type: 'number' })];
      const config = { timeout: '5000' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0].property).toBe('timeout');
      expect(typeErrors[0].message).toContain('number');
    });

    it('should accept a valid number value for a number property', () => {
      const properties = [prop({ name: 'timeout', type: 'number' })];
      const config = { timeout: 5000 };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(0);
    });

    it('should reject a non-boolean value for a boolean property', () => {
      const properties = [prop({ name: 'sendBody', type: 'boolean' })];
      const config = { sendBody: 'true' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0].property).toBe('sendBody');
      expect(typeErrors[0].message).toContain('boolean');
    });

    it('should accept a valid boolean value for a boolean property', () => {
      const properties = [prop({ name: 'sendBody', type: 'boolean' })];
      const config = { sendBody: true };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(0);
    });

    it('should ignore config keys that have no matching property definition', () => {
      const properties = [prop({ name: 'url', type: 'string' })];
      const config = { url: 'https://example.com', unknown: 123 };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(e => e.type === 'invalid_type');
      expect(typeErrors).toHaveLength(0);
    });

    it('should provide a fix suggestion for type mismatches', () => {
      const properties = [prop({ name: 'count', type: 'number' })];
      const config = { count: 'ten' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.errors[0].fix).toBeDefined();
    });
  });

  describe('Enum / options validation', () => {
    it('should reject an invalid option value from object options', () => {
      const properties = [
        prop({
          name: 'method',
          type: 'options',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
          ],
        }),
      ];
      const config = { method: 'INVALID' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const valueErrors = result.errors.filter(e => e.type === 'invalid_value');
      expect(valueErrors).toHaveLength(1);
      expect(valueErrors[0].property).toBe('method');
      expect(valueErrors[0].message).toContain('GET');
      expect(valueErrors[0].message).toContain('POST');
    });

    it('should accept a valid option value from object options', () => {
      const properties = [
        prop({
          name: 'method',
          type: 'options',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
          ],
        }),
      ];
      const config = { method: 'GET' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const valueErrors = result.errors.filter(e => e.type === 'invalid_value');
      expect(valueErrors).toHaveLength(0);
    });

    it('should handle string-based options (simple array of strings)', () => {
      const properties = [
        prop({
          name: 'color',
          type: 'options',
          options: ['red', 'green', 'blue'],
        }),
      ];
      const config = { color: 'yellow' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const valueErrors = result.errors.filter(e => e.type === 'invalid_value');
      expect(valueErrors).toHaveLength(1);
      expect(valueErrors[0].message).toContain('red');
    });

    it('should accept a valid string option value', () => {
      const properties = [
        prop({
          name: 'color',
          type: 'options',
          options: ['red', 'green', 'blue'],
        }),
      ];
      const config = { color: 'red' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const valueErrors = result.errors.filter(e => e.type === 'invalid_value');
      expect(valueErrors).toHaveLength(0);
    });

    it('should not validate options when property type is not "options"', () => {
      const properties = [
        prop({
          name: 'method',
          type: 'string',
          options: [{ name: 'GET', value: 'GET' }],
        }),
      ];
      const config = { method: 'ANYTHING' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const valueErrors = result.errors.filter(
        e => e.type === 'invalid_value' && e.property === 'method'
      );
      expect(valueErrors).toHaveLength(0);
    });
  });

  describe('Property visibility (displayOptions)', () => {
    it('should mark properties as visible when no displayOptions are set', () => {
      const properties = [prop({ name: 'url' })];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.visibleProperties).toContain('url');
      expect(result.hiddenProperties).not.toContain('url');
    });

    it('should show a property when its show condition is met', () => {
      const properties = [
        prop({
          name: 'body',
          displayOptions: { show: { method: ['POST', 'PUT'] } },
        }),
      ];
      const config = { method: 'POST' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.visibleProperties).toContain('body');
      expect(result.hiddenProperties).not.toContain('body');
    });

    it('should hide a property when its show condition is not met', () => {
      const properties = [
        prop({
          name: 'body',
          displayOptions: { show: { method: ['POST', 'PUT'] } },
        }),
      ];
      const config = { method: 'GET' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.hiddenProperties).toContain('body');
      expect(result.visibleProperties).not.toContain('body');
    });

    it('should hide a property when its hide condition is met', () => {
      const properties = [
        prop({
          name: 'advanced',
          displayOptions: { hide: { mode: ['simple'] } },
        }),
      ];
      const config = { mode: 'simple' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.hiddenProperties).toContain('advanced');
    });

    it('should show a property when its hide condition is not met', () => {
      const properties = [
        prop({
          name: 'advanced',
          displayOptions: { hide: { mode: ['simple'] } },
        }),
      ];
      const config = { mode: 'advanced' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.visibleProperties).toContain('advanced');
    });

    it('should combine show and hide conditions', () => {
      const properties = [
        prop({
          name: 'jsonBody',
          displayOptions: {
            show: { method: ['POST'] },
            hide: { bodyType: ['none'] },
          },
        }),
      ];

      // Both conditions met: show=POST satisfied, hide=none NOT met -> visible
      const result1 = ConfigValidator.validate(
        'nodes-base.generic',
        { method: 'POST', bodyType: 'json' },
        properties
      );
      expect(result1.visibleProperties).toContain('jsonBody');

      // Show met, but hide also met -> hidden
      const result2 = ConfigValidator.validate(
        'nodes-base.generic',
        { method: 'POST', bodyType: 'none' },
        properties
      );
      expect(result2.hiddenProperties).toContain('jsonBody');

      // Show not met -> hidden
      const result3 = ConfigValidator.validate(
        'nodes-base.generic',
        { method: 'GET', bodyType: 'json' },
        properties
      );
      expect(result3.hiddenProperties).toContain('jsonBody');
    });

    it('should handle non-array values in displayOptions conditions', () => {
      // The code normalizes non-array values to [value]
      const properties = [
        prop({
          name: 'body',
          displayOptions: { show: { method: 'POST' } },
        }),
      ];
      const config = { method: 'POST' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.visibleProperties).toContain('body');
    });
  });

  describe('Node-specific validation: HTTP Request', () => {
    it('should reject URLs missing protocol prefix', () => {
      const properties: any[] = [];
      const config = { url: 'example.com/api' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const urlErrors = result.errors.filter(
        e => e.property === 'url' && e.type === 'invalid_value'
      );
      expect(urlErrors.length).toBeGreaterThan(0);
      expect(urlErrors[0].message).toContain('http://');
    });

    it('should accept URLs with https:// prefix', () => {
      const properties: any[] = [];
      const config = { url: 'https://api.example.com' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const urlErrors = result.errors.filter(
        e => e.property === 'url' && e.type === 'invalid_value'
      );
      expect(urlErrors).toHaveLength(0);
    });

    it('should accept URLs with http:// prefix', () => {
      const properties: any[] = [];
      const config = { url: 'http://localhost:3000' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const urlErrors = result.errors.filter(
        e => e.property === 'url' && e.type === 'invalid_value'
      );
      expect(urlErrors).toHaveLength(0);
    });

    it('should warn when POST/PUT/PATCH has no body', () => {
      const properties: any[] = [];

      for (const method of ['POST', 'PUT', 'PATCH']) {
        const config = { method, url: 'https://api.example.com' };
        const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

        const bodyWarnings = result.warnings.filter(w => w.property === 'sendBody');
        expect(bodyWarnings.length).toBeGreaterThan(0);
        expect(bodyWarnings[0].message).toContain(method);
      }
    });

    it('should provide autofix for missing body on POST', () => {
      const properties: any[] = [];
      const config = { method: 'POST', url: 'https://api.example.com' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      expect(result.autofix).toBeDefined();
      expect(result.autofix?.sendBody).toBe(true);
      expect(result.autofix?.contentType).toBe('json');
    });

    it('should not warn about body for GET requests', () => {
      const properties: any[] = [];
      const config = { method: 'GET', url: 'https://api.example.com' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const bodyWarnings = result.warnings.filter(w => w.property === 'sendBody');
      expect(bodyWarnings).toHaveLength(0);
    });

    it('should warn about unauthenticated API endpoints', () => {
      const properties: any[] = [];
      const config = { url: 'https://api.example.com/data', authentication: 'none' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const securityWarnings = result.warnings.filter(w => w.type === 'security');
      expect(securityWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn about auth for non-API URLs', () => {
      const properties: any[] = [];
      const config = { url: 'https://example.com/page', authentication: 'none' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const authWarnings = result.warnings.filter(
        w => w.type === 'security' && w.message.includes('authentication')
      );
      expect(authWarnings).toHaveLength(0);
    });

    it('should error on invalid JSON in jsonBody', () => {
      const properties: any[] = [];
      const config = {
        url: 'https://api.example.com',
        sendBody: true,
        contentType: 'json',
        jsonBody: '{ invalid json }',
      };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const jsonErrors = result.errors.filter(e => e.property === 'jsonBody');
      expect(jsonErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid JSON in jsonBody', () => {
      const properties: any[] = [];
      const config = {
        url: 'https://api.example.com',
        sendBody: true,
        contentType: 'json',
        jsonBody: '{"name": "test"}',
      };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      const jsonErrors = result.errors.filter(e => e.property === 'jsonBody');
      expect(jsonErrors).toHaveLength(0);
    });
  });

  describe('Node-specific validation: Webhook', () => {
    it('should suggest Respond to Webhook node for responseNode mode', () => {
      const properties: any[] = [];
      const config = { responseMode: 'responseNode' };

      const result = ConfigValidator.validate('nodes-base.webhook', config, properties);

      expect(result.suggestions.some(s => s.includes('Respond to Webhook'))).toBe(true);
    });

    it('should not produce suggestions for non-responseNode mode', () => {
      const properties: any[] = [];
      const config = { responseMode: 'lastNode' };

      const result = ConfigValidator.validate('nodes-base.webhook', config, properties);

      const responseNodeSuggestions = result.suggestions.filter(s =>
        s.includes('Respond to Webhook')
      );
      expect(responseNodeSuggestions).toHaveLength(0);
    });
  });

  describe('Node-specific validation: Database (Postgres/MySQL)', () => {
    it('should warn about SQL injection with template expressions', () => {
      const properties: any[] = [];
      const config = { query: 'SELECT * FROM users WHERE id = ${userId}' };

      for (const nodeType of ['nodes-base.postgres', 'nodes-base.mysql']) {
        const result = ConfigValidator.validate(nodeType, config, properties);

        const securityWarnings = result.warnings.filter(w => w.type === 'security');
        expect(securityWarnings.length).toBeGreaterThan(0);
        expect(securityWarnings.some(w => w.message.includes('SQL injection'))).toBe(true);
      }
    });

    it('should warn about DELETE without WHERE clause', () => {
      const properties: any[] = [];
      const config = { query: 'DELETE FROM users' };

      const result = ConfigValidator.validate('nodes-base.postgres', config, properties);

      const deleteWarnings = result.warnings.filter(w => w.message.includes('DELETE'));
      expect(deleteWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn about DELETE with WHERE clause', () => {
      const properties: any[] = [];
      const config = { query: 'DELETE FROM users WHERE id = 1' };

      const result = ConfigValidator.validate('nodes-base.postgres', config, properties);

      const deleteWarnings = result.warnings.filter(
        w => w.type === 'security' && w.message.includes('DELETE')
      );
      expect(deleteWarnings).toHaveLength(0);
    });

    it('should suggest against SELECT *', () => {
      const properties: any[] = [];
      const config = { query: 'select * from users' };

      const result = ConfigValidator.validate('nodes-base.mysql', config, properties);

      expect(result.suggestions.some(s => s.includes('specific columns'))).toBe(true);
    });
  });

  describe('Node-specific validation: Code', () => {
    it('should error on empty JavaScript code', () => {
      const properties: any[] = [];
      const config = { language: 'javaScript', jsCode: '' };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const codeErrors = result.errors.filter(e => e.property === 'jsCode');
      expect(codeErrors.length).toBeGreaterThan(0);
      expect(codeErrors[0].message).toContain('empty');
    });

    it('should error on whitespace-only JavaScript code', () => {
      const properties: any[] = [];
      const config = { language: 'javaScript', jsCode: '   \n  \t  ' };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const codeErrors = result.errors.filter(e => e.property === 'jsCode');
      expect(codeErrors.length).toBeGreaterThan(0);
    });

    it('should error on empty Python code', () => {
      const properties: any[] = [];
      const config = { language: 'python', pythonCode: '' };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const codeErrors = result.errors.filter(e => e.property === 'pythonCode');
      expect(codeErrors.length).toBeGreaterThan(0);
    });

    it('should warn about eval/exec usage', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'const result = eval(input); return items;',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.message.includes('eval')
      );
      expect(securityWarnings.length).toBeGreaterThan(0);
    });

    it('should detect unbalanced braces in JavaScript', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'function test() { return items;',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const braceErrors = result.errors.filter(e => e.message.includes('brace'));
      expect(braceErrors.length).toBeGreaterThan(0);
    });

    it('should detect unbalanced parentheses in JavaScript', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'console.log(items.map(x => x.json; return items;',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const parenErrors = result.errors.filter(e => e.message.includes('parenthes'));
      expect(parenErrors.length).toBeGreaterThan(0);
    });

    it('should detect mixed tabs and spaces in Python', () => {
      const properties: any[] = [];
      const config = {
        language: 'python',
        pythonCode: 'def process():\n\tresult = []\n    return items',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const indentErrors = result.errors.filter(e => e.message.includes('tabs and spaces'));
      expect(indentErrors.length).toBeGreaterThan(0);
    });

    it('should warn about missing return statement', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'console.log(items);',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const returnWarnings = result.warnings.filter(w => w.message.includes('return'));
      expect(returnWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn about missing return when return is present', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'return items;',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const returnWarnings = result.warnings.filter(
        w => w.type === 'missing_common' && w.message.includes('return')
      );
      expect(returnWarnings).toHaveLength(0);
    });

    it('should warn when JS code does not reference items or $input', () => {
      const properties: any[] = [];
      const config = {
        language: 'javascript',
        jsCode: 'const x = 1;\nreturn [{json: {x}}];',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const inputWarnings = result.warnings.filter(w =>
        w.message.includes('input items') || w.message.includes('$input')
      );
      expect(inputWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when JS code references items', () => {
      const properties: any[] = [];
      const config = {
        language: 'javaScript',
        jsCode: 'return items;',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const inputWarnings = result.warnings.filter(w =>
        w.message.includes('input items')
      );
      expect(inputWarnings).toHaveLength(0);
    });

    it('should not warn when Python code references items', () => {
      const properties: any[] = [];
      const config = {
        language: 'python',
        pythonCode: 'return items',
      };

      const result = ConfigValidator.validate('nodes-base.code', config, properties);

      const inputWarnings = result.warnings.filter(w =>
        w.message.includes('input items')
      );
      expect(inputWarnings).toHaveLength(0);
    });
  });

  describe('Common issues detection', () => {
    it('should warn about configured but invisible properties', () => {
      const properties = [
        prop({
          name: 'body',
          displayOptions: { show: { method: ['POST'] } },
        }),
      ];
      const config = { method: 'GET', body: '{"data": true}' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const inefficientWarnings = result.warnings.filter(
        w => w.type === 'inefficient' && w.property === 'body'
      );
      expect(inefficientWarnings.length).toBeGreaterThan(0);
      expect(inefficientWarnings[0].message).toContain("won't be used");
    });

    it('should not warn about @version or underscore-prefixed internal properties', () => {
      const properties = [prop({ name: 'field' })];
      const config = { '@version': 1, _internal: 'data', field: 'value' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const versionWarnings = result.warnings.filter(w => w.property === '@version');
      const internalWarnings = result.warnings.filter(w => w.property === '_internal');
      expect(versionWarnings).toHaveLength(0);
      expect(internalWarnings).toHaveLength(0);
    });

    it('should suggest common properties when visible but not configured', () => {
      const properties = [
        prop({ name: 'authentication' }),
        prop({ name: 'errorHandling' }),
        prop({ name: 'timeout' }),
      ];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      expect(result.suggestions.some(s => s.includes('authentication'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('errorHandling'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('timeout'))).toBe(true);
    });
  });

  describe('Security checks', () => {
    it('should warn about hardcoded API keys', () => {
      const properties: any[] = [];
      const config = { api_key: 'sk-1234567890abcdef' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.property === 'api_key'
      );
      expect(securityWarnings.length).toBeGreaterThan(0);
      expect(securityWarnings[0].message).toContain('Hardcoded');
    });

    it('should warn about hardcoded passwords', () => {
      const properties: any[] = [];
      const config = { password: 'my_secret_pass' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.property === 'password'
      );
      expect(securityWarnings.length).toBeGreaterThan(0);
    });

    it('should warn about hardcoded tokens', () => {
      const properties: any[] = [];
      const config = { token: 'eyJhbGciOiJIUzI1NiJ9' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.property === 'token'
      );
      expect(securityWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when sensitive field uses expression syntax', () => {
      const properties: any[] = [];
      const config = { api_key: '{{ $env.API_KEY }}' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.property === 'api_key'
      );
      expect(securityWarnings).toHaveLength(0);
    });

    it('should not warn when sensitive field is empty', () => {
      const properties: any[] = [];
      const config = { api_key: '' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && w.property === 'api_key'
      );
      expect(securityWarnings).toHaveLength(0);
    });

    it('should not warn about non-sensitive fields even with string values', () => {
      const properties: any[] = [];
      const config = { url: 'https://example.com', method: 'GET' };

      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const securityWarnings = result.warnings.filter(
        w => w.type === 'security' && (w.property === 'url' || w.property === 'method')
      );
      expect(securityWarnings).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty config and empty properties', () => {
      const result = ConfigValidator.validate('nodes-base.generic', {}, []);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.visibleProperties).toHaveLength(0);
      expect(result.hiddenProperties).toHaveLength(0);
    });

    it('should handle null values in config gracefully', () => {
      const properties = [prop({ name: 'url', type: 'string' })];
      const config = { url: null };

      // null is not a string, number, or boolean so type checks won't trigger
      // for 'string' because typeof null === 'object'
      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const typeErrors = result.errors.filter(
        e => e.type === 'invalid_type' && e.property === 'url'
      );
      expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should handle undefined values by treating them as missing from config', () => {
      const properties = [prop({ name: 'url', required: true })];
      // undefined properties are not enumerable in Object.entries
      const config = { url: undefined };

      // 'url' in config is true even for undefined, so required check passes
      const result = ConfigValidator.validate('nodes-base.generic', config, properties);

      const missingErrors = result.errors.filter(e => e.type === 'missing_required');
      expect(missingErrors).toHaveLength(0);
    });

    it('should produce a valid=true result when there are only warnings', () => {
      const properties: any[] = [];
      const config = { method: 'POST', url: 'https://api.example.com' };

      const result = ConfigValidator.validate('nodes-base.httpRequest', config, properties);

      // There will be warnings (missing body for POST) but no errors about required fields
      // valid should still be true since it is based on errors only
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return the correct structure in all cases', () => {
      const result = ConfigValidator.validate('nodes-base.generic', {}, []);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('visibleProperties');
      expect(result).toHaveProperty('hiddenProperties');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.visibleProperties)).toBe(true);
      expect(Array.isArray(result.hiddenProperties)).toBe(true);
    });

    it('should not return autofix when there are no node-specific fixes', () => {
      const result = ConfigValidator.validate('nodes-base.generic', {}, []);

      expect(result.autofix).toBeUndefined();
    });

    it('should handle properties with no name gracefully', () => {
      // Edge case: malformed property objects
      const properties = [{ required: true }] as any;
      const config = {};

      // The code accesses prop.name which would be undefined
      // Should not throw
      expect(() => ConfigValidator.validate('nodes-base.generic', config, properties)).not.toThrow();
    });

    it('should handle unknown node types gracefully', () => {
      const properties = [prop({ name: 'field', required: true })];
      const config = {};

      const result = ConfigValidator.validate('nodes-base.unknown', config, properties);

      // Should still perform base validation
      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('missing_required');
    });
  });
});
