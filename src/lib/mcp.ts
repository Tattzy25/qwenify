/**
 * Minimal MCP client — Streamable HTTP transport only.
 * Pure JSON-RPC 2.0 over HTTP POST. No SSE streams, no stdio, nothing local.
 * https://modelcontextprotocol.io/specification (2025-06-18)
 */

import { prepareDeclarations, type PreparedTools } from './schema';

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpAuthError';
  }
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = '2025-06-18';

export class McpHttpClient {
  readonly url: string;
  private token?: string;
  private sessionId?: string;
  private rpcId = 0;
  serverName?: string;
  serverVersion?: string;
  tools: McpTool[] = [];
  prepared: PreparedTools = { declarations: [], nameMap: {} };

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token?.trim() || undefined;
  }

  private nextId(): number {
    return ++this.rpcId;
  }

  private async post(
    payload: Record<string, unknown>,
    opts: { timeout?: number; notification?: boolean } = {},
  ): Promise<JsonRpcResponse | undefined> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(opts.timeout ?? 20000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        msg.includes('abort') || msg.includes('timeout')
          ? 'Request timed out — the endpoint did not respond in time.'
          : `Network error — the endpoint is unreachable from the browser (it may be blocking CORS or the URL is wrong).`,
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new McpAuthError('This endpoint requires authentication. Add a bearer token and reconnect.');
    }
    if (res.status === 404) throw new Error('Endpoint not found (404). Double-check the MCP URL.');
    if (res.status === 405) {
      if (opts.notification) return undefined; // some servers reject notifications with 405 — acceptable
      throw new Error('Method not allowed (405) — this URL does not speak MCP Streamable HTTP.');
    }
    if (res.status === 202 || opts.notification) return undefined;
    if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}.`);

    const sid = res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    const text = await res.text();
    if (!text) return undefined;
    const parsed = this.parseBody(text, res.headers.get('content-type') || '');
    if (parsed?.error) {
      throw new Error(`JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`);
    }
    return parsed;
  }

  /** Accepts application/json. Also tolerates a single JSON-RPC message
   *  wrapped in an event-stream body, extracting the data frame as JSON. */
  private parseBody(text: string, contentType: string): JsonRpcResponse | undefined {
    if (contentType.includes('text/event-stream')) {
      const lines = text.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload && payload !== '[DONE]') {
            try {
              return JSON.parse(payload) as JsonRpcResponse;
            } catch {
              /* keep scanning */
            }
          }
        }
      }
      return undefined;
    }
    return JSON.parse(text) as JsonRpcResponse;
  }

  async initialize(): Promise<void> {
    const res = await this.post({
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'halo-live', version: '1.0.0' },
      },
    });
    const result = res?.result;
    if (!result || typeof result !== 'object') {
      throw new Error('Unexpected response to initialize — this does not look like an MCP endpoint.');
    }
    const pv: string = result.protocolVersion ?? '';
    if (pv && !/^20(24|25|26)-/.test(pv)) {
      throw new Error(`Unsupported MCP protocol version "${pv}".`);
    }
    this.serverName = result.serverInfo?.name;
    this.serverVersion = result.serverInfo?.version;

    // Complete the handshake.
    await this.post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { notification: true },
    ).catch(() => undefined);
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const res = await this.post({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'tools/list',
        params: cursor ? { cursor } : {},
      });
      const list = res?.result?.tools;
      if (Array.isArray(list)) {
        for (const t of list) {
          if (t && typeof t.name === 'string') tools.push(t);
        }
      }
      cursor = typeof res?.result?.nextCursor === 'string' ? res.result.nextCursor : undefined;
      guard++;
    } while (cursor && guard < 10);
    this.tools = tools;
    this.prepared = prepareDeclarations(tools);
    return tools;
  }

  /** Calls a tool by the (sanitized) name declared to Gemini. */
  async callTool(declaredName: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const realName = this.prepared.nameMap[declaredName] ?? declaredName;
    const res = await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'tools/call',
        params: { name: realName, arguments: args ?? {} },
      },
      { timeout: 60000 },
    );
    const result = res?.result ?? {};
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((c: any) => {
        if (c?.type === 'text' && typeof c.text === 'string') return c.text;
        if (c?.type === 'json' || c?.type === 'resource' || c?.type === 'image') {
          try {
            return JSON.stringify(c);
          } catch {
            return String(c);
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return { text: text || '(no output)', isError: !!result.isError };
  }

  disconnect(): void {
    // Stateless teardown — POST a best-effort session termination.
    if (this.sessionId) {
      fetch(this.url, {
        method: 'DELETE',
        headers: {
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      }).catch(() => undefined);
    }
    this.sessionId = undefined;
    this.tools = [];
  }
}
