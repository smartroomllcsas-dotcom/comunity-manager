/**
 * Rate-limit policy for billing entrypoints.
 *
 * Keep the limits here so the checkout and provider confirmation routes share
 * one auditable policy while the actual counter remains the server-safe
 * implementation in `lib/rate-limit`.
 */
export const BILLING_CHECKOUT_RATE_LIMIT = 10;
export const BILLING_CHECKOUT_RATE_WINDOW_MS = 60_000;

export const EPAYCO_CONFIRMATION_RATE_LIMIT = 120;
export const EPAYCO_CONFIRMATION_RATE_WINDOW_MS = 60_000;

export function checkoutRateLimitKey(userId: string) {
  return `billing-checkout:${userId}`;
}

export function epaycoConfirmationRateLimitKey(ip: string) {
  return `billing-epayco-confirmation:${ip}`;
}
