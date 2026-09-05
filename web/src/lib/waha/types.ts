export type WahaSessionStatus =
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | "STOPPED";

export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  me?: { id: string; pushname?: string };
  engine?: { engine: string; state?: string };
}

export interface WahaCreateSessionInput {
  name: string;
  webhookUrl: string;
  webhookHmacSecret: string;
  events?: string[];
}

export interface WahaMessageEvent {
  id: string;
  timestamp: number;
  event: "message" | "message.any" | "message.ack" | "session.status" | string;
  session: string;
  me?: { id: string; pushname?: string };
  payload: Record<string, unknown>;
}
