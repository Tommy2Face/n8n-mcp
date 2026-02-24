import packageJson from '../../package.json';

// Version and identity
export const APP_VERSION = packageJson.version;
export const SERVER_NAME = 'n8n-documentation-mcp';
export const PROTOCOL_VERSION = '2024-11-05';

// HTTP server defaults
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '0.0.0.0';
export const SHUTDOWN_TIMEOUT_MS = 10000;

// Security headers
export const HSTS_MAX_AGE = '31536000';
export const CORS_MAX_AGE = '86400';

// Tool/query limits
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_TOOL_RESULTS = 500;

// Caching
export const CACHE_TTL_SECONDS = 3600;

// Session
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Database
export const SQLJS_SAVE_DEBOUNCE_MS = 100;
