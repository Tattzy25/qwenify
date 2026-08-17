import { useEffect, useRef } from 'react';
import { levels } from '../lib/audio';
import type { AgentMode } from '../lib/types';

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uAgent;  // agent voice energy 0..1
uniform float uMic;    // user voice energy 0..1
uniform float uMode;   // 0 idle · 1 waking · 2 listening · 3 speaking

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm4(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.11 + 7.3; a *= 0.5; }
  return v;
}

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// height field on the unit sphere surface
float surfH(vec3 n, float t) {
  vec3 q = n * 1.9;
  q.xz = rot2(t * 0.10) * q.xz;
  q.yz = rot2(t * 0.06) * q.yz;
  return fbm4(q + 0.42 * fbm3(q + t * 0.05));
}

void main() {
  float t = uTime;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  float wakeW   = smoothstep(0.5, 1.0, uMode) * (1.0 - smoothstep(1.5, 2.0, uMode));
  float listenW = smoothstep(1.5, 2.0, uMode) * (1.0 - smoothstep(2.5, 3.0, uMode));
  float speakW  = smoothstep(2.5, 3.0, uMode);

  vec3 warm  = vec3(1.00, 0.60, 0.24);
  vec3 cool  = vec3(0.42, 0.72, 0.98);
  vec3 champ = vec3(0.90, 0.82, 0.66);

  // ---- ambient scene ----
  vec3 col = vec3(0.030, 0.033, 0.042);
  col += vec3(0.055, 0.040, 0.022) * exp(-length(uv - vec2(-0.62,  0.55)) * 1.5);
  col += vec3(0.016, 0.030, 0.046) * exp(-length(uv - vec2( 0.70, -0.45)) * 1.3);
  col += vec3(0.014) * (1.0 - smoothstep(0.0, 1.25, length(uv)));

  // sparse dust
  vec2 g = floor(gl_FragCoord.xy / 3.0);
  float d = hash31(vec3(g, 7.0));
  col += step(0.9972, d) * (0.5 + 0.5 * sin(t * 1.7 + d * 90.0)) * 0.055;

  // sonar rings while the agent speaks
  float rr = length(uv);
  float ring = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(t * 0.22 + float(i) / 3.0);
    ring += (1.0 - ph) * smoothstep(0.014, 0.0, abs(rr - (0.36 + ph * 0.62)));
  }
  col += ring * (0.30 * uAgent * speakW + 0.10 * wakeW) * warm;

  // ---- sphere ----
  float R = 0.95 + 0.018 * sin(t * 0.7) + 0.05 * uAgent;
  vec3 center = vec3(0.0, 0.02 * sin(t * 0.5), 0.0);
  vec3 ro = vec3(0.0, 0.0, 3.1) - center;
  vec3 rd = normalize(vec3(uv, -1.55));
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float disc = b * b - c;

  if (disc > 0.0) {
    float tt = -b - sqrt(disc);
    vec3 p = ro + rd * tt;
    vec3 n = normalize(p);

    float w = surfH(n, t);
    float rip = vnoise(n * 7.0 + vec3(0.0, t * 1.1, t * 0.4));

    // pseudo bump-mapping
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(n, up));
    vec3 B = normalize(cross(n, T));
    float e = 0.07;
    float hT = surfH(normalize(n + T * e), t);
    float hB = surfH(normalize(n + B * e), t);
    float bumpAmt = 0.28 + 0.55 * uAgent + 0.45 * uMic + rip * 0.5 * uMic;
    vec3 n2 = normalize(n + (T * (w - hT) + B * (w - hB)) * bumpAmt);
    n2 = normalize(n2 + (T * sin(rip * 12.0) + B * cos(rip * 11.0)) * 0.10 * uMic);

    // lighting
    vec3 L = normalize(vec3(0.55, 0.72, 0.62));
    float dif = max(dot(n2, L), 0.0);
    float spec = pow(max(dot(reflect(rd, n2), L), 0.0), 52.0);
    float fres = pow(1.0 - max(dot(n2, -rd), 0.0), 2.6);

    // palettes per state
    vec3 base = mix(vec3(0.050, 0.053, 0.062), vec3(0.118, 0.122, 0.136), w * 0.8 + rip * 0.2);
    float veins = smoothstep(0.48, 0.86, w);

    vec3 energyCol = mix(champ * 0.45, mix(cool, warm, speakW), max(listenW, speakW));
    float amp = 0.10
      + 1.6 * uAgent * speakW
      + 1.15 * uMic * listenW
      + 0.30 * wakeW * (0.5 + 0.5 * sin(t * 5.0))
      + 0.18 * wakeW;
    vec3 energy = energyCol * veins * amp;

    vec3 rimCol = mix(champ * 0.30, mix(cool, warm, speakW), max(listenW * 0.85, speakW));
    float rimAmp = 0.5 + 0.95 * uAgent * speakW + 0.55 * uMic * listenW + 0.4 * wakeW;

    col = base * (0.32 + 0.9 * dif)
        + energy
        + fres * rimCol * rimAmp
        + spec * vec3(1.0, 0.96, 0.88) * (0.55 + 0.6 * uAgent);
  }

  // floor sheen
  col += vec3(0.085, 0.062, 0.040) * exp(-abs(uv.y + 1.08) * 5.0) * 0.55;

  // vignette + grain
  col *= 1.0 - 0.42 * pow(length(uv * vec2(0.72, 1.0)), 2.4);
  col += (hash31(vec3(gl_FragCoord.xy, fract(t) * 61.0)) - 0.5) * 0.014;
  col = pow(max(col, 0.0), vec3(0.94));

  outColor = vec4(col, 1.0);
}`;

const MODE_TARGET: Record<AgentMode, number> = {
  idle: 0,
  waking: 1,
  listening: 2,
  speaking: 3,
};

export function AgentSphere({ mode }: { mode: AgentMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<AgentMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return;

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uAgent = gl.getUniformLocation(prog, 'uAgent');
    const uMic = gl.getUniformLocation(prog, 'uMic');
    const uMode = gl.getUniformLocation(prog, 'uMode');

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let agentSm = 0;
    let micSm = 0;
    let modeSm = 0;
    let raf = 0;
    const t0 = performance.now();

    const frame = (): void => {
      resize();
      const t = (performance.now() - t0) / 1000;
      const aT = levels.agent;
      const mT = levels.mic;
      const moT = MODE_TARGET[modeRef.current];
      agentSm += (aT - agentSm) * (aT > agentSm ? 0.35 : 0.10);
      micSm += (mT - micSm) * (mT > micSm ? 0.35 : 0.10);
      modeSm += (moT - modeSm) * 0.07;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAgent, agentSm);
      gl.uniform1f(uMic, micSm);
      gl.uniform1f(uMode, modeSm);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-label="Halo agent"
      role="img"
    />
  );
}
