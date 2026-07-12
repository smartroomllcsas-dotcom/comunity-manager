import { beforeAll, describe, expect, it } from "vitest";

// Setear la key ANTES de importar el módulo bajo test.
const TEST_KEY = "a".repeat(64); // 32 bytes hex

async function importCrypto() {
  return await import("./token-crypto");
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

describe("encryptToken / decryptToken", () => {
  it("round-trip devuelve el mismo plaintext", async () => {
    const { encryptToken, decryptToken } = await importCrypto();
    const plain = "EAAG-super-secret-page-token-123";
    const ct = encryptToken(plain);
    expect(ct).toMatch(/^v1:/);
    expect(decryptToken(ct)).toBe(plain);
  });

  it("dos cifrados del mismo plaintext dan ciphertexts distintos (IV aleatorio)", async () => {
    const { encryptToken } = await importCrypto();
    const a = encryptToken("hola");
    const b = encryptToken("hola");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1:/);
    expect(b).toMatch(/^v1:/);
  });

  it("encryptToken('') devuelve ''", async () => {
    const { encryptToken } = await importCrypto();
    expect(encryptToken("")).toBe("");
  });

  it("decryptToken de null/undefined/vacío devuelve null", async () => {
    const { decryptToken } = await importCrypto();
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeNull();
    expect(decryptToken("")).toBeNull();
  });

  it("decryptToken sin prefijo v1: devuelve null (asumido legacy plano)", async () => {
    const { decryptToken } = await importCrypto();
    expect(decryptToken("EAAG-legacy-token-123")).toBeNull();
  });

  it("decryptToken con formato malformado no throws — devuelve null", async () => {
    const { decryptToken } = await importCrypto();
    expect(decryptToken("v1:not-base64:x:y")).toBeNull();
    expect(decryptToken("v1:aa:bb")).toBeNull(); // faltan piezas
    expect(decryptToken("v1::::extra")).toBeNull();
  });

  it("decryptToken con auth tag corrupto no throws", async () => {
    const { encryptToken, decryptToken } = await importCrypto();
    const ct = encryptToken("secret");
    const parts = ct.split(":");
    // Corrompemos el ciphertext base64 del final.
    parts[3] = Buffer.from("corrupto").toString("base64");
    const corrupt = parts.join(":");
    expect(decryptToken(corrupt)).toBeNull();
  });
});

describe("resolveToken", () => {
  it("prefiere ciphertext descifrado si es válido", async () => {
    const { encryptToken, resolveToken } = await importCrypto();
    const ct = encryptToken("nuevo-cifrado");
    expect(resolveToken(ct, "legacy-plano")).toBe("nuevo-cifrado");
  });

  it("cae a legacy plano si ciphertext es null", async () => {
    const { resolveToken } = await importCrypto();
    expect(resolveToken(null, "legacy-plano")).toBe("legacy-plano");
  });

  it("cae a legacy plano si ciphertext está corrupto", async () => {
    const { encryptToken, resolveToken } = await importCrypto();
    const ct = encryptToken("nuevo");
    const parts = ct.split(":");
    parts[3] = Buffer.from("corrupto").toString("base64");
    const broken = parts.join(":");
    expect(resolveToken(broken, "legacy-plano")).toBe("legacy-plano");
  });

  it("devuelve null si ambos están vacíos", async () => {
    const { resolveToken } = await importCrypto();
    expect(resolveToken(null, null)).toBeNull();
    expect(resolveToken(undefined, undefined)).toBeNull();
  });

  it("string vacío en legacy cuenta como null", async () => {
    const { resolveToken } = await importCrypto();
    expect(resolveToken(null, "")).toBeNull();
  });
});
