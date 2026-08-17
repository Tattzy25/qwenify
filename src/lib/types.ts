export type CallState = 'idle' | 'connecting' | 'live' | 'reconnecting';

export type AgentMode = 'idle' | 'waking' | 'listening' | 'speaking';

export interface Caption {
  id: number;
  speaker: 'user' | 'agent';
  text: string;
  final: boolean;
}

export interface ToolEvent {
  id: number;
  name: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  host?: string;
  serverName?: string;
  tools: McpToolInfo[];
  error?: string;
  needsAuth?: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}
