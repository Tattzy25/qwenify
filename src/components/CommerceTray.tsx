import type {
  CheckoutData,
  CommerceBatch,
  OrderData,
  ProductCardData,
} from '../lib/commerce/types';
import { formatMoney } from '../lib/commerce/normalize';
import { cx } from '../lib/utils';
import { IconBag, IconCart, IconCheck, IconImage, IconX } from './icons';

interface Props {
  batch: CommerceBatch;
  capabilities: string[];
  storefront: { detected: boolean; count: number | null };
  onClose: () => void;
  onAddToCart: (p: ProductCardData) => void;
  onAgentSay: (text: string) => void;
  onOpenCart: () => void;
}

const capLabel = (c: string): string =>
  (c.split('.').pop() ?? c).replace(/_/g, ' ');

/* ---------------- product card ---------------- */

function ProductCard({ p, onAdd }: { p: ProductCardData; onAdd: () => void }) {
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
            onClick={onAdd}
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

/* ---------------- checkout card ---------------- */

const STATUS_META: Record<CheckoutData['status'], { label: string; cls: string }> = {
  incomplete: { label: 'In progress', cls: 'bg-cool/[0.14] text-cool' },
  ready: { label: 'Ready for payment', cls: 'bg-accent/[0.16] text-accent' },
  completed: { label: 'Completed', cls: 'bg-live/[0.14] text-live' },
  unknown: { label: 'Checkout', cls: 'bg-white/[0.08] text-dim' },
};

function CheckoutCard({
  c,
  onAgentSay,
  onOpenCart,
  storefrontDetected,
}: {
  c: CheckoutData;
  onAgentSay: (t: string) => void;
  onOpenCart: () => void;
  storefrontDetected: boolean;
}) {
  const meta = STATUS_META[c.status];
  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cx('rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em]', meta.cls)}>
          {meta.label}
        </span>
        {c.id && <span className="truncate font-mono text-[10px] text-dim/80">{c.id.slice(0, 34)}</span>}
      </div>

      {c.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-5 text-center text-[12.5px] text-dim">
          Nothing here yet — tell Halo what you're looking for.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {c.lines.slice(0, 6).map((l, i) => (
            <div key={l.id ?? i} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#0b0d11]">
                {l.image ? (
                  <img src={l.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-dim/50">
                    <IconBag size={13} />
                  </div>
                )}
              </div>
              <span className="line-clamp-1 flex-1 text-[12.5px] font-medium text-ink/92">{l.title}</span>
              <span className="font-mono text-[10.5px] text-dim">×{l.quantity}</span>
              <span className="font-display text-[12.5px] font-semibold">{formatMoney(l.price) || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {c.discountCodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.discountCodes.map((d) => (
            <span key={d} className="rounded-md bg-live/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-live">
              {d}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
          Total{c.email ? ` · ${c.email}` : ''}
        </span>
        <span className="font-display text-[16px] font-bold tracking-tight">{formatMoney(c.total) || '—'}</span>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {c.status === 'incomplete' && (
          <button
            type="button"
            onClick={() =>
              onAgentSay('I want to continue — please collect my email and shipping details for the checkout.')
            }
            className="rounded-lg bg-accent px-3.5 py-1.5 font-display text-[12px] font-semibold text-[#1c1204] transition-all hover:brightness-110 active:scale-95"
          >
            Continue with Halo
          </button>
        )}
        {c.status === 'ready' && (
          <button
            type="button"
            onClick={() => onAgentSay('Everything looks good — please place the order and complete checkout.')}
            className="rounded-lg bg-live px-3.5 py-1.5 font-display text-[12px] font-semibold text-[#05130a] transition-all hover:brightness-110 active:scale-95"
          >
            Place order
          </button>
        )}
        {(c.status === 'completed' || c.hasConfirmation) && storefrontDetected && (
          <button
            type="button"
            onClick={onOpenCart}
            className="flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-1.5 font-display text-[12px] font-semibold text-ink/90 transition-colors hover:bg-white/[0.07]"
          >
            <IconCart size={13} />
            Open cart
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- order card ---------------- */

function OrderCard({ o, onOpenCart, storefrontDetected }: { o: OrderData; onOpenCart: () => void; storefrontDetected: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-1.5 px-2 py-4 text-center">
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-live/[0.14] text-live">
        <IconCheck size={19} strokeWidth={2.2} />
      </span>
      <span className="font-display text-[16px] font-bold tracking-tight">Order {o.id}</span>
      <span className="text-[12.5px] text-dim">
        {formatMoney(o.total) && <span className="font-semibold text-ink/90">{formatMoney(o.total)}</span>}
        {formatMoney(o.total) && o.status ? ' · ' : ''}
        {o.status ?? 'confirmed'}
      </span>
      {storefrontDetected && (
        <button
          type="button"
          onClick={onOpenCart}
          className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-1.5 font-display text-[12px] font-semibold text-ink/90 transition-colors hover:bg-white/[0.07]"
        >
          <IconCart size={13} />
          View in storefront
        </button>
      )}
    </div>
  );
}

/* ---------------- tray ---------------- */

export function CommerceTray({ batch, capabilities, storefront, onClose, onAddToCart, onAgentSay, onOpenCart }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[11vh] z-30 flex justify-center px-3 sm:px-5">
      <div className="anim-pop pointer-events-auto w-full max-w-[900px]">
        <div className="rounded-[18px] border border-white/10 bg-[#101217]/88 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          {/* header */}
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
            <IconBag size={14} className="shrink-0 text-accent" />
            <span className="truncate font-display text-[13.5px] font-semibold tracking-tight">{batch.label}</span>

            {capabilities.length > 0 && (
              <span className="hidden min-[560px]:flex items-center gap-1">
                {capabilities.slice(0, 4).map((c) => (
                  <span key={c} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-dim">
                    {capLabel(c)}
                  </span>
                ))}
              </span>
            )}

            {storefront.detected && storefront.count != null && (
              <button
                type="button"
                onClick={onOpenCart}
                title="Open storefront cart"
                className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-live/[0.1] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-live transition-colors hover:bg-live/[0.18]"
              >
                <IconCart size={11} />
                Cart · {storefront.count}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className={cx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/[0.07] hover:text-ink',
                !storefront.detected || storefront.count == null ? 'ml-auto' : '',
              )}
            >
              <IconX size={14} />
            </button>
          </div>

          {/* body */}
          <div className="slim-scroll max-h-[54vh] overflow-y-auto p-3">
            {batch.kind === 'products' && (
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lap:grid-cols-3">
                {batch.items.map((p, i) => (
                  <ProductCard key={`${p.id}-${i}`} p={p} onAdd={() => onAddToCart(p)} />
                ))}
              </div>
            )}
            {batch.kind === 'checkout' && (
              <CheckoutCard c={batch.checkout} onAgentSay={onAgentSay} onOpenCart={onOpenCart} storefrontDetected={storefront.detected} />
            )}
            {batch.kind === 'order' && (
              <OrderCard o={batch.order} onOpenCart={onOpenCart} storefrontDetected={storefront.detected} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
