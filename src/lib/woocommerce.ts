// Reads orders from a WooCommerce store through its REST API (wc/v3).
// Read-only by design: this file only ever sends GET requests.
import { z } from "zod";

export type WooCredentials = { storeUrl: string; key: string; secret: string };

export type WooErrorKind = "auth" | "redirect" | "not_found" | "unreachable" | "bad_response" | "too_many";

export class WooError extends Error {
  kind: WooErrorKind;

  constructor(kind: WooErrorKind, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.kind = kind;
  }
}

export const WOO_ERROR_MESSAGES: Record<WooErrorKind, string> = {
  auth: "האתר דחה את המפתח. בדקו שהמפתח והסוד הועתקו במלואם ושלמפתח יש הרשאת קריאה.",
  redirect: "כתובת האתר מפנה לכתובת אחרת. הזינו את הכתובת הסופית של האתר (למשל עם או בלי www).",
  not_found: "לא נמצא ממשק WooCommerce בכתובת הזו. בדקו את כתובת האתר ושהתוסף פעיל.",
  unreachable: "האתר לא ענה. ייתכן שהוא לא זמין כרגע; נסו שוב בעוד כמה דקות.",
  bad_response: "האתר החזיר תשובה שלא הצלחנו לקרוא.",
  too_many: "יש יותר מדי הזמנות לקריאה בפעם אחת. קדמו את תאריך תחילת הסנכרון ונסו שוב.",
};

/** For tests against a local stand-in server only. */
const allowLocal = () => process.env.WOOCOMMERCE_ALLOW_LOCAL === "1";

/**
 * The store's origin, or null when the address is not one the server should call:
 * it must be a public https site, not an IP address or an internal host.
 */
export function normalizeStoreUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (allowLocal()) {
    return url.origin;
  }
  const host = url.hostname.toLowerCase();
  const internal =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") ||
    /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[");
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || internal) {
    return null;
  }
  return url.origin;
}

const PER_PAGE = 100;
const MAX_PAGES = 30;
const TIMEOUT_MS = 25_000;

async function wooGet(credentials: WooCredentials, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${credentials.storeUrl}/wp-json/wc/v3/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Basic ${Buffer.from(`${credentials.key}:${credentials.secret}`).toString("base64")}`,
        accept: "application/json",
        "user-agent": "inventory-sync/1.0",
      },
      // The key is never sent on to another host.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new WooError("unreachable");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new WooError("redirect");
  }
  if (response.status === 401 || response.status === 403) {
    throw new WooError("auth");
  }
  if (response.status === 404) {
    throw new WooError("not_found");
  }
  if (!response.ok) {
    throw new WooError(response.status >= 500 ? "unreachable" : "bad_response", `HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new WooError("bad_response");
  }
}

const numeric = z.union([z.number(), z.string()]).transform((value) => Number(value));

const LineItem = z.object({
  id: z.number(),
  name: z.string().nullish(),
  product_id: z.number().nullish(),
  variation_id: z.number().nullish(),
  quantity: numeric,
  sku: z.string().nullish(),
  price: numeric.nullish(),
  meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).nullish(),
});

const Order = z.object({
  id: z.number(),
  status: z.string(),
  date_created_gmt: z.string().nullish(),
  date_modified_gmt: z.string().nullish(),
  line_items: z.array(LineItem).default([]),
  refunds: z.array(z.object({ id: z.number() })).nullish(),
});

const Refund = z.object({ id: z.number(), line_items: z.array(LineItem).default([]) });

type WooOrder = z.infer<typeof Order>;
type WooLineItem = z.infer<typeof LineItem>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new WooError("bad_response", result.error.issues[0]?.path.join("."));
  }
  return result.data;
}

/** WooCommerce prints GMT times without a zone. */
const gmt = (value: string | null | undefined) => (value ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`) : null);

/** Proves the address and the key work, without reading anything of substance. */
export async function checkConnection(credentials: WooCredentials): Promise<void> {
  parse(z.array(z.unknown()), await wooGet(credentials, "orders", { per_page: "1" }));
}

// In these states the goods have left the shelf (WooCommerce itself reduces stock then).
const SOLD_STATUSES = new Set(["processing", "completed", "on-hold"]);

export type WebOrderLine = {
  order_id: number;
  line_id: number;
  /** The SKU, or "#<product id>" for a product that has none. */
  code: string;
  item_name: string | null;
  /** What should be off the shelf for this line right now. */
  net_quantity: number;
  sold_at: string | null;
  unit_price: number | null;
};

/** Units of each order line that were refunded, by the refund's line items. */
function refundedByLine(order: WooOrder, refunds: z.infer<typeof Refund>[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const refund of refunds) {
    for (const item of refund.line_items) {
      const pointer = item.meta_data?.find((meta) => meta.key === "_refunded_item_id")?.value;
      // Older stores do not expose the pointer; the product and variation identify the line then.
      const target =
        order.line_items.find((line) => String(line.id) === String(pointer)) ??
        order.line_items.find(
          (line) => line.product_id === item.product_id && (line.variation_id ?? 0) === (item.variation_id ?? 0),
        );
      if (target) {
        result.set(target.id, (result.get(target.id) ?? 0) + Math.abs(item.quantity));
      }
    }
  }
  return result;
}

function lineCode(item: WooLineItem): string {
  const sku = item.sku?.trim();
  return sku ? sku.slice(0, 64) : `#${item.variation_id || item.product_id || item.id}`;
}

/**
 * Every line of every order that changed since `modifiedAfter` and was created at or
 * after `createdFrom`, with the quantity that should be off the shelf for it now.
 */
export async function readOrderLines(
  credentials: WooCredentials,
  modifiedAfter: Date,
  createdFrom: Date,
): Promise<{ lines: WebOrderLine[]; orders: number }> {
  const orders: WooOrder[] = [];
  for (let page = 1; ; page += 1) {
    if (page > MAX_PAGES) {
      throw new WooError("too_many");
    }
    const batch = parse(
      z.array(Order),
      await wooGet(credentials, "orders", {
        modified_after: modifiedAfter.toISOString().slice(0, 19),
        dates_are_gmt: "true",
        status: "any",
        orderby: "id",
        order: "asc",
        per_page: String(PER_PAGE),
        page: String(page),
      }),
    );
    orders.push(...batch);
    if (batch.length < PER_PAGE) {
      break;
    }
  }

  const lines: WebOrderLine[] = [];
  let counted = 0;
  for (const order of orders) {
    const created = gmt(order.date_created_gmt);
    // Orders from before the connection never touch stock, whatever the store returns.
    if (!created || created < createdFrom) {
      continue;
    }
    counted += 1;
    const sold = SOLD_STATUSES.has(order.status);
    const refunds =
      sold && (order.refunds?.length ?? 0) > 0
        ? parse(z.array(Refund), await wooGet(credentials, `orders/${order.id}/refunds`, { per_page: String(PER_PAGE) }))
        : [];
    const refunded = refundedByLine(order, refunds);
    for (const item of order.line_items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        continue;
      }
      lines.push({
        order_id: order.id,
        line_id: item.id,
        code: lineCode(item),
        item_name: item.name?.slice(0, 200) ?? null,
        net_quantity: sold ? Math.max(0, item.quantity - (refunded.get(item.id) ?? 0)) : 0,
        sold_at: created.toISOString(),
        unit_price: typeof item.price === "number" && Number.isFinite(item.price) ? Math.abs(item.price) : null,
      });
    }
  }
  return { lines, orders: counted };
}
