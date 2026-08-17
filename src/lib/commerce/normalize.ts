/**
 * Maps raw MCP/UCP tool results into renderable commerce cards.
 * Every store is different (catalog shapes vary wildly), so this is purely
 * permissive extraction — no throwing, no assumptions, graceful fallbacks.
 */

import type {
  CheckoutData,
  CheckoutLineData,
  CheckoutStatus,
  CommerceBatch,
  MoneyLike,
  OrderData,
  ProductCardData,
} from './types';

type AnyObj = Record<string, unknown>;

const isObj = (v: unknown): v is AnyObj => !!v && typeof v === 'object' && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function pick(obj: AnyObj, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null) return obj[k];
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/* ---------- money ---------- */

export function toMoney(v: unknown, fallbackCurrency?: string): MoneyLike | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return { amount: v, currency: fallbackCurrency ?? 'USD' };
  }
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n)) return undefined;
    return { amount: n, currency: v.match(/[A-Za-z]{3}/)?.[0]?.toUpperCase() ?? fallbackCurrency ?? 'USD' };
  }
  if (!isObj(v)) return undefined;
  const cur =
    str(pick(v, 'currencyCode', 'currency', 'currency_code')) ?? fallbackCurrency ?? 'USD';
  for (const key of ['amount', 'value']) {
    const n = num(v[key]);
    if (n !== undefined) return { amount: n, currency: cur };
  }
  for (const key of ['totalAmount', 'total', 'money']) {
    const nested = toMoney(v[key], cur);
    if (nested) return nested;
  }
  return undefined;
}

export function formatMoney(m?: MoneyLike): string {
  if (!m) return '';
  const code = /^[A-Za-z]{3}$/.test(m.currency) ? m.currency.toUpperCase() : '';
  if (code) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(m.amount);
  }
  return `${m.currency ? `${m.currency} ` : ''}${m.amount.toFixed(2)}`;
}

/* ---------- images ---------- */

function firstImage(...roots: unknown[]): string | undefined {
  for (const r of roots) {
    if (!isObj(r)) continue;
    const cand = pick(r, 'image', 'imageUrl', 'image_url', 'thumbnail', 'featuredImage', 'featured_image', 'picture');
    const direct = str(cand) ?? (isObj(cand) ? str(pick(cand, 'url', 'src')) : undefined);
    if (direct) return direct;
    const first = asArr(pick(r, 'images'))[0];
    const fromArr = str(first) ?? (isObj(first) ? str(pick(first, 'url', 'src')) : undefined);
    if (fromArr) return fromArr;
  }
  return undefined;
}

/* ---------- products ---------- */

function toProduct(p: unknown, i: number): ProductCardData | null {
  if (!isObj(p)) return null;

  const title = str(pick(p, 'title', 'name', 'productName', 'product_title')) ?? `Product ${i + 1}`;
  const image = firstImage(p);

  const brandObj = p.brand;
  const brand =
    str(pick(p, 'vendor', 'brandName', 'brand_name')) ??
    (isObj(brandObj) ? str(pick(brandObj, 'name', 'displayName')) : str(brandObj));

  let price: MoneyLike | undefined;
  if (isObj(p.offers)) {
    const o = p.offers as AnyObj;
    price = toMoney(pick(o, 'price', 'amount'), str(pick(o, 'priceCurrency', 'currency')) ?? 'USD');
  }
  if (!price) price = toMoney(pick(p, 'price', 'salePrice', 'minPrice'));
  if (!price && isObj(p.priceRange)) price = toMoney(pick(p.priceRange as AnyObj, 'minVariantPrice', 'min'));
  const variants = asArr(p.variants);
  if (!price && isObj(variants[0])) price = toMoney(pick(variants[0] as AnyObj, 'price', 'unitPrice'));
  const offersArr = asArr(p.offers);
  if (!price && isObj(offersArr[0])) {
    price = toMoney(pick(offersArr[0] as AnyObj, 'price', 'amount'));
  }

  const compareAt =
    (isObj(p.offers) ? toMoney(pick(p.offers as AnyObj, 'compareAtPrice')) : undefined) ??
    toMoney(pick(p, 'compareAtPrice', 'compare_at_price', 'comparePrice'));

  let available = true;
  const av = str(pick(p, 'availability', 'availabilityStatus', 'stockStatus'));
  if (av) available = !/out|sold|unavail|discontinued/i.test(av);
  else if (typeof p.availableForSale === 'boolean') available = p.availableForSale;
  else if (typeof p.inventoryQuantity === 'number') available = p.inventoryQuantity > 0;

  const variantId =
    (isObj(variants[0]) ? str(pick(variants[0], 'id', 'gid', 'variantId')) : undefined) ??
    str(pick(p, 'variantId', 'defaultVariantId', 'merchandiseId'));
  const id = variantId ?? str(pick(p, 'id', 'productId', 'productID', 'gid', 'handle')) ?? `p-${i}`;

  return { id, title, brand: brand || undefined, image, price, compareAt, available, raw: p };
}

function findProducts(root: AnyObj): AnyObj[] {
  for (const key of ['products', 'results', 'items', 'productResults', 'searchResults']) {
    const v = root[key];
    if (Array.isArray(v) && v.length) return v.filter(isObj);
    if (isObj(v)) {
      const inner = findProducts(v);
      if (inner.length) return inner;
    }
  }
  return [];
}

/* ---------- checkout ---------- */

function toCheckoutLine(l: unknown): CheckoutLineData {
  const line = isObj(l) ? l : {};
  const prod = isObj(line.product) ? line.product : isObj(line.merchandise) ? line.merchandise : line;
  return {
    id: str(pick(line, 'id', 'lineId', 'cartLineId')) ?? undefined,
    title: str(pick(prod, 'title', 'name')) ?? str(pick(line, 'title', 'name')) ?? 'Item',
    image: firstImage(prod, line),
    quantity: num(pick(line, 'quantity', 'qty')) ?? 1,
    price: toMoney(pick(line, 'cost', 'totalPrice', 'linePrice', 'price')),
  };
}

function toCheckout(root: AnyObj): CheckoutData {
  const rawLines = asArr(pick(root, 'lines', 'lineItems', 'items', 'cartLines')).filter(isObj);
  const lines = rawLines.map((l) => toCheckoutLine(l));

  const conf = pick(root, 'orderConfirmation', 'confirmation', 'order');
  const statusRaw = str(pick(root, 'status', 'state', 'checkoutStatus', 'statusName')) ?? '';
  const status: CheckoutStatus =
    /incomplete|draft|open|active/i.test(statusRaw)
      ? 'incomplete'
      : /ready/i.test(statusRaw)
        ? 'ready'
        : /complete/.test(statusRaw.toLowerCase()) || isObj(conf)
          ? 'completed'
          : statusRaw
            ? 'unknown'
            : 'incomplete';

  const total =
    toMoney(pick(root, 'cost', 'total', 'totalPrice', 'grandTotal', 'price')) ??
    toMoney(pick(root, 'totalAmount'));

  const discountCodes = asArr(pick(root, 'discountCodes', 'discounts', 'discountAllocations'))
    .map((d) => (isObj(d) ? str(pick(d, 'code', 'title', 'name')) : str(d)))
    .filter((s): s is string => !!s);

  const email =
    str(root.email) ??
    (isObj(root.buyer) ? str(pick(root.buyer, 'email')) : undefined) ??
    (isObj(root.customer) ? str(pick(root.customer, 'email')) : undefined);

  return {
    id: str(pick(root, 'id', 'checkoutId', 'cartId')) ?? undefined,
    status,
    lines,
    total,
    discountCodes,
    email,
    hasConfirmation: isObj(conf),
  };
}

/* ---------- order ---------- */

function toOrder(root: AnyObj): OrderData {
  const conf = isObj(root.orderConfirmation)
    ? root.orderConfirmation
    : isObj(root.confirmation)
      ? root.confirmation
      : isObj(root.order)
        ? root.order
        : root;
  return {
    id: str(pick(conf, 'orderId', 'orderNumber', 'number', 'name', 'id')) ?? 'order',
    total: toMoney(pick(conf, 'total', 'totalPrice', 'cost', 'price', 'grandTotal')),
    status: str(pick(conf, 'status', 'orderStatus', 'financialStatus', 'state')),
  };
}

/* ---------- dispatch ---------- */

const CHECKOUT_KEYS = ['lines', 'lineItems', 'items', 'cartLines'];

function humanizeLabel(toolName: string): string {
  if (/search|catalog|browse|find|query/i.test(toolName)) return 'Matching products';
  if (/complete|place|confirm/i.test(toolName)) return 'Order confirmed';
  if (/start.?payment/i.test(toolName)) return 'Ready for payment';
  if (/add/i.test(toolName) && /checkout|cart/i.test(toolName)) return 'Added to checkout';
  if (/remove/i.test(toolName)) return 'Checkout updated';
  if (/customer|details|address|shipping|fulfil/i.test(toolName)) return 'Details saved';
  if (/discount/i.test(toolName)) return 'Discount applied';
  if (/checkout|cart/i.test(toolName)) return 'Your checkout';
  const clean = toolName.replace(/_/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function toCommerceBatch(toolName: string, rawText: string): CommerceBatch | null {
  let root: AnyObj | null = null;
  try {
    const parsed: unknown = JSON.parse(rawText);
    root = isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
  if (!root) return null;

  const label = humanizeLabel(toolName);

  if (root.orderConfirmation || root.confirmation || (/complete|place|confirm/i.test(toolName) && (root.orderId || root.orderNumber))) {
    return { kind: 'order', label, order: toOrder(root) };
  }

  const looksLikeCheckout =
    CHECKOUT_KEYS.some((k) => Array.isArray(root![k])) || /checkout|cart|payment|discount|customer|fulfil/i.test(toolName);
  if (looksLikeCheckout) {
    const checkout = toCheckout(root);
    return { kind: 'checkout', label, checkout };
  }

  const products = findProducts(root);
  if (products.length) {
    const items = products
      .slice(0, 9)
      .map((p, i) => toProduct(p, i))
      .filter((p): p is ProductCardData => p !== null);
    if (items.length) return { kind: 'products', label, items };
  }

  return null;
}
