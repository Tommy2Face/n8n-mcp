import { HandlerContext } from './types';

export async function getWorkflowGuide(_ctx: HandlerContext, args: Record<string, any>): Promise<any> {
  const { topic } = args;

  const guides: Record<string, any> = {
    overview: {
      title: "n8n MCP Tools Quick Start Guide",
      sections: {
        recommended_workflow: {
          title: "Recommended Workflow",
          steps: [
            "1. search_nodes({query:'slack'}) - Find nodes by keyword",
            "2. get_node_essentials('nodes-base.slack') - Get only essential properties (<5KB)",
            "3. get_node_for_task('send_slack_message') - Get pre-configured settings",
            "4. validate_node_minimal() - Quick check for required fields only",
            "5. validate_node_operation() - Full validation with suggestions"
          ],
          tip: "Avoid get_node_info unless you need ALL properties (100KB+ response)"
        },
        essential_tools: {
          discovery: "list_nodes({category:'trigger'}) - Browse by category",
          quick_config: "get_node_essentials() - 95% smaller than get_node_info",
          tasks: "list_tasks() then get_node_for_task() - Pre-configured common tasks",
          validation: "validate_node_minimal() for quick checks, validate_node_operation() for full validation",
          ai_tools: "get_node_as_tool_info() - Learn how to use ANY node as an AI tool",
          management: "n8n_create_workflow, n8n_list_workflows - Manage workflows (if API configured)"
        },
        ai_workflow_pattern: {
          title: "AI Agent Workflows",
          key_insight: "ANY node can be used as an AI tool - not just those marked with usableAsTool!",
          steps: [
            "1. Create an AI Agent node (e.g., @n8n/n8n-nodes-langchain.agent)",
            "2. Connect ANY node to the AI Agent's 'ai_tool' port",
            "3. Use get_node_as_tool_info() to understand tool configuration",
            "4. Configure tool with $fromAI() expressions for dynamic values",
            "5. validate_workflow() to check AI tool connections"
          ],
          examples: [
            "Slack node -> AI Agent's tool port = AI can send Slack messages",
            "Google Sheets -> AI Agent's tool port = AI can read/write spreadsheets",
            "HTTP Request -> AI Agent's tool port = AI can call any API"
          ],
          validation: "Use validate_workflow() to verify ai_tool connections are valid"
        },
        complete_workflow_lifecycle: {
          title: "Complete Workflow Lifecycle",
          overview: "With n8n management tools, you can now manage the entire workflow lifecycle:",
          phases: {
            "1. Discover": {
              tools: ["search_nodes", "list_nodes", "get_node_documentation"],
              purpose: "Find the right nodes for your automation"
            },
            "2. Build": {
              tools: ["get_node_essentials", "get_node_for_task", "search_node_properties"],
              purpose: "Configure nodes with the right settings"
            },
            "3. Validate": {
              tools: ["validate_node_minimal", "validate_node_operation", "validate_workflow", "n8n_validate_workflow"],
              purpose: "Ensure your workflow is correct before deployment",
              new: "n8n_validate_workflow - Validate workflows already in n8n by ID"
            },
            "4. Deploy": {
              tools: ["n8n_create_workflow", "n8n_update_workflow", "n8n_list_workflows"],
              purpose: "Create or update workflows in your n8n instance",
              requirement: "Requires N8N_API_URL and N8N_API_KEY configuration"
            },
            "5. Execute": {
              tools: ["n8n_trigger_webhook_workflow", "n8n_list_executions", "n8n_get_execution"],
              purpose: "Run workflows and monitor their execution",
              note: "Workflows must be activated manually in n8n UI"
            }
          }
        }
      }
    },
    workflow: {
      title: "Efficient Workflow Patterns",
      patterns: [
        {
          name: "Building from scratch",
          steps: [
            "search_nodes or list_nodes to find nodes",
            "get_node_essentials for configuration",
            "validate_node_minimal for quick required field check",
            "validate_node_operation for full validation"
          ]
        },
        {
          name: "Common tasks",
          steps: [
            "list_tasks() to see available templates",
            "get_node_for_task() for instant configuration",
            "Fill in userMustProvide fields",
            "validate_node_minimal() to ensure all required fields present"
          ]
        },
        {
          name: "AI Agent with Tools",
          steps: [
            "Create AI Agent node",
            "search_nodes() to find tool nodes",
            "get_node_as_tool_info() for each tool node",
            "Connect nodes to ai_tool port",
            "Configure with $fromAI() expressions",
            "validate_workflow() to check everything"
          ]
        }
      ]
    },
    search_tips: {
      title: "Search Best Practices",
      tips: [
        "search_nodes returns ANY word match (OR logic)",
        "'send slack message' finds nodes with 'send' OR 'slack' OR 'message'",
        "Single words are more precise: 'slack' vs 'slack message'",
        "Use list_nodes({category:'trigger'}) if search fails",
        "Node types need prefix: 'nodes-base.slack' not just 'slack'"
      ]
    },
    common_nodes: {
      title: "Most Used Nodes",
      categories: {
        triggers: ["webhook", "schedule", "emailReadImap", "slackTrigger"],
        core: ["httpRequest", "code", "set", "if", "merge", "splitInBatches"],
        integrations: ["slack", "gmail", "googleSheets", "postgres", "mongodb"],
        ai: ["agent", "openAi", "chainLlm", "documentLoader"]
      },
      ai_tool_usage: {
        note: "ANY node from above can be used as an AI tool!",
        popular_ai_tools: [
          "slack - Send messages, create channels",
          "googleSheets - Read/write data",
          "httpRequest - Call any API",
          "gmail - Send emails",
          "postgres - Query databases"
        ]
      }
    },
    known_issues: {
      title: "Known Issues & Workarounds",
      issues: [
        "Package names: Use 'n8n-nodes-base' NOT '@n8n/n8n-nodes-base'",
        "Duplicate properties: Check showWhen/hideWhen conditions",
        "Large responses: Use get_node_essentials instead of get_node_info",
        "Property search: Some nodes have 200+ properties, use search_node_properties",
        "Node not found: Try without prefix or lowercase"
      ]
    },
    performance: {
      title: "Performance Guide",
      tools: {
        fast: [
          "get_node_essentials - <5KB responses",
          "search_nodes - Indexed search",
          "list_nodes - Direct queries",
          "validate_node_minimal - Only required fields",
          "start_here_workflow_guide - Static content"
        ],
        slow: [
          "get_node_info - 100KB+ responses",
          "get_node_documentation - Can be large",
          "validate_workflow - Full workflow analysis"
        ]
      },
      tips: [
        "Use get_node_essentials for 95% of use cases",
        "Only use get_node_info when essentials lack needed property",
        "Results are cached for repeated queries",
        "Use validate_node_minimal before validate_node_operation"
      ]
    },
    ai_tools: {
      title: "AI Tools & Agent Workflows",
      key_concept: "In n8n, ANY node can be used as an AI tool - not just those marked with usableAsTool!",
      how_it_works: {
        "1. Connection": "Connect any node to an AI Agent's 'ai_tool' port",
        "2. Configuration": "Use $fromAI() expressions to let AI provide dynamic values",
        "3. Description": "Give tools clear names and descriptions in AI Agent settings",
        "4. Validation": "Use validate_workflow() to verify ai_tool connections"
      },
      common_patterns: {
        "Data Collection": {
          nodes: ["googleSheets", "postgres", "mongodb"],
          usage: "AI reads data to answer questions or make decisions"
        },
        "Actions & Notifications": {
          nodes: ["slack", "gmail", "httpRequest"],
          usage: "AI performs actions based on analysis"
        },
        "API Integration": {
          nodes: ["httpRequest", "webhook"],
          usage: "AI calls external services and APIs"
        }
      },
      best_practices: [
        "Test nodes individually before connecting as tools",
        "Write detailed tool descriptions for better AI understanding",
        "Use validate_workflow() to catch connection issues",
        "Start simple - one or two tools, then expand",
        "Monitor AI tool usage in workflow executions"
      ]
    },
    n8n_management: {
      title: "n8n Workflow Management Tools",
      overview: "Manage n8n workflows directly through MCP.",
      requirements: {
        configuration: "Set N8N_API_URL and N8N_API_KEY environment variables",
        access: "n8n instance with API access enabled",
        version: "n8n v1.0.0 or higher"
      },
      best_practices: [
        "ALWAYS use node NAMES in connections, NEVER node IDs",
        "Always use n8n_health_check first to verify connectivity",
        "Fetch full workflow before updating (n8n_get_workflow)",
        "Validate workflows before creating (validate_workflow)",
        "Monitor executions after triggering webhooks",
        "Use descriptive workflow names for easy management"
      ]
    }
  };

  if (topic && guides[topic]) {
    return guides[topic];
  }

  return {
    title: "n8n MCP Tools Complete Guide",
    quickStart: guides.overview,
    sections: {
      workflow: guides.workflow,
      searchTips: guides.search_tips,
      commonNodes: guides.common_nodes,
      knownIssues: guides.known_issues,
      performance: guides.performance,
      aiTools: guides.ai_tools,
      n8nManagement: guides.n8n_management
    },
    validation_guide: {
      title: "Validation Tools Guide",
      tools: {
        "validate_node_minimal": "Fastest - only checks required fields",
        "validate_node_operation": "Smart - checks based on selected operation",
        "validate_workflow": "Complete - validates entire workflow including AI connections",
        "validate_workflow_connections": "Structure - just checks node connections",
        "validate_workflow_expressions": "Expressions - validates $json, $node, $fromAI"
      }
    }
  };
}
