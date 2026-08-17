import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentSphere } from './components/AgentSphere';
import { Captions } from './components/Captions';
import { ControlDock } from './components/ControlDock';
import { PiPWindow } from './components/PiPWindow';
import { SettingsModal } from './components/SettingsModal';
import { IconAlert, IconPlug, IconGear, Logo } from './components/icons';
import { McpAuthError, McpHttpClient } from './lib/mcp';
import { LiveCall } from './lib/session';
import type { AgentMode, CallState, Caption, McpStatus, Toast, ToolEvent } from './lib/types';
import { cx, formatClock, hostOf, loadLS, saveLS } from './lib/utils';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => loadLS('halo.apiKey', ''));
  const [mcpUrl, setMcpUrl] = useState<string>(() => loadLS('halo.mcpUrl', ''));
  const [mcpToken, setMcpToken] = useState<string>(() => loadLS('halo.mcpToken', ''));
  const [callState, setCallState] = useState<CallState>('idle');
  const [mode, setMode] = useState<AgentMode>('idle');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcp, setMcp] = useState<McpStatus>({ state: 'disconnected', tools: [] });
  const [elapsed, setElapsed] = useState(0);

  const sessionRef = useRef<LiveCall | null>(null);
  const mcpClientRef = useRef<McpHttpClient | null>(null);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  const seqRef = useRef(0);
  const timerRef = useRef(0);

  /* ---------- toasts ---------- */
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seqRef.current;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* ---------- live session events ---------- */
  const onState = useCallback((s: CallState) => {
    setCallState(s);
    if (s === 'live') {
      setElapsed(0);
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (s === 'idle') {
      window.clearInterval(timerRef.current);
    }
  }, []);

  const onMode = useCallback((m: AgentMode) => setMode(m), []);
  const onStream = useCallback((s: MediaStream | null) => {
    setStream(s);
    if (s) {
      setMicOn(true);
      setCamOn(true);
    }
  }, []);

  const onCaption = useCallback((c: Caption) => {
    setCaptions((prev) => {
      if (c.text === '' && c.final) {
        // finalize marker — drop empty captions, seal the rest
        return prev
          .filter((p) => !(p.id === c.id && !p.text))
          .map((p) => (p.id === c.id ? { ...p, final: true } : p));
      }
      const idx = prev.findIndex((p) => p.id === c.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], text: c.text, final: c.final };
        return next;
      }
      return [...prev, c].slice(-24);
    });
  }, []);

  const onTool = useCallback((t: ToolEvent) => {
    setTools((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = t;
        return next;
      }
      return [...prev, t].slice(-12);
    });
    if (t.status !== 'running') {
      window.setTimeout(() => setTools((prev) => prev.filter((x) => x.id !== t.id)), 6500);
    }
  }, []);

  useEffect(() => {
    const session = new LiveCall({
      onState,
      onMode,
      onCaption,
      onTool,
      onStream,
      onNotice: pushToast,
    });
    sessionRef.current = session;
    let hint = 0;
    if (!loadLS('halo.apiKey', '')) {
      hint = window.setTimeout(
        () => pushToast('Add your Gemini API key in Settings to go live', 'info'),
        1100,
      );
    }
    return () => {
      window.clearTimeout(hint);
      window.clearInterval(timerRef.current);
      session.end();
    };
  }, [onState, onMode, onCaption, onTool, onStream, pushToast]);

  /* ---------- call controls ---------- */
  const startCall = (): void => {
    if (!apiKeyRef.current.trim()) {
      setSettingsOpen(true);
      pushToast('Paste your Gemini API key, then start the call', 'info');
      return;
    }
    if (!loadLS('halo.echoHint', false)) {
      saveLS('halo.echoHint', true);
      window.setTimeout(
        () => pushToast('Headphones recommended — speaker audio can re-trigger the mic', 'info'),
        1600,
      );
    }
    void sessionRef.current?.start(apiKeyRef.current.trim(), mcpClientRef.current);
  };
  const endCall = (): void => sessionRef.current?.end();

  const toggleMic = (): void => {
    const next = !micOn;
    setMicOn(next);
    sessionRef.current?.setMuted(!next);
  };
  const toggleCam = (): void => {
    const next = !camOn;
    setCamOn(next);
    sessionRef.current?.setCameraEnabled(next);
  };

  /* ---------- MCP ---------- */
  const connectMcp = async (): Promise<void> => {
    const url = mcpUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setMcp({ state: 'error', tools: [], error: 'Enter a valid http(s) URL for the MCP endpoint.' });
      return;
    }
    setMcp({ state: 'connecting', host: hostOf(url), tools: [] });
    const client = new McpHttpClient(url, mcpToken.trim() || undefined);
    try {
      await client.initialize();
      const toolList = await client.listTools();
      mcpClientRef.current?.disconnect();
      mcpClientRef.current = client;
      saveLS('halo.mcpUrl', url);
      saveLS('halo.mcpToken', mcpToken.trim());
      setMcp({
        state: 'connected',
        host: hostOf(url),
        serverName: client.serverName,
        tools: toolList.map((t) => ({ name: t.name, description: t.description })),
      });
      pushToast(
        toolList.length
          ? `${toolList.length} tool${toolList.length === 1 ? '' : 's'} connected — the agent can use them now`
          : 'Connected — this server exposes no tools',
        'success',
      );
      setSettingsOpen(false);
      if (sessionRef.current?.isActive) void sessionRef.current.reloadTools(client);
    } catch (err) {
      const needsAuth = err instanceof McpAuthError;
      setMcp({
        state: 'error',
        host: hostOf(url),
        tools: [],
        error: (err as Error).message,
        needsAuth,
      });
    }
  };

  const disconnectMcp = (): void => {
    mcpClientRef.current?.disconnect();
    mcpClientRef.current = null;
    setMcp({ state: 'disconnected', tools: [] });
    pushToast('MCP endpoint disconnected', 'info');
    if (sessionRef.current?.isActive) void sessionRef.current.reloadTools(null);
  };

  /* ---------- render ---------- */
  const inCall = callState === 'live' || callState === 'reconnecting';

  const statusDot =
    callState === 'live'
      ? 'bg-live dot-pulse'
      : callState === 'idle'
        ? 'bg-dim/70'
        : 'bg-accent dot-pulse';
  const statusLabel =
    callState === 'live'
      ? `Live · ${formatClock(elapsed)}`
      : callState === 'connecting'
        ? 'Connecting'
        : callState === 'reconnecting'
          ? 'Reconnecting'
          : 'Offline';

  return (
    <div className="relative h-full w-full overflow-hidden bg-void font-body text-ink">
      <AgentSphere mode={mode} />

      {/* ---------- top bar ---------- */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-5 sm:px-7">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <Logo size={23} className="text-accent" />
          <span className="font-display text-[19px] font-bold tracking-tight">Halo</span>
          {inCall && (
            <span className="ml-2 hidden font-mono text-[9.5px] uppercase tracking-[0.18em] text-dim lg:block">
              gemini-3.1-flash-live · pcm16
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-panel/80 py-1.5 pl-3 pr-3.5 backdrop-blur-md">
            <span className={cx('h-[7px] w-[7px] rounded-full', statusDot)} />
            <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink/85">
              {statusLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="MCP endpoint"
            className={cx(
              'flex h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[10.5px] uppercase tracking-[0.12em] backdrop-blur-md transition-colors',
              mcp.state === 'connected'
                ? 'border-live/25 bg-live/[0.08] text-live hover:bg-live/[0.14]'
                : 'border-white/10 bg-panel/80 text-dim hover:text-ink',
            )}
          >
            <IconPlug size={13} />
            {mcp.state === 'connected'
              ? `${mcp.tools.length} tool${mcp.tools.length === 1 ? '' : 's'}`
              : mcp.state === 'connecting'
                ? 'MCP…'
                : 'MCP'}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            className={cx(
              'flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-panel/80 text-dim backdrop-blur-md transition-all hover:rotate-45 hover:text-ink',
              !apiKey && callState === 'idle' && 'gear-hint',
            )}
          >
            <IconGear size={16} />
          </button>
        </div>
      </header>

      {/* ---------- hint when cold ---------- */}
      {callState === 'idle' && !apiKey && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[118px] z-20 flex justify-center px-6">
          <p className="anim-rise rounded-full border border-white/[0.08] bg-panel/70 px-4 py-2 text-center font-mono text-[11px] text-dim backdrop-blur-md">
            FaceTime with an agent — plug in a Gemini key{mcp.state !== 'connected' ? ' and an MCP endpoint' : ''}, then hit start
          </p>
        </div>
      )}

      <Captions captions={captions} tools={tools} visible={captionsOn} />

      <PiPWindow stream={stream} cameraOn={camOn} micMuted={!micOn} live={callState === 'live'} />

      <ControlDock
        state={callState}
        micOn={micOn}
        camOn={camOn}
        captionsOn={captionsOn}
        hasKey={!!apiKey.trim()}
        onStart={startCall}
        onEnd={endCall}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleCaptions={() => setCaptionsOn((v) => !v)}
      />

      {/* ---------- toasts ---------- */}
      <div className="pointer-events-none fixed inset-x-0 top-[70px] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-toast flex max-w-[92vw] items-center gap-2.5 rounded-full border border-white/10 bg-[#1a1d24]/95 py-2 pl-3.5 pr-5 shadow-[0_16px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          >
            {t.kind === 'success' && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-live" />}
            {t.kind === 'error' && <IconAlert size={13} className="shrink-0 text-danger" />}
            {t.kind === 'info' && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-cool" />}
            <span className="truncate text-[13px] text-ink/95">{t.text}</span>
          </div>
        ))}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        onApiKey={(v) => {
          setApiKey(v);
          saveLS('halo.apiKey', v);
        }}
        mcpUrl={mcpUrl}
        mcpToken={mcpToken}
        onMcpFields={(u, t) => {
          setMcpUrl(u);
          setMcpToken(t);
          saveLS('halo.mcpUrl', u);
          saveLS('halo.mcpToken', t);
        }}
        mcp={mcp}
        onConnect={() => void connectMcp()}
        onDisconnect={disconnectMcp}
      />
    </div>
  );
}
