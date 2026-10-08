export type OrderSubmitResult =
  | { ok: true; kind: "success"; reference: string; duplicate: boolean }
  | { ok: false; kind: "http" | "network" | "malformed"; status?: number; message: string };

export function defaultStatusMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return "Some order details are invalid. Please review your information.";
    case 409:
      return "Some items are no longer available at the requested quantity. Please adjust your bag.";
    case 422:
      return "The coupon is invalid or has already reached its usage limit.";
    case 429:
      return "Too many attempts. Please wait a minute and try again.";
    case 401:
    case 403:
      return "You are not authorized to complete this order.";
    default:
      return "We could not complete your order. Please try again.";
  }
}

export function parseOrderSubmitResponse(status: number, bodyText: string | null | undefined): OrderSubmitResult {
  const text = typeof bodyText === "string" ? bodyText.trim() : "";
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (status >= 200 && status < 300) {
    const body = (parsed ?? {}) as { publicReference?: unknown; id?: unknown; duplicate?: unknown };
    const reference = body.publicReference || body.id;
    if (typeof reference === "string" && reference.length > 0) {
      return { ok: true, kind: "success", reference, duplicate: status === 200 && Boolean(body.duplicate) };
    }
    return { ok: false, kind: "malformed", status, message: "The server returned an unrecognized response. Please check with us before retrying." };
  }

  const body = parsed as { error?: unknown } | null;
  const message = typeof body?.error === "string" && body.error.trim() ? body.error : defaultStatusMessage(status);
  return { ok: false, kind: "http", status, message };
}

export function createIdempotencyKey(existing?: string, now = Date.now()): string {
  if (existing && existing.trim().length >= 8) return existing.trim();
  return `NN-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export type PaymentValidationResult = { ok: true } | { ok: false; error: string };

export function validatePaymentInput(paymentMethod: string, opts: { transferNumber?: string; receiptKey?: string }): PaymentValidationResult {
  if (paymentMethod === "cod") return { ok: true };
  if (!opts.transferNumber || !opts.transferNumber.trim()) {
    return { ok: false, error: "The transfer number is not configured yet. Please use cash on delivery." };
  }
  if (!opts.receiptKey || !opts.receiptKey.trim()) {
    return { ok: false, error: "Please upload the transfer receipt before confirming your order." };
  }
  return { ok: true };
}

export type OrderConfirmationLine = {
  name: string;
  quantity: number;
  total: number;
  size?: string;
  color?: string;
};

export type OrderConfirmationInput = {
  orderId: string;
  customerName: string;
  phone: string;
  address: string;
  notes?: string;
  paymentLabel: string;
  transferNumber?: string;
  receiptAttached: boolean;
  subtotal: number;
  discountAmount: number;
  shipping: number;
  shippingLabel: string;
  total: number;
  items: OrderConfirmationLine[];
  currency?: string;
};

export function buildOrderConfirmationMessage(input: OrderConfirmationInput): string {
  const currency = input.currency || "EGP";
  const lines = [
    `New order: ${input.orderId}`,
    `Customer: ${input.customerName}`,
    `Phone: ${input.phone}`,
    `Address: ${input.address}`,
    input.notes ? `Notes: ${input.notes}` : "",
    `Payment: ${input.paymentLabel}`,
    input.transferNumber ? `Transfer number: ${input.transferNumber}` : "",
    input.receiptAttached ? "Transfer receipt: attached to the order summary" : "",
    `Subtotal: ${input.subtotal.toLocaleString("en-US")} ${currency}`,
    input.discountAmount > 0 ? `Discount: -${input.discountAmount.toLocaleString("en-US")} ${currency}` : "",
    "Items:",
    ...input.items.map((item) => {
      const variant = item.size && item.color ? ` (${item.size} · ${item.color})` : "";
      return `- ${item.name}${variant} x${item.quantity} — ${item.total.toLocaleString("en-US")} ${currency}`;
    }),
    `Shipping: ${input.shippingLabel}`,
    `Total: ${input.total.toLocaleString("en-US")} ${currency}`,
  ];
  return lines.filter((line) => line).join("\n");
}

export function getWhatsAppUrl(base: string, message: string): string {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(
  url: string,
  open: (targetUrl: string) => boolean = (targetUrl) => {
    try {
      return Boolean(window.open(targetUrl, "_blank", "noopener,noreferrer"));
    } catch {
      return false;
    }
  }
): boolean {
  try {
    return open(url);
  } catch {
    return false;
  }
}