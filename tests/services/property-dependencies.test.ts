import { PropertyDependencies } from '../../src/services/property-dependencies';

// Mock Logger — PropertyDependencies is a pure analysis service, but mock
// the logger module in case it is ever imported transitively.
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Test helpers — reusable property builders
// ---------------------------------------------------------------------------

/** Minimal property with no display options (always visible). */
function baseProp(name: string, overrides: Record<string, any> = {}): any {
  return { name, displayName: name, type: 'string', ...overrides };
}

/** Property that is only shown when `controlProp` equals one of `values`. */
function showWhenProp(
  name: string,
  controlProp: string,
  values: any[],
  extra: Record<string, any> = {},
): any {
  return {
    name,
    displayName: name,
    type: 'string',
    displayOptions: { show: { [controlProp]: values } },
    ...extra,
  };
}

/** Property that is hidden when `controlProp` equals one of `values`. */
function hideWhenProp(
  name: string,
  controlProp: string,
  values: any[],
  extra: Record<string, any> = {},
): any {
  return {
    name,
    displayName: name,
    type: 'string',
    displayOptions: { hide: { [controlProp]: values } },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropertyDependencies', () => {
  // =========================================================================
  // 1. analyze() — Property visibility analysis
  // =========================================================================
  describe('analyze - property visibility analysis', () => {
    it('should return correct total property count', () => {
      const properties = [
        baseProp('operation'),
        baseProp('resource'),
        showWhenProp('userId', 'operation', ['getUser']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.totalProperties).toBe(3);
    });

    it('should count properties with dependencies', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('userId', 'operation', ['getUser']),
        showWhenProp('email', 'operation', ['sendEmail']),
        baseProp('timeout'),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.propertiesWithDependencies).toBe(2);
    });

    it('should extract show-condition dependencies', () => {
      const properties = [
        baseProp('resource', { displayName: 'Resource' }),
        showWhenProp('channelId', 'resource', ['channel']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies).toHaveLength(1);
      const dep = result.dependencies[0];
      expect(dep.property).toBe('channelId');
      expect(dep.dependsOn).toHaveLength(1);
      expect(dep.dependsOn[0].property).toBe('resource');
      expect(dep.dependsOn[0].values).toEqual(['channel']);
      expect(dep.dependsOn[0].condition).toBe('equals');
      expect(dep.showWhen).toEqual({ resource: ['channel'] });
    });

    it('should extract hide-condition dependencies', () => {
      const properties = [
        baseProp('operation'),
        hideWhenProp('advancedField', 'operation', ['simple']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies).toHaveLength(1);
      const dep = result.dependencies[0];
      expect(dep.dependsOn[0].condition).toBe('not_equals');
      expect(dep.hideWhen).toEqual({ operation: ['simple'] });
    });

    it('should handle combined show and hide conditions on the same property', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        {
          name: 'complexField',
          displayName: 'Complex Field',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'] },
            hide: { operation: ['delete'] },
          },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies).toHaveLength(1);
      const dep = result.dependencies[0];
      expect(dep.dependsOn).toHaveLength(2);

      const showCondition = dep.dependsOn.find((d) => d.condition === 'equals');
      const hideCondition = dep.dependsOn.find((d) => d.condition === 'not_equals');
      expect(showCondition?.property).toBe('resource');
      expect(hideCondition?.property).toBe('operation');
    });

    it('should use displayName when available', () => {
      const properties = [
        baseProp('op', { displayName: 'Operation' }),
        showWhenProp('body', 'op', ['create'], { displayName: 'Body' }),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies[0].displayName).toBe('Body');
    });

    it('should fall back to property name when displayName is absent', () => {
      const properties = [
        { name: 'op', type: 'string' },
        {
          name: 'body',
          type: 'string',
          displayOptions: { show: { op: ['create'] } },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies[0].displayName).toBe('body');
    });

    it('should populate enablesProperties for controlling properties', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('userId', 'operation', ['getUser']),
        showWhenProp('email', 'operation', ['sendEmail']),
      ];

      const result = PropertyDependencies.analyze(properties);

      // The 'operation' property is in the dependency graph as a controller
      expect(result.dependencyGraph['operation']).toEqual(
        expect.arrayContaining(['userId', 'email']),
      );
    });
  });

  // =========================================================================
  // 2. Display condition evaluation (generateConditionDescription)
  // =========================================================================
  describe('analyze - display condition descriptions', () => {
    it('should generate singular show description', () => {
      const properties = [
        baseProp('resource', { displayName: 'Resource' }),
        showWhenProp('channelId', 'resource', ['channel']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Visible when Resource is set to "channel"');
    });

    it('should generate plural show description for multiple values', () => {
      const properties = [
        baseProp('resource', { displayName: 'Resource' }),
        showWhenProp('sharedField', 'resource', ['channel', 'message']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Visible when Resource is one of: "channel", "message"');
    });

    it('should generate singular hide description', () => {
      const properties = [
        baseProp('mode', { displayName: 'Mode' }),
        hideWhenProp('detail', 'mode', ['simple']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Hidden when Mode is set to "simple"');
    });

    it('should generate plural hide description for multiple values', () => {
      const properties = [
        baseProp('mode', { displayName: 'Mode' }),
        hideWhenProp('detail', 'mode', ['simple', 'basic']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Hidden when Mode is one of: "simple", "basic"');
    });

    it('should fall back to property key when controlling property has no displayName', () => {
      const properties = [
        { name: 'unknownCtrl', type: 'string' },
        showWhenProp('dependent', 'unknownCtrl', ['yes']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Visible when unknownCtrl is set to "yes"');
    });

    it('should use property key when controlling property is not in the property list', () => {
      // The controlling property might not exist in the array (e.g., nested)
      const properties = [
        showWhenProp('orphan', 'missingProp', ['val']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const desc = result.dependencies[0].dependsOn[0].description;

      expect(desc).toBe('Visible when missingProp is set to "val"');
    });

    it('should normalise non-array values to arrays', () => {
      // In the source code, displayOptions.show values can be a single value
      // instead of an array; extractDependency wraps it in an array.
      const properties = [
        baseProp('resource'),
        {
          name: 'field',
          displayName: 'Field',
          type: 'string',
          displayOptions: { show: { resource: 'user' } },  // single value, not array
        },
      ];

      const result = PropertyDependencies.analyze(properties);
      const dep = result.dependencies[0];

      expect(dep.dependsOn[0].values).toEqual(['user']);
      expect(dep.dependsOn[0].description).toBe('Visible when resource is set to "user"');
    });
  });

  // =========================================================================
  // 3. Dependency graph building
  // =========================================================================
  describe('analyze - dependency graph building', () => {
    it('should build correct dependency graph from show conditions', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('body', 'operation', ['create']),
        showWhenProp('id', 'operation', ['get', 'update', 'delete']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencyGraph).toEqual({
        operation: ['body', 'id'],
      });
    });

    it('should build dependency graph from multiple controller properties', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        {
          name: 'messageBody',
          displayName: 'Message Body',
          type: 'string',
          displayOptions: {
            show: { resource: ['message'], operation: ['send'] },
          },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencyGraph['resource']).toContain('messageBody');
      expect(result.dependencyGraph['operation']).toContain('messageBody');
    });

    it('should include hide-condition controllers in the graph', () => {
      const properties = [
        baseProp('mode'),
        hideWhenProp('advanced', 'mode', ['simple']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencyGraph['mode']).toEqual(['advanced']);
    });

    it('should accumulate dependents when multiple properties depend on the same controller', () => {
      const properties = [
        baseProp('type'),
        showWhenProp('a', 'type', ['x']),
        showWhenProp('b', 'type', ['y']),
        showWhenProp('c', 'type', ['x', 'z']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencyGraph['type']).toEqual(['a', 'b', 'c']);
    });
  });

  // =========================================================================
  // 4. Suggestions generation
  // =========================================================================
  describe('analyze - suggestions', () => {
    it('should suggest key properties to configure first', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('a', 'operation', ['x']),
        showWhenProp('b', 'operation', ['y']),
        showWhenProp('c', 'operation', ['z']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Key properties to configure first'),
        ]),
      );
      expect(result.suggestions[0]).toContain('operation');
    });

    it('should suggest caution for properties with multiple dependencies', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        {
          name: 'complex',
          displayName: 'Complex',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'], operation: ['create'] },
          },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('multiple dependencies'),
        ]),
      );
    });

    it('should detect circular dependencies', () => {
      // Property A depends on B, property B depends on A
      const properties = [
        {
          name: 'alpha',
          displayName: 'Alpha',
          type: 'string',
          displayOptions: { show: { beta: ['yes'] } },
        },
        {
          name: 'beta',
          displayName: 'Beta',
          type: 'string',
          displayOptions: { show: { alpha: ['yes'] } },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Circular dependency detected'),
        ]),
      );
    });

    it('should report the specific properties involved in a circular dependency', () => {
      const properties = [
        {
          name: 'x',
          displayName: 'X',
          type: 'string',
          displayOptions: { show: { y: ['1'] } },
        },
        {
          name: 'y',
          displayName: 'Y',
          type: 'string',
          displayOptions: { show: { x: ['2'] } },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      const circularSuggestions = result.suggestions.filter((s) =>
        s.includes('Circular dependency'),
      );
      expect(circularSuggestions.length).toBeGreaterThanOrEqual(1);
      // At least one message should mention both properties
      const combined = circularSuggestions.join(' ');
      expect(combined).toContain('x');
      expect(combined).toContain('y');
    });

    it('should not generate circular dependency suggestion when there is none', () => {
      const properties = [
        baseProp('controller'),
        showWhenProp('dependent', 'controller', ['val']),
      ];

      const result = PropertyDependencies.analyze(properties);

      const circularSuggestions = result.suggestions.filter((s) =>
        s.includes('Circular dependency'),
      );
      expect(circularSuggestions).toHaveLength(0);
    });

    it('should limit key-property suggestions to top 3', () => {
      // Create 5 distinct controllers
      const properties = [
        baseProp('c1'),
        baseProp('c2'),
        baseProp('c3'),
        baseProp('c4'),
        baseProp('c5'),
        showWhenProp('d1', 'c1', ['a']),
        showWhenProp('d2', 'c1', ['b']),
        showWhenProp('d3', 'c1', ['c']),
        showWhenProp('d4', 'c2', ['a']),
        showWhenProp('d5', 'c2', ['b']),
        showWhenProp('d6', 'c3', ['a']),
        showWhenProp('d7', 'c4', ['a']),
        showWhenProp('d8', 'c5', ['a']),
      ];

      const result = PropertyDependencies.analyze(properties);

      const keyPropSuggestion = result.suggestions.find((s) =>
        s.includes('Key properties to configure first'),
      );
      expect(keyPropSuggestion).toBeDefined();

      // The suggestion text lists at most 3 controllers
      // c1 has 3 deps, c2 has 2 deps, c3/c4/c5 have 1 each — top 3 = c1, c2, c3 (or c4/c5 tied)
      const colonIndex = keyPropSuggestion!.indexOf(':');
      const listedProps = keyPropSuggestion!.slice(colonIndex + 1).split(',');
      expect(listedProps.length).toBeLessThanOrEqual(3);
    });

    it('should sort key properties by number of dependents (descending)', () => {
      const properties = [
        baseProp('minor'),
        baseProp('major'),
        showWhenProp('a', 'major', ['1']),
        showWhenProp('b', 'major', ['2']),
        showWhenProp('c', 'major', ['3']),
        showWhenProp('d', 'minor', ['x']),
      ];

      const result = PropertyDependencies.analyze(properties);

      const keyPropSuggestion = result.suggestions.find((s) =>
        s.includes('Key properties to configure first'),
      );
      expect(keyPropSuggestion).toBeDefined();
      // 'major' should appear before 'minor'
      const majorIdx = keyPropSuggestion!.indexOf('major');
      const minorIdx = keyPropSuggestion!.indexOf('minor');
      expect(majorIdx).toBeLessThan(minorIdx);
    });
  });

  // =========================================================================
  // 5. Notes generation
  // =========================================================================
  describe('analyze - notes', () => {
    it('should add nested-properties note for collection type', () => {
      const properties = [
        baseProp('resource'),
        showWhenProp('options', 'resource', ['user'], { type: 'collection' }),
      ];

      const result = PropertyDependencies.analyze(properties);
      const notes = result.dependencies[0].notes;

      expect(notes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('nested properties'),
        ]),
      );
    });

    it('should add nested-properties note for fixedCollection type', () => {
      const properties = [
        baseProp('resource'),
        showWhenProp('groups', 'resource', ['org'], { type: 'fixedCollection' }),
      ];

      const result = PropertyDependencies.analyze(properties);
      const notes = result.dependencies[0].notes;

      expect(notes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('nested properties'),
        ]),
      );
    });

    it('should add multiple-conditions note when dependsOn has more than one entry', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        {
          name: 'multiDep',
          displayName: 'Multi Dep',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'], operation: ['create'] },
          },
        },
      ];

      const result = PropertyDependencies.analyze(properties);
      const dep = result.dependencies[0];

      expect(dep.notes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Multiple conditions'),
        ]),
      );
    });

    it('should not add multiple-conditions note when only one dependency', () => {
      const properties = [
        baseProp('resource'),
        showWhenProp('field', 'resource', ['user']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const dep = result.dependencies[0];

      const multiNotes = (dep.notes || []).filter((n) =>
        n.includes('Multiple conditions'),
      );
      expect(multiNotes).toHaveLength(0);
    });

    it('should not add nested-properties note for regular string type', () => {
      const properties = [
        baseProp('resource'),
        showWhenProp('field', 'resource', ['user']),
      ];

      const result = PropertyDependencies.analyze(properties);
      const dep = result.dependencies[0];

      const nestedNotes = (dep.notes || []).filter((n) =>
        n.includes('nested properties'),
      );
      expect(nestedNotes).toHaveLength(0);
    });
  });

  // =========================================================================
  // 6. getVisibilityImpact()
  // =========================================================================
  describe('getVisibilityImpact', () => {
    it('should mark properties without displayOptions as visible', () => {
      const properties = [baseProp('alwaysVisible')];

      const result = PropertyDependencies.getVisibilityImpact(properties, {});

      expect(result.visible).toContain('alwaysVisible');
      expect(result.hidden).not.toContain('alwaysVisible');
    });

    it('should mark property as visible when show condition is met', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('body', 'operation', ['create']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        operation: 'create',
      });

      expect(result.visible).toContain('body');
    });

    it('should mark property as hidden when show condition is not met', () => {
      const properties = [
        baseProp('operation'),
        showWhenProp('body', 'operation', ['create']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        operation: 'delete',
      });

      expect(result.hidden).toContain('body');
    });

    it('should provide reason when property is hidden by show condition', () => {
      const properties = [
        showWhenProp('field', 'mode', ['advanced']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        mode: 'simple',
      });

      expect(result.reasons['field']).toContain('mode');
      expect(result.reasons['field']).toContain('simple');
    });

    it('should mark property as hidden when hide condition is met', () => {
      const properties = [
        hideWhenProp('detail', 'mode', ['simple']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        mode: 'simple',
      });

      expect(result.hidden).toContain('detail');
    });

    it('should mark property as visible when hide condition is not met', () => {
      const properties = [
        hideWhenProp('detail', 'mode', ['simple']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        mode: 'advanced',
      });

      expect(result.visible).toContain('detail');
    });

    it('should provide reason when property is hidden by hide condition', () => {
      const properties = [
        hideWhenProp('field', 'mode', ['disabled']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        mode: 'disabled',
      });

      expect(result.reasons['field']).toContain('mode');
      expect(result.reasons['field']).toContain('disabled');
    });

    it('should handle show condition with multiple allowed values', () => {
      const properties = [
        showWhenProp('field', 'type', ['a', 'b', 'c']),
      ];

      const visibleResult = PropertyDependencies.getVisibilityImpact(properties, { type: 'b' });
      expect(visibleResult.visible).toContain('field');

      const hiddenResult = PropertyDependencies.getVisibilityImpact(properties, { type: 'd' });
      expect(hiddenResult.hidden).toContain('field');
    });

    it('should handle hide condition with multiple values', () => {
      const properties = [
        hideWhenProp('field', 'status', ['archived', 'deleted']),
      ];

      const hiddenResult = PropertyDependencies.getVisibilityImpact(properties, {
        status: 'archived',
      });
      expect(hiddenResult.hidden).toContain('field');

      const visibleResult = PropertyDependencies.getVisibilityImpact(properties, {
        status: 'active',
      });
      expect(visibleResult.visible).toContain('field');
    });

    it('should evaluate combined show and hide conditions (show met, hide not met)', () => {
      const properties = [
        {
          name: 'combo',
          displayName: 'Combo',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'] },
            hide: { operation: ['delete'] },
          },
        },
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'user',
        operation: 'create',
      });

      expect(result.visible).toContain('combo');
    });

    it('should evaluate combined show and hide conditions (show met, hide also met)', () => {
      const properties = [
        {
          name: 'combo',
          displayName: 'Combo',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'] },
            hide: { operation: ['delete'] },
          },
        },
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'user',
        operation: 'delete',
      });

      // Hide takes effect even though show is satisfied
      expect(result.hidden).toContain('combo');
    });

    it('should evaluate combined show and hide conditions (show not met)', () => {
      const properties = [
        {
          name: 'combo',
          displayName: 'Combo',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'] },
            hide: { operation: ['delete'] },
          },
        },
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'message',
        operation: 'create',
      });

      expect(result.hidden).toContain('combo');
    });

    it('should handle multiple show conditions (all must match)', () => {
      const properties = [
        {
          name: 'multiShow',
          displayName: 'Multi Show',
          type: 'string',
          displayOptions: {
            show: { resource: ['user'], operation: ['create'] },
          },
        },
      ];

      // Both matched
      const allMatch = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'user',
        operation: 'create',
      });
      expect(allMatch.visible).toContain('multiShow');

      // Only one matched
      const partialMatch = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'user',
        operation: 'delete',
      });
      expect(partialMatch.hidden).toContain('multiShow');
    });

    it('should handle config values that are undefined', () => {
      const properties = [
        showWhenProp('field', 'operation', ['create']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {});

      // undefined does not match 'create', so hidden
      expect(result.hidden).toContain('field');
      expect(result.reasons['field']).toBeDefined();
    });

    it('should classify all properties across a realistic property set', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        showWhenProp('userId', 'resource', ['user']),
        showWhenProp('channelId', 'resource', ['channel']),
        hideWhenProp('debugInfo', 'operation', ['delete']),
        baseProp('timeout'),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'user',
        operation: 'delete',
      });

      expect(result.visible).toContain('resource');
      expect(result.visible).toContain('operation');
      expect(result.visible).toContain('userId');
      expect(result.visible).toContain('timeout');
      expect(result.hidden).toContain('channelId');
      expect(result.hidden).toContain('debugInfo');
    });

    it('should not include reason for properties that are always visible', () => {
      const properties = [baseProp('noConditions')];

      const result = PropertyDependencies.getVisibilityImpact(properties, {});

      expect(result.reasons['noConditions']).toBeUndefined();
    });
  });

  // =========================================================================
  // 7. Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle empty properties array', () => {
      const result = PropertyDependencies.analyze([]);

      expect(result.totalProperties).toBe(0);
      expect(result.propertiesWithDependencies).toBe(0);
      expect(result.dependencies).toHaveLength(0);
      expect(result.dependencyGraph).toEqual({});
      expect(result.suggestions).toHaveLength(0);
    });

    it('should handle properties with no dependencies', () => {
      const properties = [
        baseProp('field1'),
        baseProp('field2'),
        baseProp('field3'),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.totalProperties).toBe(3);
      expect(result.propertiesWithDependencies).toBe(0);
      expect(result.dependencies).toHaveLength(0);
      expect(result.dependencyGraph).toEqual({});
      expect(result.suggestions).toHaveLength(0);
    });

    it('should handle property with empty displayOptions object', () => {
      const properties = [
        { name: 'field', displayName: 'Field', type: 'string', displayOptions: {} },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.propertiesWithDependencies).toBe(0);
    });

    it('should handle property with displayOptions.show but empty object', () => {
      const properties = [
        {
          name: 'field',
          displayName: 'Field',
          type: 'string',
          displayOptions: { show: {} },
        },
      ];

      // show is truthy but has no entries — the property IS counted as having
      // dependencies (because displayOptions.show is truthy in the outer check),
      // but dependsOn will be empty.
      const result = PropertyDependencies.analyze(properties);

      expect(result.propertiesWithDependencies).toBe(1);
      expect(result.dependencies[0].dependsOn).toHaveLength(0);
    });

    it('should handle deeply nested dependency chains', () => {
      // A -> B -> C -> D (each depends on the previous)
      const properties = [
        baseProp('root'),
        showWhenProp('level1', 'root', ['go']),
        showWhenProp('level2', 'level1', ['go']),
        showWhenProp('level3', 'level2', ['go']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.propertiesWithDependencies).toBe(3);
      expect(result.dependencyGraph['root']).toEqual(['level1']);
      expect(result.dependencyGraph['level1']).toEqual(['level2']);
      expect(result.dependencyGraph['level2']).toEqual(['level3']);
    });

    it('should handle circular dependencies without crashing', () => {
      const properties = [
        {
          name: 'a',
          displayName: 'A',
          type: 'string',
          displayOptions: { show: { b: ['1'] } },
        },
        {
          name: 'b',
          displayName: 'B',
          type: 'string',
          displayOptions: { show: { a: ['1'] } },
        },
      ];

      // Should not throw
      expect(() => PropertyDependencies.analyze(properties)).not.toThrow();

      const result = PropertyDependencies.analyze(properties);
      expect(result.propertiesWithDependencies).toBe(2);
    });

    it('should handle property depending on a non-existent property', () => {
      const properties = [
        showWhenProp('orphan', 'doesNotExist', ['value']),
      ];

      // Should not throw
      expect(() => PropertyDependencies.analyze(properties)).not.toThrow();

      const result = PropertyDependencies.analyze(properties);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencyGraph['doesNotExist']).toEqual(['orphan']);
    });

    it('should handle boolean values in conditions', () => {
      const properties = [
        baseProp('returnAll'),
        showWhenProp('limit', 'returnAll', [false]),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies[0].dependsOn[0].values).toEqual([false]);
    });

    it('should handle numeric values in conditions', () => {
      const properties = [
        baseProp('version'),
        showWhenProp('newFeature', 'version', [2, 3]),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies[0].dependsOn[0].values).toEqual([2, 3]);
    });

    it('should handle getVisibilityImpact with empty properties', () => {
      const result = PropertyDependencies.getVisibilityImpact([], { key: 'val' });

      expect(result.visible).toHaveLength(0);
      expect(result.hidden).toHaveLength(0);
      expect(result.reasons).toEqual({});
    });

    it('should handle getVisibilityImpact with empty config', () => {
      const properties = [
        baseProp('always'),
        showWhenProp('conditional', 'trigger', ['yes']),
      ];

      const result = PropertyDependencies.getVisibilityImpact(properties, {});

      expect(result.visible).toContain('always');
      expect(result.hidden).toContain('conditional');
    });

    it('should handle a large number of properties without errors', () => {
      const properties: any[] = [baseProp('controller')];
      for (let i = 0; i < 100; i++) {
        properties.push(showWhenProp(`field_${i}`, 'controller', [`val_${i}`]));
      }

      const result = PropertyDependencies.analyze(properties);

      expect(result.totalProperties).toBe(101);
      expect(result.propertiesWithDependencies).toBe(100);
      expect(result.dependencyGraph['controller']).toHaveLength(100);
    });

    it('should handle property with only hide displayOptions (no show)', () => {
      const properties = [
        baseProp('mode'),
        {
          name: 'hideOnly',
          displayName: 'Hide Only',
          type: 'string',
          displayOptions: { hide: { mode: ['disabled'] } },
        },
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].showWhen).toBeUndefined();
      expect(result.dependencies[0].hideWhen).toEqual({ mode: ['disabled'] });
    });

    it('should handle property with only show displayOptions (no hide)', () => {
      const properties = [
        baseProp('mode'),
        showWhenProp('showOnly', 'mode', ['enabled']),
      ];

      const result = PropertyDependencies.analyze(properties);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].showWhen).toEqual({ mode: ['enabled'] });
      expect(result.dependencies[0].hideWhen).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Integration / realistic scenarios
  // =========================================================================
  describe('realistic scenarios', () => {
    it('should correctly analyze a Slack-like node property set', () => {
      const properties = [
        baseProp('resource', { displayName: 'Resource', type: 'options' }),
        baseProp('operation', { displayName: 'Operation', type: 'options' }),
        showWhenProp('channelId', 'resource', ['channel', 'message'], {
          displayName: 'Channel',
        }),
        {
          name: 'messageText',
          displayName: 'Message Text',
          type: 'string',
          displayOptions: {
            show: { resource: ['message'], operation: ['send'] },
          },
        },
        hideWhenProp('returnAll', 'operation', ['getAll'], {
          displayName: 'Return All',
          type: 'boolean',
        }),
        showWhenProp('limit', 'returnAll', [false], {
          displayName: 'Limit',
          type: 'number',
        }),
        showWhenProp('additionalFields', 'resource', ['message'], {
          displayName: 'Additional Fields',
          type: 'collection',
        }),
      ];

      const analysis = PropertyDependencies.analyze(properties);

      // Total and dependent counts
      expect(analysis.totalProperties).toBe(7);
      expect(analysis.propertiesWithDependencies).toBe(5);

      // Dependency graph
      expect(analysis.dependencyGraph['resource']).toEqual(
        expect.arrayContaining(['channelId', 'messageText', 'additionalFields']),
      );
      expect(analysis.dependencyGraph['operation']).toEqual(
        expect.arrayContaining(['messageText', 'returnAll']),
      );
      expect(analysis.dependencyGraph['returnAll']).toEqual(['limit']);

      // Collection note
      const additionalFieldsDep = analysis.dependencies.find(
        (d) => d.property === 'additionalFields',
      );
      expect(additionalFieldsDep?.notes).toEqual(
        expect.arrayContaining([expect.stringContaining('nested properties')]),
      );

      // Multiple-condition note on messageText
      const messageTextDep = analysis.dependencies.find(
        (d) => d.property === 'messageText',
      );
      expect(messageTextDep?.notes).toEqual(
        expect.arrayContaining([expect.stringContaining('Multiple conditions')]),
      );

      // Suggestions should mention key properties
      expect(analysis.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Key properties to configure first'),
        ]),
      );
    });

    it('should correctly compute visibility for a Slack-like config', () => {
      const properties = [
        baseProp('resource'),
        baseProp('operation'),
        showWhenProp('channelId', 'resource', ['channel', 'message']),
        {
          name: 'messageText',
          displayName: 'Message Text',
          type: 'string',
          displayOptions: {
            show: { resource: ['message'], operation: ['send'] },
          },
        },
        showWhenProp('userId', 'resource', ['user']),
      ];

      // Config: resource=message, operation=send
      const result = PropertyDependencies.getVisibilityImpact(properties, {
        resource: 'message',
        operation: 'send',
      });

      expect(result.visible).toContain('resource');
      expect(result.visible).toContain('operation');
      expect(result.visible).toContain('channelId');
      expect(result.visible).toContain('messageText');
      expect(result.hidden).toContain('userId');
    });
  });
});
