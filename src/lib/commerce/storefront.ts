/**
 * Storefront discovery layer — Shopify Standard Storefront Events & Actions.
 * Listens for `shopify:*` events on document and drives the theme through
 * `Shopify.actions.*` when the storefront runtime is present.
 * https://shopify.dev/docs/api/storefront-events-and-actions
 */

import type { StorefrontCart } from './types';

interface UpdateCartResult {
  cart?: StorefrontCart | null;
  userErrors?: Array<{ message?: string }>;
  warnings?: Array<{ message?: string }>;
}

declare global {
  interface Window {
    Shopify?: {
      routes?: { root?: string };
      actions?: {
        getCart?: () => Promise<{ cart?: StorefrontCart | null }>;
        openCart?: () => Promise<void>;
        updateCart?: (payload: {
          lines: Array<{ merchandiseId: string; quantity: number }>;
        }) => Promise<UpdateCartResult>;
      };
    };
  }
}

export interface StorefrontBridge {
  /** True when the storefront runtime exposes actions. */
  detected: boolean;
  /** Latest mirrored cart, if any. */
  readonly cart: StorefrontCart | null;
  /** Last standard event observed (for status surfaces). */
  readonly lastEvent: string | null;
  /** Adds a line via `Shopify.actions.updateCart`. False when unavailable/rejected. */
  addToCart(merchandiseId: string, quantity?: number): Promise<boolean>;
  /** Opens the cart drawer/page through the storefront. */
  openCart(): void;
}

export function createStorefront(onChange?: () => void): StorefrontBridge {
  let cart: StorefrontCart | null = null;
  let lastEvent: string | null = null;

  const actions = window.Shopify?.actions;

  const adopt = (next: StorefrontCart | null | undefined): void => {
    if (!next || typeof next !== 'object') return;
    cart = {
      ...next,
      totalQuantity: typeof next.totalQuantity === 'number' ? next.totalQuantity : 0,
    };
    onChange?.();
  };

  const listen = (name: string, handler: (e: Event) => void): void => {
    document.addEventListener(name, handler);
  };

  listen('shopify:cart:lines-update', (e) => {
    lastEvent = 'cart:lines-update';
    const detail = (e as CustomEvent).detail as { cart?: StorefrontCart | null } | undefined;
    adopt(detail?.cart ?? (e as unknown as { cart?: StorefrontCart }).cart);
    onChange?.();
  });

  listen('shopify:cart:attributes-update', (e) => {
    lastEvent = 'cart:attributes-update';
    const detail = (e as CustomEvent).detail as { cart?: StorefrontCart | null } | undefined;
    adopt(detail?.cart);
    onChange?.();
  });

  listen('shopify:cart:view', () => {
    lastEvent = 'cart:view';
    onChange?.();
  });

  listen('shopify:product:view', () => {
    lastEvent = 'product:view';
    onChange?.();
  });

  listen('shopify:product:select', () => {
    lastEvent = 'product:select';
    onChange?.();
  });

  listen('shopify:cart:error', () => {
    lastEvent = 'cart:error';
    onChange?.();
  });

  // Seed the mirror when the storefront can tell us its cart.
  actions?.getCart?.()
    .then((r) => adopt(r?.cart))
    .catch(() => undefined);

  return {
    detected: !!actions,
    get cart() {
      return cart;
    },
    get lastEvent() {
      return lastEvent;
    },
    async addToCart(merchandiseId: string, quantity = 1): Promise<boolean> {
      if (!actions?.updateCart || !merchandiseId) return false;
      const res = await actions
        .updateCart({ lines: [{ merchandiseId, quantity }] })
        .catch(() => null);
      if (!res || res.userErrors?.length) return false;
      adopt(res.cart);
      return true;
    },
    openCart(): void {
      void actions?.openCart?.();
    },
  };
}
