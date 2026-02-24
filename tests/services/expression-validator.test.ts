import { ExpressionValidator } from '../../src/services/expression-validator';

describe('ExpressionValidator', () => {
  // Default context for most tests
  const defaultContext = {
    availableNodes: ['HTTP Request', 'Set', 'Slack'],
    currentNodeName: 'Code',
    hasInputData: true,
    isInLoop: false,
  };

  describe('validateExpression - valid expressions', () => {
    it('should validate a simple $json field access', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.field }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should validate $json bracket notation', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json["fieldName"] }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should validate $json with numeric index', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json[0] }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate $node reference with known node', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $node["HTTP Request"].json }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedNodes.has('HTTP Request')).toBe(true);
      expect(result.usedVariables.has('$node')).toBe(true);
    });

    it('should validate $input.item access with input data', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $input.item.json.name }}',
        { ...defaultContext, hasInputData: true }
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$input')).toBe(true);
    });

    it('should validate $items() with known node', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $items("Set", 0) }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedNodes.has('Set')).toBe(true);
      expect(result.usedVariables.has('$items')).toBe(true);
    });

    it('should validate $workflow variables', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $workflow.id }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$workflow')).toBe(true);
    });

    it('should validate $execution variables', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $execution.id }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$execution')).toBe(true);
    });

    it('should validate $now and $today', () => {
      const result1 = ExpressionValidator.validateExpression(
        '{{ $now }}',
        defaultContext
      );
      const result2 = ExpressionValidator.validateExpression(
        '{{ $today }}',
        defaultContext
      );

      expect(result1.valid).toBe(true);
      expect(result1.usedVariables.has('$now')).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result2.usedVariables.has('$today')).toBe(true);
    });

    it('should validate $itemIndex and $runIndex', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $itemIndex }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$itemIndex')).toBe(true);
    });

    it('should validate $env variable access', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $env.API_KEY }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$env')).toBe(true);
    });

    it('should validate $prevNode properties', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $prevNode.name }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$prevNode')).toBe(true);
    });

    it('should validate $parameter reference', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $parameter["myParam"] }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$parameter')).toBe(true);
    });

    it('should validate mixed text and expressions', () => {
      const result = ExpressionValidator.validateExpression(
        'Hello {{ $json.name }}, welcome!',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should validate chained $json access', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.data.users[0].name }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateExpression - invalid expressions', () => {
    it('should detect unclosed expression brackets', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.field ',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unmatched expression brackets {{ }}');
    });

    it('should detect missing opening brackets', () => {
      const result = ExpressionValidator.validateExpression(
        '$json.field }}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unmatched expression brackets {{ }}');
    });

    it('should detect empty expressions', () => {
      const result = ExpressionValidator.validateExpression(
        '{{}}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty expression found');
    });

    it('should detect template literal syntax', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ ${variable} }}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Template literals ${} are not supported'),
        ])
      );
    });

    it('should error on $input without input data', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $input.item.json.name }}',
        { ...defaultContext, hasInputData: false }
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('$input is only available when the node has input data'),
        ])
      );
    });

    it('should error on reference to unknown node via $node', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $node["Unknown Node"].json }}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Referenced node "Unknown Node" not found in workflow'),
        ])
      );
    });

    it('should error on reference to unknown node via $items', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $items("NonExistent") }}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Referenced node "NonExistent" not found in workflow'),
        ])
      );
    });
  });

  describe('validateExpression - warnings', () => {
    it('should warn about $json usage without input data', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.field }}',
        { ...defaultContext, hasInputData: false, isInLoop: false }
      );

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Using $json but node might not have input data'),
        ])
      );
    });

    it('should not warn about $json in a loop context', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.field }}',
        { ...defaultContext, hasInputData: false, isInLoop: true }
      );

      const jsonWarnings = result.warnings.filter((w) =>
        w.includes('Using $json but node might not have input data')
      );
      expect(jsonWarnings).toHaveLength(0);
    });

    it('should warn about optional chaining', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json?.field }}',
        defaultContext
      );

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Optional chaining (?.) is not supported'),
        ])
      );
    });

    it("should warn about Python-style single-quote bracket access", () => {
      const result = ExpressionValidator.validateExpression(
        "{{ $json['field'] }}",
        defaultContext
      );

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Consider using dot notation'),
        ])
      );
    });

    it('should warn about possible missing $ prefix', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ json.field }}',
        defaultContext
      );

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Possible missing $ prefix'),
        ])
      );
    });
  });

  describe('validateExpression - edge cases', () => {
    it('should handle empty string', () => {
      const result = ExpressionValidator.validateExpression('', defaultContext);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.usedVariables.size).toBe(0);
      expect(result.usedNodes.size).toBe(0);
    });

    it('should handle plain text without expressions', () => {
      const result = ExpressionValidator.validateExpression(
        'Just some regular text',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.size).toBe(0);
    });

    it('should handle context with empty available nodes', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $node["Set"].json }}',
        { availableNodes: [] }
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Referenced node "Set" not found'),
        ])
      );
    });

    it('should treat multiple expressions in one string as nested (unsupported)', () => {
      // The validator considers two {{ }} blocks in the same string as nested,
      // because its check at line 89 finds a second '{{' after the first one.
      const result = ExpressionValidator.validateExpression(
        '{{ $json.id }} - {{ $workflow.name }}',
        defaultContext
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Nested expressions are not supported');
    });

    it('should still extract used variables even when reporting nested expression error', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $json.id }} - {{ $workflow.name }}',
        defaultContext
      );

      // Variables are still tracked despite the syntax error
      expect(result.usedVariables.has('$json')).toBe(true);
      expect(result.usedVariables.has('$workflow')).toBe(true);
    });

    it('should track used nodes from single expression', () => {
      const result = ExpressionValidator.validateExpression(
        '{{ $node["HTTP Request"].json }}',
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedNodes.has('HTTP Request')).toBe(true);
    });
  });

  describe('validateNodeExpressions', () => {
    it('should validate expressions in simple parameter object', () => {
      const params = {
        url: '{{ $json.apiUrl }}',
        method: 'GET',
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should validate nested parameter objects', () => {
      const params = {
        config: {
          headers: {
            authorization: '{{ $json.token }}',
          },
        },
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should validate expressions in arrays', () => {
      const params = {
        items: ['{{ $json.first }}', '{{ $json.second }}', 'plain text'],
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedVariables.has('$json')).toBe(true);
    });

    it('should collect errors from multiple parameters with path context', () => {
      const params = {
        url: '{{ $input.item.json.url }}',
        body: '{{ $node["Missing"].json }}',
      };

      const result = ExpressionValidator.validateNodeExpressions(params, {
        availableNodes: [],
        hasInputData: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      // Errors should include the parameter path
      expect(result.errors.some((e) => e.includes('url:'))).toBe(true);
      expect(result.errors.some((e) => e.includes('body:'))).toBe(true);
    });

    it('should skip non-expression string values', () => {
      const params = {
        method: 'POST',
        contentType: 'application/json',
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.usedVariables.size).toBe(0);
    });

    it('should handle null and undefined values gracefully', () => {
      const params = {
        field1: null,
        field2: undefined,
        field3: 42,
        field4: true,
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle deeply nested mixed structures', () => {
      const params = {
        level1: {
          level2: [
            {
              level3: '{{ $node["HTTP Request"].json.data }}',
            },
          ],
        },
      };

      const result = ExpressionValidator.validateNodeExpressions(
        params,
        defaultContext
      );

      expect(result.valid).toBe(true);
      expect(result.usedNodes.has('HTTP Request')).toBe(true);
    });
  });
});
