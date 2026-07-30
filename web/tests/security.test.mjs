import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  hashPassword,
  verifyPassword,
} from "../src/lib/auth/password.ts";

process.env.EPAYCO_CUSTOMER_ID = "test-customer";
process.env.EPAYCO_P_KEY = "test-p-key";

const {
  amountToMinor,
  hashEpaycoPayload,
  sanitizeEpaycoPayload,
  validateEpaycoSignature,
} = await import("../src/lib/epayco/client.ts");
const {
  createPayUCheckoutSignature,
  createPayUConfirmationSignature,
  createWompiEventSignature,
  createWompiIntegritySignature,
  formatPayUConfirmationValue,
  safeSignatureEqual,
} = await import("../src/lib/payments/signatures.ts");

test("passwords are hashed and can be verified", async () => {
  const encoded = await hashPassword("correct horse battery staple");

  assert.notEqual(encoded, "correct horse battery staple");
  assert.match(encoded, /^\$2[aby]\$/);
  assert.deepEqual(
    await verifyPassword("correct horse battery staple", encoded),
    { ok: true, legacy: false }
  );
  assert.deepEqual(await verifyPassword("wrong password", encoded), {
    ok: false,
    legacy: false,
  });
});

test("legacy plaintext passwords are accepted once and marked for rehash", async () => {
  assert.deepEqual(await verifyPassword("legacy-password", "legacy-password"), {
    ok: true,
    legacy: true,
  });
});

test("ePayco confirmation signature uses SHA-256 and rejects tampering", () => {
  const payload = {
    x_cust_id_cliente: "test-customer",
    x_ref_payco: "ref-100",
    x_transaction_id: "tx-200",
    x_amount: "79000.00",
    x_currency_code: "COP",
    x_signature: createHash("sha256")
      .update("test-customer^test-p-key^ref-100^tx-200^79000.00^COP")
      .digest("hex"),
  };

  assert.equal(validateEpaycoSignature(payload), true);
  assert.equal(
    validateEpaycoSignature({ ...payload, x_amount: "1.00" }),
    false
  );
  assert.equal(
    validateEpaycoSignature({
      ...payload,
      x_cust_id_cliente: "another-customer",
    }),
    false
  );
});

test("money conversion is strict and webhook payloads are sanitized", () => {
  assert.equal(amountToMinor("79000.00"), 7_900_000);
  assert.equal(amountToMinor("1.999"), null);
  assert.equal(amountToMinor("-1"), null);

  const sanitized = sanitizeEpaycoPayload({
    x_transaction_id: "tx-1",
    x_amount: "10.00",
    card_number: "must-not-be-stored",
  });
  assert.deepEqual(sanitized, {
    x_transaction_id: "tx-1",
    x_amount: "10.00",
  });
  assert.equal(
    hashEpaycoPayload({ b: "2", a: "1" }),
    createHash("sha256").update("a=1&b=2").digest("hex")
  );
});

test("Wompi signs checkout integrity and dynamic event properties", () => {
  assert.equal(
    createWompiIntegritySignature({
      reference: "cm_wompi_1",
      amountMinor: 7_900_000,
      currency: "COP",
      expiresAt: "2026-07-29T20:00:00.000Z",
      integritySecret: "integrity-secret",
    }),
    createHash("sha256")
      .update(
        "cm_wompi_17900000COP2026-07-29T20:00:00.000Zintegrity-secret"
      )
      .digest("hex")
  );

  const expected = createHash("sha256")
    .update("tx-1APPROVED1722280000events-secret")
    .digest("hex");
  assert.equal(
    createWompiEventSignature({
      data: { transaction: { id: "tx-1", status: "APPROVED" } },
      properties: ["transaction.id", "transaction.status"],
      timestamp: 1722280000,
      eventsSecret: "events-secret",
    }),
    expected
  );
  assert.equal(safeSignatureEqual(expected, expected.toUpperCase()), true);
  assert.equal(safeSignatureEqual(expected, `${expected}0`), false);
});

test("PayU checkout and confirmation signatures use documented formatting", () => {
  assert.equal(formatPayUConfirmationValue("100.00"), "100.0");
  assert.equal(formatPayUConfirmationValue("100.12"), "100.12");

  assert.equal(
    createPayUCheckoutSignature({
      apiKey: "api-key",
      merchantId: "merchant",
      reference: "sale-1",
      amount: "100.00",
      currency: "COP",
    }),
    createHash("sha256")
      .update("api-key~merchant~sale-1~100.00~COP")
      .digest("hex")
  );
  assert.equal(
    createPayUConfirmationSignature({
      apiKey: "api-key",
      merchantId: "merchant",
      referenceSale: "sale-1",
      value: "100.00",
      currency: "COP",
      statePol: "4",
    }),
    createHash("sha256")
      .update("api-key~merchant~sale-1~100.0~COP~4")
      .digest("hex")
  );
});
