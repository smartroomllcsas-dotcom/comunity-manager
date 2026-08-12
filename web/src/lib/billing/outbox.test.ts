import { describe, expect, it } from "vitest";
import { outboxRetryDelaySeconds } from "./outbox";

describe("billing outbox retry policy", () => {
  it("uses exponential backoff capped at one hour", () => {
    expect(outboxRetryDelaySeconds(0)).toBe(30);
    expect(outboxRetryDelaySeconds(1)).toBe(60);
    expect(outboxRetryDelaySeconds(5)).toBe(960);
    expect(outboxRetryDelaySeconds(99)).toBe(3600);
  });

  it("normalizes invalid attempt counts", () => {
    expect(outboxRetryDelaySeconds(-4)).toBe(30);
    expect(outboxRetryDelaySeconds(2.9)).toBe(120);
  });
});
