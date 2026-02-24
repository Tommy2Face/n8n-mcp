import { PropertyFilter, SimplifiedProperty, FilteredProperties } from '../../src/services/property-filter';

/**
 * Mock n8n property structures.
 * These mirror the shape of real n8n node property definitions.
 */
function createMockProperty(overrides: Record<string, any> = {}): any {
  return {
    name: 'testProperty',
    displayName: 'Test Property',
    type: 'string',
    default: '',
    description: 'A test property',
    required: false,
    ...overrides,
  };
}

// Realistic mock of HTTP Request node properties
const httpRequestProperties = [
  createMockProperty({
    name: 'url',
    displayName: 'URL',
    type: 'string',
    description: 'The URL to make the request to',
    required: true,
    placeholder: 'https://api.example.com/endpoint',
  }),
  createMockProperty({
    name: 'method',
    displayName: 'Method',
    type: 'options',
    default: 'GET',
    description: 'HTTP method to use',
    options: [
      { name: 'GET', value: 'GET' },
      { name: 'POST', value: 'POST' },
      { name: 'PUT', value: 'PUT' },
      { name: 'DELETE', value: 'DELETE' },
      { name: 'PATCH', value: 'PATCH' },
    ],
  }),
  createMockProperty({
    name: 'authentication',
    displayName: 'Authentication',
    type: 'options',
    default: 'none',
    description: 'The authentication method to use',
    options: [
      { name: 'None', value: 'none' },
      { name: 'Generic Credential Type', value: 'genericCredentialType' },
      { name: 'Predefined Credential Type', value: 'predefinedCredentialType' },
    ],
  }),
  createMockProperty({
    name: 'sendBody',
    displayName: 'Send Body',
    type: 'boolean',
    default: false,
    description: 'Whether to send a request body',
    displayOptions: {
      show: {
        method: ['POST', 'PUT', 'PATCH'],
      },
    },
  }),
  createMockProperty({
    name: 'contentType',
    displayName: 'Content Type',
    type: 'options',
    default: 'json',
    description: 'Content type of the request body',
    displayOptions: {
      show: {
        sendBody: [true],
      },
    },
    options: [
      { name: 'JSON', value: 'json' },
      { name: 'Form-Urlencoded', value: 'form-urlencoded' },
      { name: 'Multipart Form-Data', value: 'multipart-form-data' },
      { name: 'Raw', value: 'raw' },
    ],
  }),
  createMockProperty({
    name: 'sendHeaders',
    displayName: 'Send Headers',
    type: 'boolean',
    default: false,
    description: 'Whether to send custom headers',
  }),
  createMockProperty({
    name: 'specifyHeaders',
    displayName: 'Specify Headers',
    type: 'options',
    default: 'keypair',
    description: 'How to specify headers',
    displayOptions: {
      show: {
        sendHeaders: [true],
      },
    },
  }),
  createMockProperty({
    name: 'headerParameters',
    displayName: 'Header Parameters',
    type: 'fixedCollection',
    default: {},
    description: 'Custom header parameters',
    displayOptions: {
      show: {
        sendHeaders: [true],
        specifyHeaders: ['keypair'],
      },
    },
    options: [
      {
        name: 'parameters',
        displayName: 'Parameter',
        values: [
          createMockProperty({
            name: 'name',
            displayName: 'Name',
            type: 'string',
            default: '',
            description: 'Header name',
          }),
          createMockProperty({
            name: 'value',
            displayName: 'Value',
            type: 'string',
            default: '',
            description: 'Header value',
          }),
        ],
      },
    ],
  }),
  createMockProperty({
    name: 'options',
    displayName: 'Options',
    type: 'collection',
    default: {},
    description: 'Additional options',
    options: [
      createMockProperty({
        name: 'timeout',
        displayName: 'Timeout',
        type: 'number',
        default: 10000,
        description: 'Request timeout in milliseconds',
      }),
      createMockProperty({
        name: 'redirect',
        displayName: 'Follow Redirects',
        type: 'boolean',
        default: true,
        description: 'Whether to follow redirects',
      }),
    ],
  }),
];

// Properties for an unconfigured/generic node
const genericNodeProperties = [
  createMockProperty({
    name: 'operation',
    displayName: 'Operation',
    type: 'options',
    required: true,
    description: 'The operation to perform',
    options: [
      { name: 'Create', value: 'create' },
      { name: 'Read', value: 'read' },
      { name: 'Update', value: 'update' },
      { name: 'Delete', value: 'delete' },
    ],
  }),
  createMockProperty({
    name: 'resource',
    displayName: 'Resource',
    type: 'options',
    required: true,
    description: 'The resource to operate on',
  }),
  createMockProperty({
    name: 'simpleField',
    displayName: 'Simple Field',
    type: 'string',
    default: '',
    description: 'A simple field',
  }),
  createMockProperty({
    name: 'anotherField',
    displayName: 'Another Field',
    type: 'number',
    default: 0,
    description: 'Another simple field',
  }),
  createMockProperty({
    name: 'conditionalField',
    displayName: 'Conditional Field',
    type: 'string',
    default: '',
    description: 'A conditional field',
    displayOptions: {
      show: {
        operation: ['create'],
      },
    },
  }),
  createMockProperty({
    name: 'multiConditionField',
    displayName: 'Multi Condition Field',
    type: 'string',
    default: '',
    description: 'Field with multiple conditions',
    displayOptions: {
      show: {
        operation: ['create'],
        resource: ['user'],
      },
    },
  }),
  createMockProperty({
    name: 'advancedOptions',
    displayName: 'Advanced Options',
    type: 'collection',
    default: {},
    description: 'Advanced settings',
    options: [
      createMockProperty({
        name: 'nestedProp',
        displayName: 'Nested Property',
        type: 'string',
      }),
    ],
  }),
  createMockProperty({
    name: 'optionsGroup',
    displayName: 'Options Group',
    type: 'fixedCollection',
    default: {},
    description: 'A group of options',
    options: [
      {
        name: 'settings',
        displayName: 'Settings',
        values: [
          createMockProperty({
            name: 'innerProp',
            displayName: 'Inner Property',
            type: 'string',
          }),
        ],
      },
    ],
  }),
];

describe('PropertyFilter', () => {
  describe('getEssentials', () => {
    describe('configured node types', () => {
      it('should return required properties for httpRequest', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        expect(result.required.length).toBeGreaterThan(0);
        expect(result.required.some((p) => p.name === 'url')).toBe(true);
      });

      it('should mark required properties with required=true', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        result.required.forEach((prop) => {
          expect(prop.required).toBe(true);
        });
      });

      it('should return common properties for httpRequest', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        expect(result.common.length).toBeGreaterThan(0);
        const commonNames = result.common.map((p) => p.name);
        expect(commonNames).toContain('method');
        expect(commonNames).toContain('authentication');
      });

      it('should not duplicate properties between required and common', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        const requiredNames = new Set(result.required.map((p) => p.name));
        result.common.forEach((prop) => {
          expect(requiredNames.has(prop.name)).toBe(false);
        });
      });

      it('should return simplified property format', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        const allProps = [...result.required, ...result.common];
        allProps.forEach((prop) => {
          expect(prop).toHaveProperty('name');
          expect(prop).toHaveProperty('displayName');
          expect(prop).toHaveProperty('type');
          expect(prop).toHaveProperty('description');
          expect(typeof prop.name).toBe('string');
          expect(typeof prop.displayName).toBe('string');
          expect(typeof prop.type).toBe('string');
          expect(typeof prop.description).toBe('string');
        });
      });

      it('should include options for select/options-type properties', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        const methodProp = result.common.find((p) => p.name === 'method');
        expect(methodProp).toBeDefined();
        expect(methodProp!.options).toBeDefined();
        expect(methodProp!.options!.length).toBeGreaterThan(0);
        expect(methodProp!.options![0]).toHaveProperty('value');
        expect(methodProp!.options![0]).toHaveProperty('label');
      });

      it('should include placeholder when present', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        const urlProp = result.required.find((p) => p.name === 'url');
        expect(urlProp).toBeDefined();
        expect(urlProp!.placeholder).toBeDefined();
        expect(urlProp!.placeholder).toContain('https://');
      });

      it('should include showWhen for properties with simple display conditions', () => {
        const result = PropertyFilter.getEssentials(
          httpRequestProperties,
          'nodes-base.httpRequest'
        );

        const sendBodyProp = result.common.find((p) => p.name === 'sendBody');
        if (sendBodyProp) {
          expect(sendBodyProp.showWhen).toBeDefined();
        }
      });
    });

    describe('unconfigured node types (inferEssentials fallback)', () => {
      it('should infer required properties for unknown node type', () => {
        const result = PropertyFilter.getEssentials(
          genericNodeProperties,
          'nodes-base.unknownNode'
        );

        expect(result.required.length).toBeGreaterThan(0);
        const requiredNames = result.required.map((p) => p.name);
        expect(requiredNames).toContain('operation');
        expect(requiredNames).toContain('resource');
      });

      it('should infer common properties (simple, always visible, not collection)', () => {
        const result = PropertyFilter.getEssentials(
          genericNodeProperties,
          'nodes-base.unknownNode'
        );

        // Common should have simple properties without displayOptions
        const commonNames = result.common.map((p) => p.name);
        // simpleField and anotherField are simple, no displayOptions, not collection/fixedCollection
        expect(commonNames).toContain('simpleField');
        expect(commonNames).toContain('anotherField');
      });

      it('should not include collection types in common properties', () => {
        const result = PropertyFilter.getEssentials(
          genericNodeProperties,
          'nodes-base.unknownNode'
        );

        result.common.forEach((prop) => {
          expect(prop.type).not.toBe('collection');
          expect(prop.type).not.toBe('fixedCollection');
        });
      });

      it('should limit common properties to 5 or fewer', () => {
        const manyProperties = Array.from({ length: 20 }, (_, i) =>
          createMockProperty({
            name: `field${i}`,
            displayName: `Field ${i}`,
            type: 'string',
          })
        );

        const result = PropertyFilter.getEssentials(
          manyProperties,
          'nodes-base.unknownNode'
        );

        expect(result.common.length).toBeLessThanOrEqual(5);
      });
    });

    describe('empty input', () => {
      it('should handle empty property array', () => {
        const result = PropertyFilter.getEssentials(
          [],
          'nodes-base.httpRequest'
        );

        expect(result.required).toEqual([]);
        expect(result.common).toEqual([]);
      });

      it('should handle empty property array for unknown node type', () => {
        const result = PropertyFilter.getEssentials(
          [],
          'nodes-base.unknownNode'
        );

        expect(result.required).toEqual([]);
        expect(result.common).toEqual([]);
      });
    });
  });

  describe('deduplicateProperties', () => {
    it('should remove exact duplicates', () => {
      const props = [
        createMockProperty({ name: 'url' }),
        createMockProperty({ name: 'url' }),
        createMockProperty({ name: 'method' }),
      ];

      const result = PropertyFilter.deduplicateProperties(props);

      expect(result).toHaveLength(2);
      expect(result.map((p: any) => p.name)).toEqual(['url', 'method']);
    });

    it('should keep properties with same name but different displayOptions', () => {
      const props = [
        createMockProperty({
          name: 'query',
          displayOptions: { show: { operation: ['select'] } },
        }),
        createMockProperty({
          name: 'query',
          displayOptions: { show: { operation: ['insert'] } },
        }),
      ];

      const result = PropertyFilter.deduplicateProperties(props);

      // Different displayOptions means different conditions, so both should be kept
      expect(result).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = PropertyFilter.deduplicateProperties([]);

      expect(result).toEqual([]);
    });

    it('should handle single property', () => {
      const props = [createMockProperty({ name: 'url' })];

      const result = PropertyFilter.deduplicateProperties(props);

      expect(result).toHaveLength(1);
    });
  });

  describe('searchProperties', () => {
    it('should find properties by exact name match (highest score)', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'url'
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('url');
    });

    it('should find properties by name prefix', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'send'
      );

      expect(results.length).toBeGreaterThan(0);
      const resultNames = results.map((p) => p.name);
      expect(resultNames).toContain('sendBody');
      expect(resultNames).toContain('sendHeaders');
    });

    it('should find properties by name substring', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'auth'
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.name === 'authentication')).toBe(true);
    });

    it('should find properties by displayName', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'method'
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.name === 'method')).toBe(true);
    });

    it('should find properties by description content', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'timeout'
      );

      expect(results.length).toBeGreaterThan(0);
      // timeout is nested inside options collection
      expect(results.some((p) => p.name === 'timeout')).toBe(true);
    });

    it('should respect maxResults limit', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'e', // very broad query that matches many properties
        3
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for no matches', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'xyznonexistent'
      );

      expect(results).toEqual([]);
    });

    it('should search nested collection properties', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'timeout'
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.name === 'timeout')).toBe(true);
    });

    it('should search nested fixedCollection properties', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'name' // 'name' property inside headerParameters fixedCollection
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const resultsLower = PropertyFilter.searchProperties(
        httpRequestProperties,
        'url'
      );
      const resultsUpper = PropertyFilter.searchProperties(
        httpRequestProperties,
        'URL'
      );

      expect(resultsLower.length).toBe(resultsUpper.length);
      expect(resultsLower[0].name).toBe(resultsUpper[0].name);
    });

    it('should rank exact matches higher than substring matches', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'url'
      );

      // The exact match 'url' should come first
      if (results.length > 1) {
        expect(results[0].name).toBe('url');
      }
    });

    it('should handle empty property array', () => {
      const results = PropertyFilter.searchProperties([], 'url');

      expect(results).toEqual([]);
    });

    it('should use default maxResults of 20', () => {
      // Create many properties that match
      const manyProperties = Array.from({ length: 30 }, (_, i) =>
        createMockProperty({
          name: `field_test_${i}`,
          displayName: `Test Field ${i}`,
          description: `A test field number ${i}`,
        })
      );

      const results = PropertyFilter.searchProperties(manyProperties, 'test');

      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('should return simplified property objects', () => {
      const results = PropertyFilter.searchProperties(
        httpRequestProperties,
        'url'
      );

      expect(results.length).toBeGreaterThan(0);
      const prop = results[0];
      expect(prop).toHaveProperty('name');
      expect(prop).toHaveProperty('displayName');
      expect(prop).toHaveProperty('type');
      expect(prop).toHaveProperty('description');
    });
  });

  describe('simplifyProperty (via getEssentials)', () => {
    it('should generate usage hint for URL properties', () => {
      const result = PropertyFilter.getEssentials(
        httpRequestProperties,
        'nodes-base.httpRequest'
      );

      const urlProp = result.required.find((p) => p.name === 'url');
      expect(urlProp).toBeDefined();
      expect(urlProp!.usageHint).toContain('https://');
    });

    it('should generate usage hint for authentication properties', () => {
      const result = PropertyFilter.getEssentials(
        httpRequestProperties,
        'nodes-base.httpRequest'
      );

      const authProp = result.common.find((p) => p.name === 'authentication');
      expect(authProp).toBeDefined();
      expect(authProp!.usageHint).toContain('authentication');
    });

    it('should generate usage hint for boolean properties with displayOptions', () => {
      const result = PropertyFilter.getEssentials(
        httpRequestProperties,
        'nodes-base.httpRequest'
      );

      const sendBodyProp = result.common.find((p) => p.name === 'sendBody');
      if (sendBodyProp) {
        expect(sendBodyProp.usageHint).toContain('additional options');
      }
    });

    it('should include default values for simple types', () => {
      const result = PropertyFilter.getEssentials(
        httpRequestProperties,
        'nodes-base.httpRequest'
      );

      const methodProp = result.common.find((p) => p.name === 'method');
      expect(methodProp).toBeDefined();
      expect(methodProp!.default).toBe('GET');
    });

    it('should use displayName from property when available', () => {
      const result = PropertyFilter.getEssentials(
        httpRequestProperties,
        'nodes-base.httpRequest'
      );

      const urlProp = result.required.find((p) => p.name === 'url');
      expect(urlProp).toBeDefined();
      expect(urlProp!.displayName).toBe('URL');
    });

    it('should extract description from multiple possible fields', () => {
      // Property with only a hint, no description
      const propsWithHint = [
        createMockProperty({
          name: 'testField',
          description: undefined,
          hint: 'This is a hint',
        }),
      ];

      const result = PropertyFilter.getEssentials(
        propsWithHint,
        'nodes-base.unknownNode'
      );

      // The inferred essentials should pick up the hint as description
      const allProps = [...result.required, ...result.common];
      if (allProps.length > 0) {
        const testProp = allProps.find((p) => p.name === 'testField');
        if (testProp) {
          expect(testProp.description).toBeTruthy();
        }
      }
    });
  });

  describe('findPropertyByName (via getEssentials)', () => {
    it('should find properties in nested collections', () => {
      // The timeout property is inside the options collection
      const propsWithNested = [
        createMockProperty({
          name: 'options',
          type: 'collection',
          options: [
            createMockProperty({
              name: 'deepProp',
              displayName: 'Deep Property',
              type: 'string',
              description: 'A deeply nested property',
            }),
          ],
        }),
      ];

      // Create a config that references the nested prop
      const result = PropertyFilter.searchProperties(
        propsWithNested,
        'deepProp'
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('deepProp');
    });

    it('should find properties in nested fixedCollection values', () => {
      const propsWithFixedCollection = [
        createMockProperty({
          name: 'headerParams',
          type: 'fixedCollection',
          options: [
            {
              name: 'parameters',
              displayName: 'Parameters',
              values: [
                createMockProperty({
                  name: 'headerName',
                  displayName: 'Header Name',
                  type: 'string',
                  description: 'Name of the HTTP header',
                }),
              ],
            },
          ],
        }),
      ];

      const result = PropertyFilter.searchProperties(
        propsWithFixedCollection,
        'headerName'
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('headerName');
    });
  });

  describe('integration: configured node types coverage', () => {
    // Verify that the ESSENTIAL_PROPERTIES configuration for known nodes
    // works correctly when real-ish properties are provided

    it('should handle webhook node properties', () => {
      const webhookProps = [
        createMockProperty({ name: 'httpMethod', displayName: 'HTTP Method', type: 'options' }),
        createMockProperty({ name: 'path', displayName: 'Path', type: 'string' }),
        createMockProperty({ name: 'responseMode', displayName: 'Response Mode', type: 'options' }),
        createMockProperty({ name: 'responseData', displayName: 'Response Data', type: 'options' }),
        createMockProperty({ name: 'responseCode', displayName: 'Response Code', type: 'number' }),
      ];

      const result = PropertyFilter.getEssentials(
        webhookProps,
        'nodes-base.webhook'
      );

      // webhook has no required in config
      expect(result.required).toHaveLength(0);
      expect(result.common.length).toBeGreaterThan(0);
    });

    it('should handle code node properties', () => {
      const codeProps = [
        createMockProperty({ name: 'language', displayName: 'Language', type: 'options' }),
        createMockProperty({ name: 'jsCode', displayName: 'JavaScript Code', type: 'code' }),
        createMockProperty({ name: 'pythonCode', displayName: 'Python Code', type: 'code' }),
        createMockProperty({ name: 'mode', displayName: 'Mode', type: 'options' }),
      ];

      const result = PropertyFilter.getEssentials(
        codeProps,
        'nodes-base.code'
      );

      expect(result.required).toHaveLength(0);
      expect(result.common.length).toBeGreaterThan(0);
      const commonNames = result.common.map((p) => p.name);
      expect(commonNames).toContain('language');
      expect(commonNames).toContain('jsCode');
    });

    it('should handle postgres node properties', () => {
      const postgresProps = [
        createMockProperty({ name: 'operation', displayName: 'Operation', type: 'options' }),
        createMockProperty({ name: 'table', displayName: 'Table', type: 'string' }),
        createMockProperty({ name: 'query', displayName: 'Query', type: 'string' }),
        createMockProperty({
          name: 'additionalFields',
          displayName: 'Additional Fields',
          type: 'collection',
          options: [],
        }),
        createMockProperty({ name: 'returnAll', displayName: 'Return All', type: 'boolean' }),
      ];

      const result = PropertyFilter.getEssentials(
        postgresProps,
        'nodes-base.postgres'
      );

      expect(result.common.length).toBeGreaterThan(0);
      const commonNames = result.common.map((p) => p.name);
      expect(commonNames).toContain('operation');
      expect(commonNames).toContain('table');
      expect(commonNames).toContain('query');
    });
  });
});
