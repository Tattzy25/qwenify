/**
 * Converts a JSON Schema (as returned by MCP `tools/list`) into the schema
 * shape Gemini's Live API expects for function declarations
 * (upper-cased types, restricted keywords).
 */

const SCALAR_KEYS = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern'] as const;

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'OBJECT', properties: {} };
  }
  const s = schema as Record<string, any>;
  const out: Record<string, unknown> = {};

  // type
  let type = typeof s.type === 'string' ? s.type.toUpperCase() : undefined;
  if (!type) {
    if (s.properties) type = 'OBJECT';
    else if (s.items) type = 'ARRAY';
    else if (s.enum) type = 'STRING';
    else type = 'STRING';
  }
  // JSON Schema "null" type isn't representable — coerce
  if (type === 'NULL') type = 'STRING';
  out.type = type;

  if (typeof s.description === 'string' && s.description) out.description = s.description;

  if (Array.isArray(s.enum) && s.enum.length) {
    out.enum = s.enum.map((v: unknown) => String(v));
  }

  for (const k of SCALAR_KEYS) {
    if (typeof s[k] === 'number' || typeof s[k] === 'string') out[k] = s[k];
  }

  if (type === 'ARRAY') {
    out.items = toGeminiSchema(s.items ?? { type: 'string' });
  }

  if (type === 'OBJECT' || s.properties) {
    out.type = 'OBJECT';
    const props: Record<string, unknown> = {};
    if (s.properties && typeof s.properties === 'object') {
      for (const [k, v] of Object.entries(s.properties)) {
        props[k] = toGeminiSchema(v);
      }
    }
    out.properties = props;
    const required = Array.isArray(s.required) ? s.required.filter((r: unknown) => typeof r === 'string') : Object.keys(props);
    if (required.length) out.required = required;
  }

  return out;
}

const NAME_RE = /[^a-zA-Z0-9_-]/g;

export function sanitizeToolName(name: string): string {
  const cleaned = name.replace(NAME_RE, '_').replace(/^([0-9])/, 't_$1');
  return cleaned.slice(0, 64) || 'tool';
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface PreparedTools {
  declarations: GeminiFunctionDeclaration[];
  /** sanitized name → original MCP tool name */
  nameMap: Record<string, string>;
}

export function prepareDeclarations(
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
): PreparedTools {
  const declarations: GeminiFunctionDeclaration[] = [];
  const nameMap: Record<string, string> = {};
  const used = new Set<string>();

  for (const tool of tools) {
    let name = sanitizeToolName(tool.name);
    while (used.has(name)) name = `${name}_2`;
    used.add(name);
    nameMap[name] = tool.name;
    declarations.push({
      name,
      description: (tool.description || `Invoke the "${tool.name}" tool.`).slice(0, 2048),
      parameters: toGeminiSchema(tool.inputSchema),
    });
  }
  return { declarations, nameMap };
}
