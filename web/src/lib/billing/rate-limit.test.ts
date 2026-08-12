import { describe, expect, it } from "vitest";
import {
  BILLING_CHECKOUT_RATE_LIMIT,
  BILLING_CHECKOUT_RATE_WINDOW_MS,
  EPAYCO_CONFIRMATION_RATE_LIMIT,
  EPAYCO_CONFIRMATION_RATE_WINDOW_MS,
  checkoutRateLimitKey,
  epaycoConfirmationRateLimitKey,
} from "./rate-limit";

describe("billing rate-limit policy", () => {
  it("uses a bounded per-user checkout policy", () => {
    expect(BILLING_CHECKOUT_RATE_LIMIT).toBe(10);
    expect(BILLING_CHECKOUT_RATE_WINDOW_MS).toBe(60_000);
    expect(checkoutRateLimitKey("user-1")).toBe("billing-checkout:user-1");
  });

  it("uses a separate per-IP provider confirmation policy", () => {
    expect(EPAYCO_CONFIRMATION_RATE_LIMIT).toBe(120);
    expect(EPAYCO_CONFIRMATION_RATE_WINDOW_MS).toBe(60_000);
    expect(epaycoConfirmationRateLimitKey("203.0.113.10")).toBe(
      "billing-epayco-confirmation:203.0.113.10",
    );
  });

  it("does not share checkout and provider keys", () => {
    expect(checkoutRateLimitKey("203.0.113.10")).not.toBe(
      epaycoConfirmationRateLimitKey("203.0.113.10"),
    );
  });
});
