import { TaskTemplates, TaskTemplate } from '../../src/services/task-templates';

describe('TaskTemplates', () => {
  describe('getAllTasks', () => {
    it('should return an array of task names', () => {
      const tasks = TaskTemplates.getAllTasks();

      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('should include known task names', () => {
      const tasks = TaskTemplates.getAllTasks();

      expect(tasks).toContain('get_api_data');
      expect(tasks).toContain('post_json_request');
      expect(tasks).toContain('send_slack_message');
      expect(tasks).toContain('send_email');
      expect(tasks).toContain('query_postgres');
      expect(tasks).toContain('transform_data');
      expect(tasks).toContain('chat_with_ai');
    });

    it('should return only strings', () => {
      const tasks = TaskTemplates.getAllTasks();

      tasks.forEach((task) => {
        expect(typeof task).toBe('string');
        expect(task.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getTaskTemplate', () => {
    it('should return a template for a known task', () => {
      const template = TaskTemplates.getTaskTemplate('get_api_data');

      expect(template).toBeDefined();
      expect(template!.task).toBe('get_api_data');
      expect(template!.nodeType).toBe('nodes-base.httpRequest');
      expect(template!.description).toBeTruthy();
    });

    it('should return undefined for an unknown task', () => {
      const template = TaskTemplates.getTaskTemplate('nonexistent_task');

      expect(template).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const template = TaskTemplates.getTaskTemplate('');

      expect(template).toBeUndefined();
    });

    it('should include all required fields in template', () => {
      const tasks = TaskTemplates.getAllTasks();

      tasks.forEach((taskName) => {
        const template = TaskTemplates.getTaskTemplate(taskName);
        expect(template).toBeDefined();
        expect(template!.task).toBe(taskName);
        expect(typeof template!.description).toBe('string');
        expect(template!.description.length).toBeGreaterThan(0);
        expect(typeof template!.nodeType).toBe('string');
        expect(template!.nodeType.length).toBeGreaterThan(0);
        expect(template!.configuration).toBeDefined();
        expect(typeof template!.configuration).toBe('object');
        expect(Array.isArray(template!.userMustProvide)).toBe(true);
      });
    });

    describe('specific template validation', () => {
      it('should have correct structure for get_api_data', () => {
        const template = TaskTemplates.getTaskTemplate('get_api_data')!;

        expect(template.nodeType).toBe('nodes-base.httpRequest');
        expect(template.configuration.method).toBe('GET');
        expect(template.userMustProvide.length).toBeGreaterThan(0);
        expect(template.userMustProvide[0].property).toBe('url');
      });

      it('should have correct structure for post_json_request', () => {
        const template = TaskTemplates.getTaskTemplate('post_json_request')!;

        expect(template.nodeType).toBe('nodes-base.httpRequest');
        expect(template.configuration.method).toBe('POST');
        expect(template.configuration.sendBody).toBe(true);
        expect(template.configuration.contentType).toBe('json');
        expect(template.userMustProvide.length).toBeGreaterThanOrEqual(2);
        expect(template.notes).toBeDefined();
        expect(template.notes!.length).toBeGreaterThan(0);
      });

      it('should have correct structure for call_api_with_auth', () => {
        const template = TaskTemplates.getTaskTemplate('call_api_with_auth')!;

        expect(template.nodeType).toBe('nodes-base.httpRequest');
        expect(template.configuration.authentication).toBe('genericCredentialType');
        expect(template.configuration.sendHeaders).toBe(true);
        expect(template.userMustProvide.length).toBeGreaterThanOrEqual(3);
      });

      it('should have correct structure for receive_webhook', () => {
        const template = TaskTemplates.getTaskTemplate('receive_webhook')!;

        expect(template.nodeType).toBe('nodes-base.webhook');
        expect(template.configuration.httpMethod).toBe('POST');
        expect(template.configuration.path).toBe('webhook');
        expect(template.notes).toBeDefined();
      });

      it('should have correct structure for query_postgres', () => {
        const template = TaskTemplates.getTaskTemplate('query_postgres')!;

        expect(template.nodeType).toBe('nodes-base.postgres');
        expect(template.configuration.operation).toBe('executeQuery');
        expect(template.userMustProvide.some((p) => p.property === 'query')).toBe(true);
      });

      it('should have correct structure for chat_with_ai', () => {
        const template = TaskTemplates.getTaskTemplate('chat_with_ai')!;

        expect(template.nodeType).toBe('nodes-base.openAi');
        expect(template.configuration.resource).toBe('chat');
        expect(template.configuration.operation).toBe('message');
        expect(template.configuration.modelId).toBeDefined();
      });

      it('should have correct structure for ai_agent_workflow', () => {
        const template = TaskTemplates.getTaskTemplate('ai_agent_workflow')!;

        expect(template.nodeType).toBe('nodes-langchain.agent');
        expect(template.configuration.systemMessage).toBeDefined();
        expect(template.notes).toBeDefined();
      });

      it('should have correct structure for transform_data', () => {
        const template = TaskTemplates.getTaskTemplate('transform_data')!;

        expect(template.nodeType).toBe('nodes-base.code');
        expect(template.configuration.language).toBe('javaScript');
        expect(template.configuration.jsCode).toBeTruthy();
        // transform_data has no user-must-provide since the code template is pre-filled
        expect(template.userMustProvide).toHaveLength(0);
      });

      it('should have correct structure for send_slack_message', () => {
        const template = TaskTemplates.getTaskTemplate('send_slack_message')!;

        expect(template.nodeType).toBe('nodes-base.slack');
        expect(template.configuration.resource).toBe('message');
        expect(template.configuration.operation).toBe('post');
        expect(template.userMustProvide.some((p) => p.property === 'channel')).toBe(true);
        expect(template.userMustProvide.some((p) => p.property === 'text')).toBe(true);
      });

      it('should have correct structure for send_email', () => {
        const template = TaskTemplates.getTaskTemplate('send_email')!;

        expect(template.nodeType).toBe('nodes-base.emailSend');
        expect(template.userMustProvide.length).toBeGreaterThanOrEqual(4);
        expect(
          template.userMustProvide.some((p) => p.property === 'fromEmail')
        ).toBe(true);
        expect(
          template.userMustProvide.some((p) => p.property === 'toEmail')
        ).toBe(true);
        expect(
          template.userMustProvide.some((p) => p.property === 'subject')
        ).toBe(true);
      });

      it('should have correct structure for use_google_sheets_as_tool', () => {
        const template = TaskTemplates.getTaskTemplate('use_google_sheets_as_tool')!;

        expect(template.nodeType).toBe('nodes-base.googleSheets');
        // Should use $fromAI in configuration
        expect(template.configuration.sheetId).toContain('$fromAI');
        expect(template.configuration.range).toContain('$fromAI');
      });

      it('should have correct structure for multi_tool_ai_agent', () => {
        const template = TaskTemplates.getTaskTemplate('multi_tool_ai_agent')!;

        expect(template.nodeType).toBe('nodes-langchain.agent');
        expect(template.configuration.systemMessage).toBeTruthy();
        expect(template.notes).toBeDefined();
        expect(template.notes!.length).toBeGreaterThan(0);
      });
    });

    describe('userMustProvide items have required fields', () => {
      it('should have property and description on all userMustProvide items', () => {
        const tasks = TaskTemplates.getAllTasks();

        tasks.forEach((taskName) => {
          const template = TaskTemplates.getTaskTemplate(taskName)!;
          template.userMustProvide.forEach((item) => {
            expect(typeof item.property).toBe('string');
            expect(item.property.length).toBeGreaterThan(0);
            expect(typeof item.description).toBe('string');
            expect(item.description.length).toBeGreaterThan(0);
          });
        });
      });
    });

    describe('optionalEnhancements have required fields', () => {
      it('should have property and description on all optionalEnhancements', () => {
        const tasks = TaskTemplates.getAllTasks();

        tasks.forEach((taskName) => {
          const template = TaskTemplates.getTaskTemplate(taskName)!;
          if (template.optionalEnhancements) {
            template.optionalEnhancements.forEach((item) => {
              expect(typeof item.property).toBe('string');
              expect(item.property.length).toBeGreaterThan(0);
              expect(typeof item.description).toBe('string');
              expect(item.description.length).toBeGreaterThan(0);
            });
          }
        });
      });
    });
  });

  describe('searchTasks', () => {
    it('should find tasks by task name keyword', () => {
      const results = TaskTemplates.searchTasks('api');

      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('get_api_data');
      expect(results).toContain('call_api_with_auth');
    });

    it('should find tasks by description keyword', () => {
      const results = TaskTemplates.searchTasks('email');

      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('send_email');
    });

    it('should find tasks by node type keyword', () => {
      const results = TaskTemplates.searchTasks('httpRequest');

      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('get_api_data');
      expect(results).toContain('post_json_request');
      expect(results).toContain('call_api_with_auth');
    });

    it('should be case-insensitive', () => {
      const resultsLower = TaskTemplates.searchTasks('slack');
      const resultsUpper = TaskTemplates.searchTasks('SLACK');
      const resultsMixed = TaskTemplates.searchTasks('Slack');

      expect(resultsLower).toEqual(resultsUpper);
      expect(resultsLower).toEqual(resultsMixed);
      expect(resultsLower.length).toBeGreaterThan(0);
    });

    it('should return empty array for unmatched keyword', () => {
      const results = TaskTemplates.searchTasks('xyznonexistent');

      expect(results).toEqual([]);
    });

    it('should find webhook-related tasks', () => {
      const results = TaskTemplates.searchTasks('webhook');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results).toContain('receive_webhook');
      expect(results).toContain('webhook_with_response');
    });

    it('should find AI-related tasks', () => {
      const results = TaskTemplates.searchTasks('ai');

      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('chat_with_ai');
      expect(results).toContain('ai_agent_workflow');
    });

    it('should find database-related tasks', () => {
      const results = TaskTemplates.searchTasks('postgres');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results).toContain('query_postgres');
      expect(results).toContain('insert_postgres_data');
    });

    it('should match partial words in descriptions', () => {
      const results = TaskTemplates.searchTasks('transform');

      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('transform_data');
    });
  });

  describe('getTasksForNode', () => {
    it('should return tasks for httpRequest node', () => {
      const tasks = TaskTemplates.getTasksForNode('nodes-base.httpRequest');

      expect(tasks.length).toBeGreaterThanOrEqual(3);
      expect(tasks).toContain('get_api_data');
      expect(tasks).toContain('post_json_request');
      expect(tasks).toContain('call_api_with_auth');
    });

    it('should return tasks for webhook node', () => {
      const tasks = TaskTemplates.getTasksForNode('nodes-base.webhook');

      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks).toContain('receive_webhook');
      expect(tasks).toContain('webhook_with_response');
    });

    it('should return tasks for slack node', () => {
      const tasks = TaskTemplates.getTasksForNode('nodes-base.slack');

      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks).toContain('send_slack_message');
    });

    it('should return tasks for langchain agent node', () => {
      const tasks = TaskTemplates.getTasksForNode('nodes-langchain.agent');

      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks).toContain('ai_agent_workflow');
      expect(tasks).toContain('multi_tool_ai_agent');
    });

    it('should return empty array for unknown node type', () => {
      const tasks = TaskTemplates.getTasksForNode('nodes-base.unknownNode');

      expect(tasks).toEqual([]);
    });
  });

  describe('getTaskCategories', () => {
    it('should return a non-empty categories object', () => {
      const categories = TaskTemplates.getTaskCategories();

      expect(typeof categories).toBe('object');
      expect(Object.keys(categories).length).toBeGreaterThan(0);
    });

    it('should contain expected category names', () => {
      const categories = TaskTemplates.getTaskCategories();
      const categoryNames = Object.keys(categories);

      expect(categoryNames).toContain('HTTP/API');
      expect(categoryNames).toContain('Webhooks');
      expect(categoryNames).toContain('Database');
      expect(categoryNames).toContain('AI/LangChain');
      expect(categoryNames).toContain('Data Processing');
      expect(categoryNames).toContain('Communication');
      expect(categoryNames).toContain('AI Tool Usage');
    });

    it('should have non-empty arrays for each category', () => {
      const categories = TaskTemplates.getTaskCategories();

      Object.entries(categories).forEach(([categoryName, tasks]) => {
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks.length).toBeGreaterThan(0);
      });
    });

    it('should reference only valid task names', () => {
      const categories = TaskTemplates.getTaskCategories();
      const allTasks = TaskTemplates.getAllTasks();

      Object.values(categories).forEach((tasks) => {
        tasks.forEach((taskName) => {
          expect(allTasks).toContain(taskName);
        });
      });
    });

    it('should have HTTP/API category with correct tasks', () => {
      const categories = TaskTemplates.getTaskCategories();

      expect(categories['HTTP/API']).toContain('get_api_data');
      expect(categories['HTTP/API']).toContain('post_json_request');
      expect(categories['HTTP/API']).toContain('call_api_with_auth');
    });

    it('should have Communication category with correct tasks', () => {
      const categories = TaskTemplates.getTaskCategories();

      expect(categories['Communication']).toContain('send_slack_message');
      expect(categories['Communication']).toContain('send_email');
    });

    it('should allow tasks to appear in multiple categories', () => {
      const categories = TaskTemplates.getTaskCategories();

      // multi_tool_ai_agent appears in both AI/LangChain and AI Tool Usage
      expect(categories['AI/LangChain']).toContain('multi_tool_ai_agent');
      expect(categories['AI Tool Usage']).toContain('multi_tool_ai_agent');
    });
  });
});
