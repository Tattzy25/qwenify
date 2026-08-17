/**
 * UCP commerce shapes, normalized for rendering.
 * Merchants bring their own catalogs, so every field here is optional by design —
 * the normalizer fills what it can find and the UI renders what it's given.
 */

export interface MoneyLike {
  amount: number;
  currency: string;
}

export interface ProductCardData {
  /** Best purchasable identifier (variant GID preferred, then product id/handle). */
  id: string;
  title: string;
  brand?: string;
  image?: string;
  price?: MoneyLike;
  compareAt?: MoneyLike;
  available: boolean;
  raw: unknown;
}

export interface CheckoutLineData {
  id?: string;
  title: string;
  image?: string;
  quantity: number;
  price?: MoneyLike;
}

export type CheckoutStatus = 'incomplete' | 'ready' | 'completed' | 'unknown';

export interface CheckoutData {
  id?: string;
  status: CheckoutStatus;
  lines: CheckoutLineData[];
  total?: MoneyLike;
  discountCodes: string[];
  email?: string;
  hasConfirmation: boolean;
}

export interface OrderData {
  id: string;
  total?: MoneyLike;
  status?: string;
}

/** One renderable batch produced from a tool result. */
export type CommerceBatch =
  | { kind: 'products'; label: string; items: ProductCardData[] }
  | { kind: 'checkout'; label: string; checkout: CheckoutData }
  | { kind: 'order'; label: string; order: OrderData };

/* ---------- storefront (Shopify standard events & actions) ---------- */

export interface StorefrontCartLine {
  merchandiseId?: string;
  title?: string;
  quantity: number;
}

export interface StorefrontCart {
  id?: string;
  totalQuantity: number;
  total?: MoneyLike;
  lines: StorefrontCartLine[];
}
