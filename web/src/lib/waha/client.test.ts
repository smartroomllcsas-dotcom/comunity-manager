import { describe, it, expect, vi, beforeEach } from "vitest";
import { WahaClient, WahaError } from "./client";

const BASE_URL = "https://waha.example.com";
const API_KEY = "test-api-key";

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

describe("WahaClient", () => {
  let client: WahaClient;

  beforeEach(() => {
    client = new WahaClient({ baseUrl: BASE_URL, apiKey: API_KEY });
  });

  it("listSessions sends X-Api-Key on every request", async () => {
    const fetchMock = makeFetch(200, []);
    vi.stubGlobal("fetch", fetchMock);

    await client.listSessions();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [_url, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      "X-Api-Key": API_KEY,
    });
  });

  it("createSession POSTs with correct body shape (webhooks + hmac.key)", async () => {
    const fetchMock = makeFetch(200, { name: "brand_test", status: "STARTING" });
    vi.stubGlobal("fetch", fetchMock);

    await client.createSession({
      name: "brand_test",
      webhookUrl: "https://example.com/webhook",
      webhookHmacSecret: "my-secret",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/sessions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe("brand_test");
    expect(body.start).toBe(true);
    expect(body.config.webhooks[0].url).toBe("https://example.com/webhook");
    expect(body.config.webhooks[0].hmac.key).toBe("my-secret");
    expect(Array.isArray(body.config.webhooks[0].events)).toBe(true);
  });

  it("throws WahaError on non-2xx response (500)", async () => {
    const fetchMock = makeFetch(500, { error: "Internal Server Error" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.listSessions()).rejects.toBeInstanceOf(WahaError);
    await expect(client.listSessions()).rejects.toMatchObject({ status: 500 });
  });

  it("getQr returns { mimetype, data }", async () => {
    const qrPayload = { mimetype: "image/png", data: "base64data==" };
    const fetchMock = makeFetch(200, qrPayload);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.getQr("brand_test");
    expect(result).toEqual({ mimetype: "image/png", data: "base64data==" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/brand_test/auth/qr");
  });

  it("sendText POSTs to /api/sendText with correct body", async () => {
    const fetchMock = makeFetch(200, { sent: true });
    vi.stubGlobal("fetch", fetchMock);

    await client.sendText({ session: "brand_test", chatId: "1234@c.us", text: "Hello" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/sendText");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ session: "brand_test", chatId: "1234@c.us", text: "Hello" });
  });
});
