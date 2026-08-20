/* Halo PCM capture worklet.
 * Resamples the mic to 16 kHz PCM (float32 chunks of 100 ms) regardless of
 * the AudioContext sample rate, using linear interpolation. */
class HaloPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.ratio = sampleRate / this.targetRate;
    this.pos = 0; // fractional carry-over position between process() calls
    this.chunk = new Float32Array(Math.round(this.targetRate / 10)); // 100 ms
    this.filled = 0;
    this.last = 0;
    this.active = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.active = false;
    };
  }

  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const data = input[0];

    let p = this.pos;
    while (p < data.length - 1) {
      const i = p | 0;
      const f = p - i;
      const s = data[i] * (1 - f) + data[i + 1] * f;
      this.last = s;
      this.chunk[this.filled++] = s;
      if (this.filled >= this.chunk.length) {
        this.port.postMessage(this.chunk.slice(0));
        this.filled = 0;
      }
      p += this.ratio;
    }
    this.pos = p - data.length;
    if (this.pos < 0) this.pos = 0;
    return true;
  }
}

registerProcessor('halo-pcm', HaloPcmProcessor);
