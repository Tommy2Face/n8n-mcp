# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

n8n-MCP v2.7.0 — A Model Context Protocol server that gives AI assistants structured access to n8n's 525+ workflow automation nodes. Provides node documentation, configuration validation, and optional direct workflow management via the n8n API. Forked from [czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp).

## Commands

```bash
# Build & run
npm run build                # TypeScript → dist/
npm run rebuild              # Rebuild SQLite node database (requires build first)
npm run dev                  # Build + rebuild DB + validate (full dev cycle)
npm start                    # stdio mode (Claude Desktop/Code)
npm run start:http:fixed     # HTTP mode on port 3000 (recommended for remote)
npm run dev:http             # HTTP with nodemon auto-reload

# Test & validate
npm test                     # Jest test suite (roots: src/ and tests/)
npm test -- --testPathPattern=<pattern>  # Run a single test file
npm run lint                 # TypeScript type-check (tsc --noEmit)
npm run validate             # Validate critical nodes in database
npm run test-nodes           # Test critical node properties/operations

# Individual test scripts (run after build)
node dist/scripts/test-mcp-tools.js
node dist/scripts/test-workflow-validation.js
node dist/scripts/test-enhanced-validation.js
node dist/scripts/test-workflow-diff.js

# Dependency management
npm run update:n8n:check     # Check for n8n updates (dry-run)
npm run update:n8n           # Update n8n packages

# Docker
docker compose up -d         # Start production
docker compose down           # Stop
```

## Architecture

### Entry Point & Server Modes

`src/mcp/index.ts` selects mode based on `MCP_MODE` env var:

- **stdio** (default) → `N8NDocumentationMCPServer` via `StdioServerTransport`. Used by Claude Desktop/Code. **Critical: never write to stdout/stderr in this mode** — it corrupts the MCP protocol. All logging is conditional.
- **http** with `USE_FIXED_HTTP=true` → `src/http-server-fixed.ts`. Express server with manual JSON-RPC, Bearer token auth, CORS. Endpoints: `POST /mcp`, `GET /health`, `GET /version`.
- **http** legacy → `src/http-server-single-session.ts`. Uses SDK's `StreamableHTTPServerTransport`. Less stable.

### Database Adapter

`src/database/database-adapter.ts` — factory pattern with automatic fallback:

1. Tries **better-sqlite3** (native C++, 10-50x faster)
2. Falls back to **sql.js** (pure JS/WASM) if native compilation fails

Both implement `DatabaseAdapter` interface. The sql.js adapter uses 100ms debounced auto-save. Database file: `data/nodes.db` (~15MB). Constructor searches `cwd/data/`, `__dirname/../../data/`, and `./data/`.

### Data Pipeline (rebuild)

```
loaders/node-loader.ts      → Loads n8n node classes from npm packages
parsers/node-parser.ts       → Extracts metadata, properties, operations
parsers/property-extractor.ts → Dedicated property/operation extraction
mappers/docs-mapper.ts       → Maps official n8n-docs markdown
database/node-repository.ts  → Persists to SQLite (schema.sql)
```

### MCP Tool System

**Tool definitions** registered as arrays:
- `src/mcp/tools-update.ts` → `n8nDocumentationToolsFinal` (17 doc + 5 validation tools)
- `src/mcp/tools-n8n-manager.ts` → `n8nManagementTools` (14 tools, conditional on `N8N_API_URL` + `N8N_API_KEY`)

**Dispatch**: Two-tier routing in `N8NDocumentationMCPServer.executeTool()` (`src/mcp/server-update.ts`):
1. **Handler registry** (`src/mcp/handlers/index.ts`) — O(1) lookup in `toolHandlers` Record for 22 doc/validation/template/workflow tools
2. **Switch fallback** — 14 n8n management tools + diff handler, dispatched to `handlers-n8n-manager.ts` and `handlers-workflow-diff.ts`

**Handler modules** in `src/mcp/handlers/`:
- `index.ts` — barrel export of `toolHandlers` Record mapping tool names → handler functions
- `types.ts` — `HandlerContext` (db, repository, templateService, cache), `ToolHandler`, `NodeRow`
- `documentation-handlers.ts` — 7 tools (listNodes, getNodeInfo, searchNodes, etc.)
- `validation-handlers.ts` — 7 tools (getNodeEssentials, validateNodeOperation, etc.)
- `template-handlers.ts` — 4 tools (listNodeTemplates, getTemplate, searchTemplates, etc.)
- `workflow-validation-handlers.ts` — 3 tools (validateWorkflow, connections, expressions)
- `guide-handler.ts` — 1 tool (start_here_workflow_guide)
- `node-lookup.ts` — shared node lookup helper

**Standalone handlers** (n8n API, not in registry):
- `handlers-n8n-manager.ts` — 15 functions for workflow/execution management via n8n API
- `handlers-workflow-diff.ts` — diff-based partial workflow updates

**Shared types/config**:
- `src/types/n8n.ts` — shared n8n type definitions
- `src/config/constants.ts` — server defaults, timeouts, security header values

All responses: `{content: [{type: 'text', text: JSON.stringify(result)}]}`.

### Service Layer

| Service | File | Purpose |
|---|---|---|
| `WorkflowValidator` | `services/workflow-validator.ts` | Full workflow validation (connections, cycles, expressions) |
| `WorkflowDiffEngine` | `services/workflow-diff-engine.ts` | Diff-based partial updates (80-90% token savings) |
| `EnhancedConfigValidator` | `services/enhanced-config-validator.ts` | Operation-aware node validation with profiles |
| `ExpressionValidator` | `services/expression-validator.ts` | n8n expression syntax including `$fromAI()` |
| `PropertyFilter` | `services/property-filter.ts` | Extracts 10-20 essential properties from 200+ |
| `TaskTemplates` | `services/task-templates.ts` | Pre-configured node settings for common tasks |
| `N8nApiClient` | `services/n8n-api-client.ts` | HTTP client for n8n instance API |
| `ConfigValidator` | `services/config-validator.ts` | General node configuration validation |
| `PropertyDependencies` | `services/property-dependencies.ts` | Property visibility condition analysis |

### Template System

`src/templates/` — workflow template management:
- `template-service.ts` — CRUD and search
- `template-fetcher.ts` — Fetches from n8n.io template gallery
- `template-repository.ts` — SQLite persistence

## Environment Variables

See `.env.example` for full list. Key variables:

| Variable | Required | Purpose |
|---|---|---|
| `MCP_MODE` | No | `stdio` (default) or `http` |
| `USE_FIXED_HTTP` | No | `true` for recommended HTTP implementation |
| `AUTH_TOKEN` | HTTP only | Bearer token for HTTP auth |
| `PORT` | No | HTTP port (default: 3000) |
| `N8N_API_URL` | No | n8n instance URL (enables management tools) |
| `N8N_API_KEY` | No | n8n API key (enables management tools) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `DISABLE_CONSOLE_OUTPUT` | No | Suppress console in stdio mode |

## Key Patterns

- **Validation profiles**: `minimal` (required fields), `runtime` (full config), `ai-friendly` (relaxed), `strict` (all checks). Used by `EnhancedConfigValidator`.
- **Tool naming**: Doc tools use descriptive names (`get_node_essentials`). Management tools prefixed `n8n_` (`n8n_create_workflow`).
- **Conditional tool loading**: Management tools only registered when both `N8N_API_URL` and `N8N_API_KEY` are set (`src/config/n8n-api.ts`).
- **Diff operations limit**: `n8n_update_partial_workflow` caps at 5 operations per request. Two-pass transactional processing handles dependency ordering.

## Node.js Version

Uses Node.js 20 LTS. Node 25+ cannot compile better-sqlite3 (V8 header mismatch). The sql.js fallback works but is slower. If using nvm: `nvm use 20`.

## Docker

Multi-stage Dockerfile: compile TypeScript in builder, copy only `dist/` + `data/nodes.db` + minimal runtime deps. Result: ~280MB (82% smaller than full n8n). Non-root user, health check on `/health`. Database must be pre-built locally before Docker build.
