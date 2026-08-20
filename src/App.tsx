import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentSphere } from './components/AgentSphere';
import { Captions } from './components/Captions';
import { CommerceTray } from './components/CommerceTray';
import { ControlDock } from './components/ControlDock';
import { PiPWindow } from './components/PiPWindow';
import { ProductGrid } from './components/ProductGrid';
import { IconAlert, IconKey, IconX, Logo } from './components/icons';
import { discoverAgent, resolveProvision } from './lib/commerce/endpoint';
import { createStorefront, type StorefrontBridge } from './lib/commerce/storefront';
import type { CommerceBatch, ProductCardData } from './lib/commerce/types';
import { McpHttpClient } from './lib/mcp';
import { LiveCall } from './lib/session';
import type { AgentMode, CallState, Caption, Toast, ToolEvent } from './lib/types';
import { cx, formatClock, hostOf, saveLS } from './lib/utils';

interface UcpStatus {
  phase: 'off' | 'connecting' | 'live';
  tools: number;
  host?: string;
  serverName?: string;
  note?: string;
}

export default function App() {
  const provision = useMemo(() => resolveProvision(), []);

  const [apiKey, setApiKey] = useState(provision.apiKey);
  const [callState, setCallState] = useState<CallState>('idle');
  const [mode, setMode] = useState<AgentMode>('idle');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [commerce, setCommerce] = useState<CommerceBatch | null>(null);
  const [productGrid, setProductGrid] = useState<{ visible: boolean; products: ProductCardData[] }>({ visible: false, products: [] });
  const [ucp, setUcp] = useState<UcpStatus>({ phase: 'off', tools: 0 });
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<{ secs: number; lines: number; toolCalls: number } | null>(null);
  const [keyStrip, setKeyStrip] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [cartCount, setCartCount] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const sessionRef = useRef<LiveCall | null>(null);
  const mcpClientRef = useRef<McpHttpClient | null>(null);
  const storefrontRef = useRef<StorefrontBridge | null>(null);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  const captionsRef = useRef<Caption[]>([]);
  const callStartedRef = useRef<number | null>(null);
  const toolCallsRef = useRef(0);
  const seqRef = useRef(0);
  const timerRef = useRef(0);

  /* ---------- toasts ---------- */
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seqRef.current;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* ---------- live session events ---------- */
  useEffect(() => {
    captionsRef.current = captions;
  }, [captions]);

  const onState = useCallback((s: CallState) => {
    setCallState(s);
    if (s === 'live') {
      if (callStartedRef.current == null) {
        callStartedRef.current = Date.now();
        toolCallsRef.current = 0;
      }
      setElapsed(0);
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (s === 'idle') {
      window.clearInterval(timerRef.current);
      setCommerce(null);
      if (callStartedRef.current != null) {
        const secs = Math.max(1, Math.round((Date.now() - callStartedRef.current) / 1000));
        callStartedRef.current = null;
        setSummary({ secs, lines: captionsRef.current.length, toolCalls: toolCallsRef.current });
      }
    }
  }, []);

  const onMode = useCallback((m: AgentMode) => setMode(m), []);
  const onStream = useCallback((s: MediaStream | null) => setStream(s), []);
  const onCommerce = useCallback((b: CommerceBatch | null) => {
    setCommerce(b);
    // Show product grid in center of orb when products are returned
    if (b?.kind === 'products' && b.items.length > 0) {
      setProductGrid({ visible: true, products: b.items });
    } else if (!b) {
      setProductGrid({ visible: false, products: [] });
    }
  }, []);

  const onCaption = useCallback((c: Caption) => {
    setCaptions((prev) => {
      if (c.text === '' && c.final) {
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
    if (t.status === 'running') toolCallsRef.current += 1;
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
      onCommerce,
      onNotice: pushToast,
    });
    sessionRef.current = session;
    return () => {
      window.clearInterval(timerRef.current);
      session.end();
    };
  }, [onState, onMode, onCaption, onTool, onStream, onCommerce, pushToast]);

  /* ---------- storefront discovery layer ---------- */
  useEffect(() => {
    const sf = createStorefront(() => setCartCount(sf.cart?.totalQuantity ?? null));
    storefrontRef.current = sf;
  }, []);

  /* ---------- UCP-over-MCP auto-connect ---------- */
  useEffect(() => {
    const url = provision.ucpUrl;
    if (!url || !/^https?:\/\//i.test(url)) return;
    let cancelled = false;
    setUcp({ phase: 'connecting', tools: 0, host: hostOf(url) });

    const client = new McpHttpClient(url, provision.ucpToken || undefined);
    void client
      .initialize()
      .then(() => client.listTools())
      .then(async (list) => {
        if (cancelled) return;
        mcpClientRef.current?.disconnect();
        mcpClientRef.current = client;
        const info = await discoverAgent(url);
        if (cancelled) return;
        setCapabilities(info.ucpCapabilities);
        setUcp({
          phase: 'live',
          tools: list.length,
          host: hostOf(url),
          serverName: info.serverName ?? client.serverName,
        });
        pushToast(
          info.serverName
            ? `${info.serverName} linked — ${list.length} commerce tool${list.length === 1 ? '' : 's'} ready`
            : `Commerce linked — ${list.length} tool${list.length === 1 ? '' : 's'} ready`,
          'success',
        );
        if (sessionRef.current?.isActive) void sessionRef.current.reloadTools(client);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setUcp({ phase: 'off', tools: 0, host: hostOf(url), note: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [provision, pushToast]);

  /* ---------- call controls ---------- */
  const startCall = (): void => {
    if (!apiKeyRef.current.trim()) {
      setKeyDraft('');
      setKeyStrip(true);
      pushToast('Provision your Gemini API key to go live', 'info');
      return;
    }
    void sessionRef.current?.start(apiKeyRef.current.trim(), mcpClientRef.current);
  };

  const saveKeyAndStart = (): void => {
    const k = keyDraft.trim();
    if (!k) return;
    setApiKey(k);
    saveLS('halo.apiKey', k);
    setKeyStrip(false);
    void sessionRef.current?.start(k, mcpClientRef.current);
  };

  const endCall = (): void => sessionRef.current?.end();

  /* ---------- commerce actions ---------- */
  const addToCart = (p: ProductCardData): void => {
    const sf = storefrontRef.current;
    if (sf?.detected) {
      void sf.addToCart(p.id, 1).then((ok) => {
        pushToast(
          ok ? `Added to the storefront cart` : `Storefront declined — asked Halo instead`,
          ok ? 'success' : 'info',
        );
        if (!ok) sessionRef.current?.sendText(`Please add "${p.title}" to my checkout.`);
      });
      return;
    }
    sessionRef.current?.sendText(`Please add "${p.title}" to my checkout.`);
    pushToast('Asked Halo to add it to your checkout', 'info');
  };

  const agentSay = (text: string): void => sessionRef.current?.sendText(text);
  const openCart = (): void => storefrontRef.current?.openCart();

  const sendImage = (file: File): void => {
    if (callState !== 'live' || imageBusy) return;
    setImageBusy(true);
    const done = (ok: boolean): void => {
      setImageBusy(false);
      pushToast(
        ok ? 'Photo shared — Halo is taking a look' : 'Could not send that image',
        ok ? 'success' : 'error',
      );
    };
    void sessionRef.current?.sendImageBlob(file).then(
      () => done(true),
      () => done(false),
    );
  };

  /* ---------- keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'c') setCaptionsOn((v) => !v);
      else if (k === 'e' && (callState === 'live' || callState === 'reconnecting')) endCall();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

      {/* ---------- product grid in center of orb ---------- */}
      <ProductGrid
        products={productGrid.products}
        visible={productGrid.visible}
        onClose={() => setProductGrid({ visible: false, products: [] })}
        onAddToCart={addToCart}
        onAgentSay={agentSay}
      />

      {/* ---------- commerce tray ---------- */}
      {commerce && (
        <CommerceTray
          batch={commerce}
          capabilities={capabilities}
          storefront={{ detected: !!storefrontRef.current?.detected, count: cartCount }}
          onClose={() => setCommerce(null)}
          onAddToCart={addToCart}
          onAgentSay={agentSay}
          onOpenCart={openCart}
        />
      )}

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
          <div
            className="hidden min-[430px]:flex items-center gap-2 rounded-full border border-white/10 bg-panel/80 py-1.5 pl-3 pr-3.5 backdrop-blur-md"
            title={
              ucp.phase === 'live'
                ? `${ucp.serverName ?? 'Commerce agent'} · ${ucp.host}`
                : ucp.note ?? (provision.ucpUrl ? `Connecting to ${ucp.host}` : 'No commerce endpoint provisioned')
            }
          >
            <span
              className={cx(
                'h-[7px] w-[7px] rounded-full',
                ucp.phase === 'live' ? 'bg-live dot-pulse' : ucp.phase === 'connecting' ? 'bg-accent dot-pulse' : 'bg-dim/60',
              )}
            />
            <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink/85">
              {ucp.phase === 'live'
                ? `UCP · ${ucp.tools} tool${ucp.tools === 1 ? '' : 's'}`
                : ucp.phase === 'connecting'
                  ? 'UCP linking'
                  : provision.shop || ucp.host
                    ? `UCP · ${ucp.host ?? hostOf(provision.shop)}`
                    : 'UCP off'}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-panel/80 py-1.5 pl-3 pr-3.5 backdrop-blur-md">
            <span className={cx('h-[7px] w-[7px] rounded-full', statusDot)} />
            <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink/85">
              {statusLabel}
            </span>
          </div>
        </div>
      </header>

      {/* ---------- cold hint ---------- */}
      {callState === 'idle' && !provision.ucpUrl && !apiKey && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[118px] z-20 flex justify-center px-6">
          <p className="anim-rise rounded-full border border-white/[0.08] bg-panel/70 px-4 py-2 text-center font-mono text-[11px] text-dim backdrop-blur-md">
            FaceTime with your commerce agent — launch with ?ucp=…&key=… or provision below
          </p>
        </div>
      )}

      <Captions captions={captions} tools={tools} visible={captionsOn} />

      <PiPWindow stream={stream} cameraOn micMuted={false} live={callState === 'live'} />

      {/* ---------- inline key provisioning ---------- */}
      {keyStrip && (
        <div className="fixed inset-x-0 bottom-[106px] z-40 flex justify-center px-4">
          <div className="anim-pop flex w-full max-w-[430px] items-center gap-2 rounded-[16px] border border-accent/25 bg-[#14161b]/95 p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <IconKey size={15} className="ml-1 shrink-0 text-accent" />
            <input
              autoFocus
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKeyAndStart();
                if (e.key === 'Escape') setKeyStrip(false);
              }}
              placeholder="Gemini API key"
              autoComplete="off"
              spellCheck={false}
              className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-dim/50"
            />
            <button
              type="button"
              onClick={saveKeyAndStart}
              className="h-10 shrink-0 rounded-xl bg-accent px-4 font-display text-[13px] font-semibold text-[#1c1204] transition-all hover:brightness-110 active:scale-95"
            >
              Save & call
            </button>
            <button
              type="button"
              onClick={() => setKeyStrip(false)}
              aria-label="Dismiss"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim hover:bg-white/[0.07] hover:text-ink"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>
      )}

      <ControlDock
        state={callState}
        captionsOn={captionsOn}
        imageBusy={imageBusy}
        onStart={startCall}
        onEnd={endCall}
        onToggleCaptions={() => setCaptionsOn((v) => !v)}
        onSendImage={sendImage}
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

      {/* ---------- call summary ---------- */}
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[5px]" onClick={() => setSummary(null)} />
          <div className="anim-pop relative w-[min(340px,92vw)] rounded-[20px] border border-white/10 bg-[#14161b] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-live/[0.12] text-live">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h3 className="font-display text-[16px] font-semibold tracking-tight">Call ended</h3>
            <div className="mt-3 flex items-center justify-center divide-x divide-white/[0.08]">
              <div className="px-3.5">
                <div className="font-display text-[19px] font-bold">{formatClock(summary.secs)}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Duration</div>
              </div>
              <div className="px-3.5">
                <div className="font-display text-[19px] font-bold">{summary.lines}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Captions</div>
              </div>
              <div className="px-3.5">
                <div className="font-display text-[19px] font-bold">{summary.toolCalls}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Tool calls</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSummary(null);
                setCaptions([]);
                setTools([]);
              }}
              className="mt-4 h-10 w-full rounded-xl bg-white/[0.07] font-display text-[13.5px] font-semibold text-ink/90 transition-colors hover:bg-white/[0.12]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
