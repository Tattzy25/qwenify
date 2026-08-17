/**
 * Install-time provisioning + agent discovery.
 * The app ships through the Shopify Marketplace, so configuration arrives with
 * the launch URL (or the host bridge's `window.__HALO__`), not from a settings
 * form. Whatever arrives is persisted so refreshes keep working.
 */

import { loadLS, saveLS } from '../utils';

export interface ProvisionedConfig {
  apiKey: string;
  ucpUrl: string;
  ucpToken: string;
  shop: string;
}

interface HaloGlobal {
  apiKey?: string;
  ucpUrl?: string;
  ucpToken?: string;
  shop?: string;
}

export function resolveProvision(): ProvisionedConfig {
  const params = new URLSearchParams(window.location.search);
  const g: HaloGlobal = (window as unknown as { __HALO__?: HaloGlobal }).__HALO__ ?? {};

  const pick = (param: string, global?: string, lsKey?: string): string =>
    params.get(param)?.trim() || global?.trim() || (lsKey ? (loadLS<string>(lsKey, '') || '') : '') || '';

  const apiKey = pick('key', g.apiKey, 'halo.apiKey');
  const ucpUrl = pick('ucp', g.ucpUrl, 'halo.ucpUrl') || pick('mcp', undefined, undefined);
  const ucpToken = pick('token', g.ucpToken, 'halo.ucpToken');
  const shop = pick('shop', g.shop, 'halo.shop');

  if (apiKey) saveLS('halo.apiKey', apiKey);
  if (ucpUrl) saveLS('halo.ucpUrl', ucpUrl);
  if (ucpToken) saveLS('halo.ucpToken', ucpToken);
  if (shop) saveLS('halo.shop', shop);

  return { apiKey, ucpUrl, ucpToken, shop };
}

/* ---------- well-known discovery (agent card + UCP profile) ---------- */

export interface AgentCardInfo {
  serverName?: string;
  description?: string;
  ucpCapabilities: string[];
}

export async function discoverAgent(baseUrl: string): Promise<AgentCardInfo> {
  const info: AgentCardInfo = { ucpCapabilities: [] };

  let origin = baseUrl;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return info;
  }

  const card = await fetchJson(`${origin}/.well-known/agent-card.json`);
  if (card) {
    if (typeof card.name === 'string') info.serverName = card.name;
    if (typeof card.description === 'string') info.description = card.description;
  }

  const ucp = await fetchJson(`${origin}/.well-known/ucp`);
  if (ucp) {
    const caps: unknown = Array.isArray(ucp.capabilities)
      ? ucp.capabilities
      : Array.isArray(ucp.supported)
        ? ucp.supported
        : [];
    info.ucpCapabilities = (caps as unknown[])
      .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' && 'name' in c ? String((c as Record<string, unknown>).name) : ''))
      .filter(Boolean);
  }

  return info;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(3500),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}
