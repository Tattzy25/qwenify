import { useEffect, useRef, useState } from 'react';
import type { McpStatus } from '../lib/types';
import { cx, hostOf, loadLS, saveLS } from '../lib/utils';

const VOICES = ['Puck', 'Zephyr', 'Leda', 'Kore', 'Fenrir', 'Enceladus', 'Autonoe', 'Orus', 'Aoede'];
const THINKING: Array<[string, string]> = [
  ['minimal', 'Minimal — fastest'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High — deepest'],
];

const selectCls =
  'h-11 w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/30 pl-3.5 pr-9 font-mono text-[13px] text-ink transition-colors focus:border-accent/50 focus:outline-none';

function Chevron() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
import {
  IconAlert,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconGear,
  IconKey,
  IconPlug,
  IconSpinner,
  IconX,
} from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKey: (v: string) => void;
  mcpUrl: string;
  mcpToken: string;
  onMcpFields: (url: string, token: string) => void;
  mcp: McpStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

const label = 'mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-dim';
const field =
  'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 font-mono text-[13px] text-ink placeholder:text-dim/60 transition-colors focus:border-accent/50 focus:outline-none';

export function SettingsModal(p: Props) {
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [voice, setVoice] = useState(() => loadLS('halo.voice', 'Leda'));
  const [thinking, setThinking] = useState(() => loadLS('halo.thinking', 'minimal'));
  const keyRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') p.onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => (p.apiKey ? urlRef.current : keyRef.current)?.focus(), 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [p.open, p.apiKey, p.onClose]);

  if (!p.open) return null;

  const connecting = p.mcp.state === 'connecting';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-black/65 backdrop-blur-[6px]" onClick={p.onClose} />

      <div className="anim-pop relative w-[min(444px,94vw)] rounded-[22px] border border-white/10 bg-[#14161b] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconGear size={17} className="text-accent" />
            <h2 className="font-display text-[17px] font-semibold tracking-tight">Settings</h2>
          </div>
          <button
            type="button"
            onClick={p.onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/[0.07] hover:text-ink"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* API key */}
        <section className="mb-5">
          <div className={label}>
            <IconKey size={12} />
            Gemini API key
          </div>
          <div className="relative">
            <input
              ref={keyRef}
              type={showKey ? 'text' : 'password'}
              value={p.apiKey}
              onChange={(e) => p.onApiKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              className={cx(field, 'pr-11')}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-dim hover:bg-white/[0.07] hover:text-ink"
            >
              {showKey ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 font-mono text-[10.5px] text-dim/80">
            {p.apiKey ? (
              <>
                <IconCheck size={11} className="text-live" /> Stored locally · powers {`gemini-3.1-flash-live`}
              </>
            ) : (
              'Powers the live voice + vision session. Never leaves this browser.'
            )}
          </p>
        </section>

        <div className="mb-5 h-px bg-white/[0.07]" />

        {/* MCP */}
        <section>
          <div className={label}>
            <IconPlug size={12} />
            MCP endpoint
            <span className="ml-auto normal-case tracking-normal text-dim/70">Streamable HTTP</span>
          </div>
          <input
            ref={urlRef}
            type="url"
            value={p.mcpUrl}
            onChange={(e) => p.onMcpFields(e.target.value, p.mcpToken)}
            placeholder="https://your-server.com/mcp"
            autoComplete="off"
            spellCheck={false}
            className={field}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !connecting) p.onConnect();
            }}
          />
          <div className="relative mt-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={p.mcpToken}
              onChange={(e) => p.onMcpFields(p.mcpUrl, e.target.value)}
              placeholder="Bearer token — only if the endpoint requires auth"
              autoComplete="off"
              spellCheck={false}
              className={cx(field, 'pr-11', p.mcp.needsAuth && 'border-danger/60')}
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-dim hover:bg-white/[0.07] hover:text-ink"
            >
              {showToken ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </div>

          {/* status line */}
          <div className="mt-2.5 min-h-[18px]">
            {p.mcp.state === 'connecting' && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
                <IconSpinner size={11} /> Handshaking with {p.mcp.host}…
              </span>
            )}
            {p.mcp.state === 'error' && (
              <span className="flex items-start gap-1.5 font-mono text-[11px] leading-snug text-danger">
                <IconAlert size={12} className="mt-0.5 shrink-0" /> {p.mcp.error}
              </span>
            )}
            {p.mcp.state === 'connected' && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-live">
                <IconCheck size={12} />
                {p.mcp.serverName ? `${p.mcp.serverName} · ` : ''}
                {p.mcp.tools.length} tool{p.mcp.tools.length === 1 ? '' : 's'} on {p.mcp.host}
              </span>
            )}
            {p.mcp.state === 'disconnected' && (
              <span className="font-mono text-[10.5px] text-dim/75">
                JSON-RPC 2.0 · initialize → tools/list → tools/call
              </span>
            )}
          </div>

          {/* connected tools */}
          {p.mcp.state === 'connected' && p.mcp.tools.length > 0 && (
            <div className="slim-scroll mt-2 flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto">
              {p.mcp.tools.map((t) => (
                <span
                  key={t.name}
                  title={t.description}
                  className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-mono text-[10.5px] text-ink/85"
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            {p.mcp.state === 'connected' && (
              <button
                type="button"
                onClick={p.onDisconnect}
                className="h-10 rounded-xl border border-white/10 px-4 font-display text-[13px] font-semibold text-dim transition-colors hover:border-danger/40 hover:text-danger"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={p.onConnect}
              disabled={connecting || !p.mcpUrl.trim()}
              className={cx(
                'flex h-10 flex-1 items-center justify-center gap-2 rounded-xl font-display text-[14px] font-semibold transition-all active:scale-[0.98]',
                connecting || !p.mcpUrl.trim()
                  ? 'cursor-not-allowed bg-white/[0.06] text-dim'
                  : 'bg-accent text-[#1c1204] hover:brightness-110 shadow-[0_8px_26px_rgba(239,171,82,0.22)]',
              )}
            >
              {connecting ? (
                <>
                  <IconSpinner size={15} /> Connecting…
                </>
              ) : p.mcp.state === 'connected' ? (
                <>
                  <IconCheck size={15} /> Reconnect
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
          <p className="mt-3 text-center font-mono text-[10px] text-dim/70">
            Connected tools are declared to the live agent automatically.
          </p>
        </section>

        <div className="my-5 h-px bg-white/[0.07]" />

        {/* Voice & thinking */}
        <section>
          <div className={label}>Agent voice & thinking</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <select
                value={voice}
                onChange={(e) => {
                  setVoice(e.target.value);
                  saveLS('halo.voice', e.target.value);
                }}
                className={selectCls}
                aria-label="Agent voice"
              >
                {VOICES.map((v) => (
                  <option key={v} value={v} className="bg-[#14161b] text-ink">
                    {v}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
            <div className="relative">
              <select
                value={thinking}
                onChange={(e) => {
                  setThinking(e.target.value);
                  saveLS('halo.thinking', e.target.value);
                }}
                className={selectCls}
                aria-label="Thinking level"
              >
                {THINKING.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#14161b] text-ink">
                    {l}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] text-dim/80">
            Applied on the next call — thinking trades a little latency for deeper reasoning.
          </p>
        </section>
      </div>
    </div>
  );
}
