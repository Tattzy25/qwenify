/**
 * Realtime audio plumbing.
 *  - `levels`: shared, smoothed loudness meters the UI (sphere, PiP ring) reads.
 *  - `AudioPlayer`: gapless PCM16 @24 kHz playback queue with barge-in flush.
 */

import { base64ToPcm16 } from './utils';

export const levels = {
  /** agent output loudness 0..1 (smoothed) */
  agent: 0,
  /** user mic loudness 0..1 (smoothed) */
  mic: 0,
};

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, data.length));
}

const OUT_RATE = 24000;

export class AudioPlayer {
  readonly ctx: AudioContext;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private td: Float32Array;
  private raf = 0;
  private disposed = false;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: OUT_RATE });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1.0;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.td = new Float32Array(this.analyser.fftSize);
    this.nextStart = this.ctx.currentTime;
    this.loop();
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* resume on next gesture */
      }
    }
    this.nextStart = Math.max(this.nextStart, this.ctx.currentTime);
  }

  enqueue(b64: string): void {
    if (this.disposed || !b64) return;
    try {
      const pcm = base64ToPcm16(b64);
      if (!pcm.length) return;
      const f32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
      const buf = this.ctx.createBuffer(1, f32.length, OUT_RATE);
      buf.copyToChannel(f32, 0);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      const t = Math.max(this.ctx.currentTime + 0.015, this.nextStart);
      src.start(t);
      this.nextStart = t + buf.duration;
      this.sources.add(src);
      src.onended = () => this.sources.delete(src);
    } catch {
      /* never let one bad chunk kill the call */
    }
  }

  /** Barge-in: drop everything queued/playing immediately. */
  interrupt(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextStart = this.ctx.currentTime;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.analyser.getFloatTimeDomainData(this.td as Float32Array<ArrayBuffer>);
    const v = Math.min(1, rms(this.td) * 3.2);
    levels.agent = v > levels.agent ? levels.agent + (v - levels.agent) * 0.4 : levels.agent * 0.86;
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.interrupt();
    this.ctx.close().catch(() => undefined);
  }
}
