import type { WahaSession, WahaCreateSessionInput } from "./types";

export class WahaError extends Error {
  status: number;
  body?: string;

  constructor(status: number, body?: string) {
    super(`WAHA API error ${status}${body ? `: ${body}` : ""}`);
    this.name = "WahaError";
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_EVENTS = ["message", "message.any", "message.ack", "session.status"];

interface WahaClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class WahaClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl?: typeof fetch;

  constructor({ baseUrl, apiKey, fetchImpl }: WahaClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Api-Key": this.apiKey,
    };

    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const res = await fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => undefined);
      throw new WahaError(res.status, text);
    }

    return res.json() as Promise<T>;
  }

  async listSessions(): Promise<WahaSession[]> {
    return this.request<WahaSession[]>("GET", "/api/sessions");
  }

  async getSession(name: string): Promise<WahaSession> {
    return this.request<WahaSession>("GET", `/api/sessions/${encodeURIComponent(name)}`);
  }

  async createSession(input: WahaCreateSessionInput): Promise<WahaSession> {
    const { name, webhookUrl, webhookHmacSecret, events = DEFAULT_EVENTS } = input;
    return this.request<WahaSession>("POST", "/api/sessions", {
      name,
      start: true,
      config: {
        webhooks: [
          {
            url: webhookUrl,
            events,
            hmac: { key: webhookHmacSecret },
          },
        ],
      },
    });
  }

  async logout(name: string): Promise<void> {
    await this.request<unknown>("POST", `/api/sessions/${encodeURIComponent(name)}/logout`);
  }

  async deleteSession(name: string): Promise<void> {
    await this.request<unknown>("DELETE", `/api/sessions/${encodeURIComponent(name)}`);
  }

  async getQr(name: string): Promise<{ mimetype: string; data: string }> {
    // WAHA responde PNG binario con format=image (no JSON) — no usar request()
    const url = `${this.baseUrl}/api/${encodeURIComponent(name)}/auth/qr?format=image`;
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const res = await fetchFn(url, {
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => undefined);
      throw new WahaError(res.status, text);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res.json() as Promise<{ mimetype: string; data: string }>;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimetype: contentType || "image/png", data: buf.toString("base64") };
  }

  async sendText({
    session,
    chatId,
    text,
  }: {
    session: string;
    chatId: string;
    text: string;
  }): Promise<unknown> {
    return this.request<unknown>("POST", "/api/sendText", { session, chatId, text });
  }
}

export function wahaFromEnv(): WahaClient {
  const baseUrl = process.env.WAHA_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;

  if (!baseUrl) throw new Error("WAHA_BASE_URL environment variable is not set");
  if (!apiKey) throw new Error("WAHA_API_KEY environment variable is not set");

  return new WahaClient({ baseUrl, apiKey });
}
