import type { ReactNode } from 'react';
import type { CallState } from '../lib/types';
import { cx } from '../lib/utils';
import {
  IconCam,
  IconCamOff,
  IconCaptions,
  IconMic,
  IconMicOff,
  IconPhone,
  IconPhoneDown,
  IconSpinner,
} from './icons';

interface Props {
  state: CallState;
  micOn: boolean;
  camOn: boolean;
  captionsOn: boolean;
  hasKey: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleCaptions: () => void;
}

function RoundBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-[52px] w-[52px] items-center justify-center rounded-full border transition-all duration-200 active:scale-90',
        active
          ? 'border-transparent bg-[#e8e6e1] text-[#141519] shadow-[0_6px_20px_rgba(0,0,0,0.35)]'
          : 'border-white/10 bg-white/[0.06] text-ink/90 hover:bg-white/[0.12]',
      )}
    >
      {children}
    </button>
  );
}

export function ControlDock(p: Props) {
  const inCall = p.state === 'live' || p.state === 'reconnecting';

  return (
    <div className="fixed inset-x-0 bottom-7 z-40 flex justify-center px-4">
      <div className="anim-rise flex items-center gap-2.5 rounded-full border border-white/10 bg-[#14161b]/85 py-2.5 pl-3 pr-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <RoundBtn label={p.micOn ? 'Mute microphone' : 'Unmute microphone'} active={!p.micOn} onClick={p.onToggleMic}>
          {p.micOn ? <IconMic size={21} /> : <IconMicOff size={21} />}
        </RoundBtn>
        <RoundBtn label={p.camOn ? 'Turn camera off' : 'Turn camera on'} active={!p.camOn} onClick={p.onToggleCam}>
          {p.camOn ? <IconCam size={21} /> : <IconCamOff size={21} />}
        </RoundBtn>
        <RoundBtn label={p.captionsOn ? 'Hide live captions' : 'Show live captions'} active={!p.captionsOn} onClick={p.onToggleCaptions}>
          <IconCaptions size={21} />
        </RoundBtn>

        <div className="mx-1 h-8 w-px bg-white/10" />

        {p.state === 'idle' && (
          <button
            type="button"
            onClick={p.onStart}
            className="flex h-[52px] items-center gap-2.5 rounded-full bg-[#2fbf5f] px-6 font-display text-[15px] font-semibold tracking-tight text-[#05130a] shadow-[0_10px_30px_rgba(47,191,95,0.28)] transition-all duration-200 hover:bg-[#3dd46e] active:scale-95"
          >
            <IconPhone size={19} strokeWidth={2.1} />
            {p.hasKey ? 'Start call' : 'Set up & call'}
          </button>
        )}

        {p.state === 'connecting' && (
          <button
            type="button"
            disabled
            className="flex h-[52px] items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] px-6 font-display text-[15px] font-semibold text-dim"
          >
            <IconSpinner size={17} />
            Connecting…
          </button>
        )}

        {p.state === 'reconnecting' && (
          <button
            type="button"
            disabled
            className="flex h-[52px] items-center gap-2.5 rounded-full border border-accent/25 bg-accent/[0.08] px-6 font-display text-[15px] font-semibold text-accent"
          >
            <IconSpinner size={17} />
            Reconnecting…
          </button>
        )}

        {inCall && (
          <button
            type="button"
            onClick={p.onEnd}
            className="flex h-[52px] items-center gap-2.5 rounded-full bg-[#e5484d] px-6 font-display text-[15px] font-semibold tracking-tight text-white shadow-[0_10px_30px_rgba(229,72,77,0.3)] transition-all duration-200 hover:bg-[#f05b60] active:scale-95"
          >
            <IconPhoneDown size={20} strokeWidth={2} />
            End
          </button>
        )}
      </div>
    </div>
  );
}
