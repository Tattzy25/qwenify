import type { Caption, ToolEvent } from '../lib/types';
import { cx } from '../lib/utils';
import { IconAlert, IconCheck, IconSpinner, IconWrench } from './icons';

interface Props {
  captions: Caption[];
  tools: ToolEvent[];
  visible: boolean;
}

export function Captions({ captions, tools, visible }: Props) {
  const shown = captions.slice(-3);
  const shownTools = tools.slice(-3);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[124px] z-20 flex flex-col items-center gap-3 px-6">
      {/* tool activity */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {shownTools.map((t) => (
          <div
            key={t.id}
            className="anim-pop flex items-center gap-1.5 rounded-full border border-white/10 bg-panel/85 px-3 py-1.5 backdrop-blur-md"
            title={t.detail}
          >
            <IconWrench size={12} className="text-accent" />
            <span className="font-mono text-[11px] text-ink/90">{t.name}</span>
            {t.status === 'running' && <IconSpinner size={12} className="text-dim" />}
            {t.status === 'done' && <IconCheck size={12} className="text-live" />}
            {t.status === 'error' && <IconAlert size={12} className="text-danger" />}
          </div>
        ))}
      </div>

      {/* live captions */}
      {visible && (
        <div className="flex w-full max-w-[620px] flex-col items-center gap-1.5">
          {shown.map((c, i) => {
            const age = shown.length - 1 - i;
            return (
              <div
                key={c.id}
                className="anim-rise flex max-w-full flex-col items-center"
                style={{ opacity: age === 0 ? 1 : age === 1 ? 0.5 : 0.26 }}
              >
                <span
                  className={cx(
                    'mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em]',
                    c.speaker === 'agent' ? 'text-accent' : 'text-cool',
                  )}
                >
                  {c.speaker === 'agent' ? 'Halo' : 'You'}
                </span>
                <p className="text-center text-[15px] leading-snug text-ink/95 [text-wrap:balance]">
                  {c.text || (c.final ? '' : '…')}
                  {!c.final && c.text && <span className="text-dim"> ▍</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
