/**
 * LiveCall — orchestrates the Gemini Live session, the mic/camera pipelines,
 * the 24 kHz playback queue and MCP tool execution.
 */

import { GoogleGenAI } from '@google/genai';
import { AudioPlayer, levels } from './audio';
import type { AgentMode, CallState, Caption, ToolEvent } from './types';
import { arrayBufferToBase64, float32ToPcm16Base64 } from './utils';
import type { McpHttpClient } from './mcp';
import type { GeminiFunctionDeclaration } from './schema';

export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const SYSTEM_PROMPT = `You are Halo, a warm, sharp companion on a live FaceTime-style video call.
You can hear the user's voice and see frames from their camera.
Speak naturally and briefly — one to three sentences per turn, like a real phone call. No lists, no markdown.
Match the user's language automatically.`;

export interface LiveCallEvents {
  onState: (s: CallState) => void;
  onMode: (m: AgentMode) => void;
  onCaption: (c: Caption) => void;
  onTool: (t: ToolEvent) => void;
  onStream: (s: MediaStream | null) => void;
  onNotice: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

type FnCall = { id?: string; name: string; args?: Record<string, unknown> };

export class LiveCall {
  private events: LiveCallEvents;
  private ai: GoogleGenAI | null = null;
  private session: any = null;

  private stream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micTd: Float32Array | null = null;
  private micRaf = 0;
  private player: AudioPlayer | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private frameCanvas: HTMLCanvasElement | null = null;
  private frameTimer = 0;

  private declarations: GeminiFunctionDeclaration[] = [];
  private mcp: McpHttpClient | null = null;

  private state: CallState = 'idle';
  private mode: AgentMode = 'idle';
  muted = false;
  cameraEnabled = true;

  private captionSeq = 0;
  private toolSeq = 0;
  private agentCaptionId: number | null = null;
  private userCaptionId: number | null = null;

  private suppressClose = false;
  private ended = true;

  constructor(events: LiveCallEvents) {
    this.events = events;
  }

  get isActive(): boolean {
    return this.state === 'live' || this.state === 'reconnecting' || this.state === 'connecting';
  }

  private setState(s: CallState): void {
    this.state = s;
    this.events.onState(s);
  }

  private setMode(m: AgentMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.events.onMode(m);
  }

  /* ---------------- lifecycle ---------------- */

  async start(apiKey: string, mcp: McpHttpClient | null): Promise<void> {
    if (this.isActive) return;
    this.ended = false;
    this.mcp = mcp;
    this.declarations = mcp?.prepared.declarations ?? [];
    this.setState('connecting');
    this.setMode('waking');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      if (this.ended) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.cameraEnabled = true;
      this.muted = false;
      this.events.onStream(stream);

      await this.setupMicPipeline(stream);
      this.setupCameraPipeline(stream);
      this.player = new AudioPlayer();
      await this.player.resume();

      this.ai = new GoogleGenAI({ apiKey });
      await this.connectSocket();
    } catch (err) {
      this.teardown();
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        this.events.onNotice('Camera or microphone permission was denied.', 'error');
      } else if (e?.name === 'NotFoundError') {
        this.events.onNotice('No camera or microphone found on this device.', 'error');
      } else {
        this.events.onNotice(`Could not start the call — ${e?.message ?? err}`, 'error');
      }
      this.setState('idle');
      this.setMode('idle');
    }
  }

  private buildConfig(): Record<string, unknown> {
    const toolNote = this.declarations.length
      ? `\nYou have ${this.declarations.length} external tool(s) connected via MCP (${this.declarations
          .slice(0, 12)
          .map((d) => d.name)
          .join(', ')}${this.declarations.length > 12 ? '…' : ''}). Call them whenever they would help, and summarize results in one short spoken sentence.`
      : '';
    const config: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT + toolNote }] },
      realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
    };
    if (this.declarations.length) {
      config.tools = [{ functionDeclarations: this.declarations }];
    }
    return config;
  }

  private async connectSocket(): Promise<void> {
    if (!this.ai) return;
    this.session = await this.ai.live.connect({
      model: LIVE_MODEL,
      config: this.buildConfig() as never,
      callbacks: {
        onopen: () => undefined,
        onmessage: (msg: unknown) => this.handleMessage(msg as Record<string, any>),
        onerror: (err: unknown) => {
          const msg = (err as { message?: string })?.message ?? 'Live connection error';
          this.events.onNotice(msg, 'error');
        },
        onclose: () => {
          if (this.suppressClose) return;
          if (!this.ended) {
            this.events.onNotice('The live session closed.', 'error');
            this.teardown();
            this.setState('idle');
            this.setMode('idle');
          }
        },
      },
    });
  }

  /** Swap in freshly connected MCP tools — requires a session restart. */
  async reloadTools(mcp: McpHttpClient | null): Promise<void> {
    this.mcp = mcp;
    this.declarations = mcp?.prepared.declarations ?? [];
    if (this.state !== 'live') return;
    this.setState('reconnecting');
    this.suppressClose = true;
    try {
      this.session?.close();
    } catch {
      /* already gone */
    }
    this.session = null;
    try {
      await this.connectSocket();
      this.events.onNotice(
        this.declarations.length ? `Reloaded with ${this.declarations.length} tool${this.declarations.length === 1 ? '' : 's'}.` : 'Tools detached.',
        'success',
      );
    } catch (err) {
      this.events.onNotice(`Reconnect failed — ${(err as Error).message}`, 'error');
      this.teardown();
      this.setState('idle');
      this.setMode('idle');
      return;
    }
    this.suppressClose = false;
  }

  end(): void {
    this.ended = true;
    this.suppressClose = false;
    try {
      this.session?.close();
    } catch {
      /* noop */
    }
    this.session = null;
    this.teardown();
    this.setState('idle');
    this.setMode('idle');
  }

  private teardown(): void {
    window.clearInterval(this.frameTimer);
    cancelAnimationFrame(this.micRaf);
    try {
      this.worklet?.port.postMessage('stop');
    } catch { /* noop */ }
    if (this.worklet) {
      try { this.worklet.disconnect(); } catch { /* noop */ }
      this.worklet = null;
    }
    this.micCtx?.close().catch(() => undefined);
    this.micCtx = null;
    this.micAnalyser = null;
    this.player?.dispose();
    this.player = null;
    this.hiddenVideo?.pause();
    if (this.hiddenVideo) {
      this.hiddenVideo.srcObject = null;
      this.hiddenVideo = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.stream) {
      this.events.onStream(null);
      this.stream = null;
    }
    levels.agent = 0;
    levels.mic = 0;
  }

  /* ---------------- mic ---------------- */

  private async setupMicPipeline(stream: MediaStream): Promise<void> {
    const ctx = new AudioContext();
    this.micCtx = ctx;
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
    const source = ctx.createMediaStreamSource(stream);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.55;
    source.connect(analyser);
    this.micAnalyser = analyser;
    this.micTd = new Float32Array(analyser.fftSize);
    const tick = (): void => {
      if (!this.micAnalyser || !this.micTd) return;
      this.micAnalyser.getFloatTimeDomainData(this.micTd as Float32Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this.micTd.length; i++) sum += this.micTd[i] * this.micTd[i];
      const v = this.muted ? 0 : Math.min(1, Math.sqrt(sum / this.micTd.length) * 4.2);
      levels.mic = v > levels.mic ? levels.mic + (v - levels.mic) * 0.45 : levels.mic * 0.82;
      this.micRaf = requestAnimationFrame(tick);
    };
    tick();

    const node = new AudioWorkletNode(ctx, 'halo-pcm');
    node.port.onmessage = (e: MessageEvent) => this.handleMicChunk(e.data as Float32Array);
    source.connect(node);
    this.worklet = node;
  }

  private handleMicChunk(samples: Float32Array): void {
    if (this.muted || this.ended || !this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: float32ToPcm16Base64(samples), mimeType: 'audio/pcm;rate=16000' },
      });
    } catch {
      /* session may be mid-rotation */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (m && this.session) {
      // Flush any audio the model is still holding.
      try {
        this.session.sendRealtimeInput({
          audioStreamEnd: { mimeType: 'audio/pcm;rate=16000' },
        } as never);
      } catch { /* best effort */ }
    }
  }

  /* ---------------- camera ---------------- */

  private setupCameraPipeline(stream: MediaStream): void {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    video.play().catch(() => undefined);
    this.hiddenVideo = video;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    this.frameCanvas = canvas;

    this.frameTimer = window.setInterval(() => this.captureFrame(), 1000);
  }

  setCameraEnabled(on: boolean): void {
    this.cameraEnabled = on;
    this.stream?.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  private captureFrame(): void {
    if (this.ended || !this.session || !this.cameraEnabled) return;
    if (document.hidden) return;
    const video = this.hiddenVideo;
    const canvas = this.frameCanvas;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    try {
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || this.ended || !this.session) return;
          blob.arrayBuffer().then((buf) => {
            try {
              this.session.sendRealtimeInput({
                video: { data: arrayBufferToBase64(buf), mimeType: 'image/jpeg' },
              });
            } catch { /* mid-rotation */ }
          });
        },
        'image/jpeg',
        0.6,
      );
    } catch {
      /* drawImage can throw on detached tracks */
    }
  }

  /* ---------------- inbound messages ---------------- */

  private handleMessage(msg: Record<string, any>): void {
    if (!msg) return;

    if (msg.setupComplete) {
      if (this.state !== 'live') {
        const wasReconnect = this.state === 'reconnecting';
        this.setState('live');
        this.setMode('idle');
        if (!wasReconnect) this.events.onNotice('Live — say hi.', 'success');
      }
    }

    const sc = msg.serverContent;
    if (sc) {
      const parts = sc.modelTurn?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          const data = p?.inlineData?.data;
          if (typeof data === 'string' && data) {
            this.player?.enqueue(data);
            this.setMode('speaking');
          }
        }
      }

      if (typeof sc.outputTranscription?.text === 'string' && sc.outputTranscription.text) {
        this.setMode('speaking');
        if (this.agentCaptionId == null) this.agentCaptionId = ++this.captionSeq;
        this.events.onCaption({
          id: this.agentCaptionId,
          speaker: 'agent',
          text: sc.outputTranscription.text,
          final: false,
        });
      }

      if (typeof sc.inputTranscription?.text === 'string' && sc.inputTranscription.text) {
        this.setMode('listening');
        if (this.userCaptionId == null) this.userCaptionId = ++this.captionSeq;
        this.events.onCaption({
          id: this.userCaptionId,
          speaker: 'user',
          text: sc.inputTranscription.text,
          final: false,
        });
      }

      if (sc.interrupted) {
        this.player?.interrupt();
        this.finalizeCaption('agent');
      }

      if (sc.turnComplete) {
        this.finalizeCaption('agent');
        this.finalizeCaption('user');
        this.setMode('listening');
      }
    }

    const calls: FnCall[] | undefined = msg.toolCall?.functionCalls;
    if (Array.isArray(calls) && calls.length) {
      void this.runToolCalls(calls);
    }

    if (msg.goAway) {
      this.events.onNotice('Session rotating — reconnecting seamlessly…', 'info');
      void this.reloadTools(this.mcp);
    }
  }

  private finalizeCaption(speaker: 'user' | 'agent'): void {
    const id = speaker === 'agent' ? this.agentCaptionId : this.userCaptionId;
    if (id != null) {
      // mark final via a no-op update carrying the final flag
      this.events.onCaption({ id, speaker, text: '', final: true });
    }
    if (speaker === 'agent') this.agentCaptionId = null;
    else this.userCaptionId = null;
  }

  /* ---------------- tools ---------------- */

  private async runToolCalls(calls: FnCall[]): Promise<void> {
    const responses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];

    await Promise.all(
      calls.map(async (call) => {
        const evId = ++this.toolSeq;
        this.events.onTool({ id: evId, name: call.name, status: 'running' });
        try {
          if (!this.mcp) throw new Error('No MCP endpoint connected');
          const { text, isError } = await this.mcp.callTool(call.name, call.args ?? {});
          responses.push({
            id: call.id,
            name: call.name,
            response: { result: text.slice(0, 12000), isError },
          });
          this.events.onTool({
            id: evId,
            name: call.name,
            status: isError ? 'error' : 'done',
            detail: text.slice(0, 120),
          });
        } catch (err) {
          responses.push({
            id: call.id,
            name: call.name,
            response: { error: (err as Error).message || String(err) },
          });
          this.events.onTool({ id: evId, name: call.name, status: 'error', detail: (err as Error).message });
        }
      }),
    );

    // The Live API waits synchronously for tool results — send them back as one batch.
    try {
      this.session?.sendToolResponse({ functionResponses: responses } as never);
    } catch (err) {
      this.events.onNotice(`Tool response failed — ${(err as Error).message}`, 'error');
    }
  }
}
