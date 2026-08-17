import { useEffect, useRef, useState } from 'react';
import { levels } from '../lib/audio';
import { cx, clamp, loadLS, saveLS } from '../lib/utils';
import { IconMicOff } from './icons';

interface Props {
  stream: MediaStream | null;
  cameraOn: boolean;
  micMuted: boolean;
  live: boolean;
}

const SIZE_KEY = 'halo.pip';

export function PiPWindow({ stream, cameraOn, micMuted, live }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<'sm' | 'lg'>(() => (loadLS<string>(SIZE_KEY, 'sm') === 'lg' ? 'lg' : 'sm'));
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  const width = size === 'sm' ? 184 : 288;
  const height = Math.round((width * 9) / 16) + 2;

  // attach the camera stream
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => undefined);
  }, [stream, cameraOn]);

  // default position: bottom-right, above the dock
  useEffect(() => {
    if (pos == null && stream) {
      setPos({
        x: window.innerWidth - width - 20,
        y: window.innerHeight - height - 118,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // mic level ring
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      if (ringRef.current) {
        ringRef.current.style.opacity = String(clamp(levels.mic * 1.15, 0, 1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!stream) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!tileRef.current || !pos) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    setPos({
      x: clamp(e.clientX - dragOffset.current.dx, 10, window.innerWidth - width - 10),
      y: clamp(e.clientY - dragOffset.current.dy, 64, window.innerHeight - height - 14),
    });
  };
  const onPointerUp = (): void => {
    setDragging(false);
  };

  return (
    <div
      ref={tileRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => {
        const next = size === 'sm' ? 'lg' : 'sm';
        setSize(next);
        saveLS(SIZE_KEY, next);
      }}
      className={cx(
        'anim-pop fixed z-30 select-none overflow-hidden rounded-[20px] border border-white/12 bg-[#0c0d10] shadow-[0_24px_70px_rgba(0,0,0,0.6)]',
        dragging ? 'cursor-grabbing scale-[1.02]' : 'cursor-grab hover:border-white/22',
      )}
      style={{
        left: pos?.x ?? -9999,
        top: pos?.y ?? -9999,
        width,
        height,
        transition: dragging ? 'none' : 'width .25s cubic-bezier(.22,1,.36,1), height .25s cubic-bezier(.22,1,.36,1), border-color .2s',
        touchAction: 'none',
      }}
      title="Drag to move · double-click to resize"
    >
      {/* self view */}
      {cameraOn ? (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#14161b]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 font-display text-sm font-semibold text-dim">
            U
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">camera off</span>
        </div>
      )}

      {/* mic level ring */}
      <div
        ref={ringRef}
        className="pointer-events-none absolute inset-0 rounded-[20px] shadow-[inset_0_0_0_2.5px_rgba(125,185,221,0.95)]"
        style={{ opacity: 0 }}
      />

      {/* bottom gradient + label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="pointer-events-none absolute bottom-1.5 left-2 flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-white/85">You</span>
        {live && (
          <span className="h-1 w-1 rounded-full bg-live dot-pulse" />
        )}
      </div>

      {/* mic muted badge */}
      {micMuted && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger/90 text-white shadow-lg">
          <IconMicOff size={13} strokeWidth={2.2} />
        </div>
      )}
    </div>
  );
}
