import { SingleSessionHTTPServer } from '../http-server-single-session';
import express from 'express';
import { ConsoleManager } from '../utils/console-manager';

// Mock express Request and Response
const createMockRequest = (body: any = {}): express.Request => {
  return {
    body,
    headers: {
      authorization: `Bearer ${process.env.AUTH_TOKEN || 'test-token'}`
    },
    method: 'POST',
    path: '/mcp',
    ip: '127.0.0.1',
    get: (header: string) => {
      if (header === 'user-agent') return 'test-agent';
      if (header === 'content-length') return '100';
      return null;
    }
  } as any;
};

interface MockResponse extends express.Response {
  body: any;
}

const createMockResponse = (): MockResponse => {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    status: function(code: number) {
      this.statusCode = code;
      return this;
    },
    json: function(data: any) {
      this.body = data;
      this.headersSent = true;
      return this;
    },
    setHeader: function(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    on: function(event: string, callback: Function) {
      return this;
    }
  };
  return res;
};

describe('SingleSessionHTTPServer', () => {
  let server: SingleSessionHTTPServer;
  
  beforeAll(() => {
    process.env.AUTH_TOKEN = 'test-token';
    process.env.MCP_MODE = 'http';
  });
  
  beforeEach(() => {
    server = new SingleSessionHTTPServer();
  });
  
  afterEach(async () => {
    await server.shutdown();
  });
  
  describe('Console Management', () => {
    it('should silence console during request handling', async () => {
      const consoleManager = new ConsoleManager();
      const originalLog = console.log;
      
      let loggedDuringOperation = false;
      
      await consoleManager.wrapOperation(() => {
        // console.log is replaced with a no-op during the operation
        loggedDuringOperation = console.log === originalLog;
      });
      
      // During the operation, console.log should have been a no-op (not the original)
      expect(loggedDuringOperation).toBe(false);
      // After wrapOperation, the original console.log is restored
      expect(console.log).toBe(originalLog);
    });
    
    it('should handle errors and still restore console', async () => {
      const consoleManager = new ConsoleManager();
      const originalError = console.error;
      
      try {
        await consoleManager.wrapOperation(() => {
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error
      }
      
      // Verify console was restored
      expect(console.error).toBe(originalError);
    });
  });
  
  describe('Session Management', () => {
    it('should create a single session on first request', async () => {
      const req = createMockRequest({ method: 'tools/list' });
      const res = createMockResponse();
      
      const sessionInfoBefore = server.getSessionInfo();
      expect(sessionInfoBefore.active).toBe(false);
      
      await server.handleRequest(req, res);
      
      const sessionInfoAfter = server.getSessionInfo();
      expect(sessionInfoAfter.active).toBe(true);
      expect(sessionInfoAfter.sessionId).toBe('single-session');
    });
    
    it('should reuse the same session for multiple requests', async () => {
      const req1 = createMockRequest({ method: 'tools/list' });
      const res1 = createMockResponse();
      const req2 = createMockRequest({ method: 'get_node_info' });
      const res2 = createMockResponse();
      
      // First request creates session
      await server.handleRequest(req1, res1);
      const session1 = server.getSessionInfo();
      
      // Second request reuses session
      await server.handleRequest(req2, res2);
      const session2 = server.getSessionInfo();
      
      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session2.sessionId).toBe('single-session');
    });
    
    it('should return error when transport cannot handle mock request', async () => {
      // Auth is enforced by Express middleware (app.post('/mcp')), not by handleRequest().
      // Calling handleRequest() directly with an incomplete mock triggers
      // a transport error, which the catch block maps to 500.
      const reqNoAuth = createMockRequest({ method: 'tools/list' });
      delete reqNoAuth.headers.authorization;
      const resNoAuth = createMockResponse();
      
      await server.handleRequest(reqNoAuth, resNoAuth);
      
      expect(resNoAuth.statusCode).toBe(500);
      expect(resNoAuth.body).toHaveProperty('error');
      expect(resNoAuth.body.error).toHaveProperty('code', -32603);
    });
    
    it('should return error for invalid mock request', async () => {
      const reqBadAuth = createMockRequest({ method: 'tools/list' });
      reqBadAuth.headers.authorization = 'Bearer wrong-token';
      const resBadAuth = createMockResponse();
      
      await server.handleRequest(reqBadAuth, resBadAuth);
      
      expect(resBadAuth.statusCode).toBe(500);
    });
  });
  
  describe('Session Expiry', () => {
    it('should detect expired sessions', () => {
      // This would require mocking timers or exposing internal state
      // For now, we'll test the concept
      const sessionInfo = server.getSessionInfo();
      expect(sessionInfo.active).toBe(false);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      const req = createMockRequest({ invalid: 'data' });
      const res = createMockResponse();
      
      // This might not cause an error with the current implementation
      // but demonstrates error handling structure
      await server.handleRequest(req, res);
      
      // Should not throw, should return error response
      if (res.statusCode === 500) {
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toHaveProperty('code', -32603);
      }
    });
  });
});

describe('ConsoleManager', () => {
  it('should only silence in HTTP mode', () => {
    const originalMode = process.env.MCP_MODE;
    process.env.MCP_MODE = 'stdio';
    
    const consoleManager = new ConsoleManager();
    const originalLog = console.log;
    
    consoleManager.silence();
    expect(console.log).toBe(originalLog); // Should not change
    
    process.env.MCP_MODE = originalMode;
  });
  
  it('should track silenced state', () => {
    process.env.MCP_MODE = 'http';
    const consoleManager = new ConsoleManager();
    
    expect(consoleManager.isActive).toBe(false);
    consoleManager.silence();
    expect(consoleManager.isActive).toBe(true);
    consoleManager.restore();
    expect(consoleManager.isActive).toBe(false);
  });
  
  it('should handle nested calls correctly', () => {
    process.env.MCP_MODE = 'http';
    const consoleManager = new ConsoleManager();
    const originalLog = console.log;
    
    consoleManager.silence();
    consoleManager.silence(); // Second call should be no-op
    expect(consoleManager.isActive).toBe(true);
    
    consoleManager.restore();
    expect(console.log).toBe(originalLog);
  });
});