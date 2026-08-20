/**
 * ProductGrid — Dynamic product grid rendered in the center of the AgentSphere.
 * Designed for embedded Shopify app use with BYOK (Bring Your Own Key).
 * 
 * Features:
 * - Centered modal within the orb's visual space
 * - Rounded corners, smooth animations
 * - Event-driven click handling for cart actions
 * - PIP window compatibility (doesn't block agent view)
 * - Responsive grid layout (1-3 columns based on viewport)
 */

import type { ProductCardData } from '../lib/commerce/types';
import { formatMoney } from '../lib/commerce/normalize';
import { cx } from '../lib/utils';
import { IconBag, IconImage, IconX } from './icons';

interface Props {
  products: ProductCardData[];
  visible: boolean;
  onClose: () => void;
  onAddToCart: (p: ProductCardData) => void;
  onAgentSay?: (text: string) => void;
}

export function ProductGrid({ products, visible, onClose, onAddToCart, onAgentSay }: Props) {
  if (!visible || products.length === 0) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="anim-pop pointer-events-auto w-full max-w-[720px] px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#101217]/92 shadow-[0_40px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
            <IconBag size={14} className="shrink-0 text-accent" />
            <span className="truncate font-display text-[13.5px] font-semibold tracking-tight">
              {products.length} product{products.length === 1 ? '' : 's'} found
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/[0.07] hover:text-ink"
            >
              <IconX size={14} />
            </button>
          </div>

          {/* Grid */}
          <div className="slim-scroll max-h-[52vh] overflow-y-auto p-3">
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lap:grid-cols-3">
              {products.map((p, i) => (
                <ProductCard key={`${p.id}-${i}`} p={p} onAdd={() => onAddToCart(p)} onAgentSay={onAgentSay} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- product card ---------------- */

function ProductCard({
  p,
  onAdd,
  onAgentSay,
}: {
  p: ProductCardData;
  onAdd: () => void;
  onAgentSay?: (text: string) => void;
}) {
  const handleAdd = (): void => {
    // Event-driven: notify agent of cart action
    onAgentSay?.(`Add "${p.title}" to my checkout.`);
    onAdd();
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/[0.05]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0b0d11]">
        {p.image ? (
          <img
            src={p.image}
            alt={p.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.045]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-dim/50">
            <IconImage size={22} />
          </div>
        )}
        {!p.available && (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-dim backdrop-blur-sm">
            Sold out
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        {p.brand && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            {p.brand}
          </span>
        )}
        <span className="line-clamp-2 text-[12.5px] font-medium leading-snug text-ink/95">
          {p.title}
        </span>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="font-display text-[13.5px] font-semibold tracking-tight">
            {formatMoney(p.price) || '—'}
            {p.compareAt && (
              <span className="ml-1 text-[10px] font-normal text-dim line-through">
                {formatMoney(p.compareAt)}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!p.available}
            className={cx(
              'flex items-center gap-1 rounded-lg px-2 py-1 font-display text-[10.5px] font-semibold transition-all active:scale-95',
              p.available
                ? 'bg-accent/[0.14] text-accent hover:bg-accent hover:text-[#1c1204]'
                : 'cursor-not-allowed bg-white/[0.05] text-dim/60',
            )}
          >
            <IconBag size={11} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
